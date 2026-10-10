import * as c from '@campsite/contracts';
import type { Clock } from '../ports';
import type { ModelConnections } from '../domain/model';
import { RunnerError, type Fence, type Runs } from '../domain/runs';
import type { FailCode, RunRow } from '../domain/types';
import { sha256Hex } from '../domain/util';
import { buildUserPrompt, extractVista, SYSTEM_PROMPT, type ComposedVista } from './composer';
import { ProviderError, type ModelProvider } from './provider';
import type { Validator } from './validator';

export interface ExecutorDeps { runs: Runs; models: ModelConnections; provider: ModelProvider; validator: Validator; clock: Clock; log?: (event: Record<string, unknown>) => void }
export interface ExecutionOutcome { status: 'READY' | 'SKIPPED' | 'FAILED'; vistaId?: string; revisionId?: string; code?: FailCode; errors?: string[]; repairs: number; durationMs: number }

const EVAL_SYSTEM = 'You decide whether a scheduled channel update is worth a new Vista. Reply with JSON only: {"skip": boolean, "reason": string}. Skip when nothing meaningful changed since the recent Vistas.';

/** Runs one claimed run end-to-end inside the account's runtime: generate → validate → (repair) → stage → submit. */
export class RunExecutor {
  constructor(private readonly d: ExecutorDeps) {}

  async execute(run: RunRow, nodeId: string): Promise<ExecutionOutcome> {
    const fence: Fence = { runId: run.id, attempt: run.attempt, nodeId };
    const started = this.d.clock.now().getTime();
    const log = (event: Record<string, unknown>) => this.d.log?.({ runId: run.id, attempt: run.attempt, ...event });
    let repairs = 0;
    try {
      const job = await this.jobFor(run);
      const profile = c.profiles[job.profile];
      const deadline = started + profile.timeoutSec * 1000;
      const model = await this.d.models.requireForExecution(run.workspace_id);
      const chat = (system: string, user: string, json = false) => this.d.provider.chat({ modelId: model.modelId, apiKey: model.apiKey, system, user, json });

      if ((await this.beat(fence, 'SEARCHING')).cancel) return this.cancelled(fence, started, repairs);
      if (run.trigger === 'scheduled' && job.recent.length > 0) {
        const verdict = await this.evaluate(chat, job);
        log({ step: 'evaluate', skip: verdict.skip, reason: verdict.reason });
        if (verdict.skip) { await this.d.runs.skip(fence); return { status: 'SKIPPED', repairs, durationMs: this.elapsed(started) }; }
      }

      let feedback: string[] | undefined;
      let previousHtml: string | undefined;
      let vista: ComposedVista | null = null;
      let poster: Uint8Array | null = null;
      let validatorDuration: number | null = null;
      for (let round = 0; round <= profile.maxRepair; round++) {
        if (this.d.clock.now().getTime() > deadline) return this.failed(fence, 'TIMEOUT', true, started, repairs, ['deadline exceeded']);
        if ((await this.beat(fence, 'DRAFTING')).cancel) return this.cancelled(fence, started, repairs);
        const user = buildUserPrompt({ prompt: job.prompt, channelBrief: job.channelBrief, recent: job.recent, trigger: run.trigger, repairFeedback: feedback, previousHtml });
        const completion = await chat(SYSTEM_PROMPT, user);
        const extracted = extractVista(completion.text, job.prompt);
        if (!extracted.ok) { feedback = extracted.errors; previousHtml = completion.text.slice(0, 20000); repairs++; log({ step: 'extract', errors: extracted.errors }); continue; }
        if ((await this.beat(fence, 'VERIFYING')).cancel) return this.cancelled(fence, started, repairs);
        const result = await this.d.validator.validate(extracted.vista.html);
        log({ step: 'validate', ok: result.ok, errors: result.errors, motionDelta: result.motionDelta, round });
        if (result.ok) { vista = extracted.vista; poster = result.poster; validatorDuration = result.durationMs; break; }
        feedback = result.errors; previousHtml = extracted.vista.html; repairs++;
      }
      if (!vista || !poster) return this.failed(fence, 'VALIDATION_FAILED', false, started, repairs, feedback);

      const htmlBytes = new TextEncoder().encode(vista.html);
      await this.d.runs.stageFile(fence, 'index.html', htmlBytes, await sha256Hex(htmlBytes));
      await this.d.runs.stageFile(fence, 'poster.png', poster, await sha256Hex(poster));
      const manifest: c.Manifest = {
        schema: 1, title: vista.header.title, summary: vista.header.summary, entry: 'index.html', poster: 'poster.png', aspect: vista.header.aspect,
        durationHintMs: validatorDuration ?? vista.header.durationHintMs,
        files: [{ path: 'index.html', sha256: await sha256Hex(htmlBytes), bytes: htmlBytes.byteLength }, { path: 'poster.png', sha256: await sha256Hex(poster), bytes: poster.byteLength }],
        generator: { runId: run.id, modelId: model.modelId },
        ...(vista.header.features ? { features: vista.header.features } : {}), ...(vista.header.scenes ? { scenes: vista.header.scenes } : {}),
        ...(vista.header.captions ? { captions: vista.header.captions } : {}), ...(vista.header.sources ? { sources: vista.header.sources } : {}),
      };
      const submitted = await this.d.runs.submit(fence, { manifest, usage: { tokensIn: 0, tokensOut: 0, durationMs: this.elapsed(started) } });
      const committed = await this.d.runs.getRow(run.id);
      log({ step: 'submit', revisionId: submitted.revisionId, vistaId: committed?.vista_id });
      return { status: 'READY', vistaId: committed?.vista_id ?? undefined, revisionId: submitted.revisionId, repairs, durationMs: this.elapsed(started) };
    } catch (e) {
      if (e instanceof RunnerError) { log({ step: 'fenced', code: e.code, errors: e.errors }); return { status: 'FAILED', code: 'TOOL_ERROR', errors: e.errors, repairs, durationMs: this.elapsed(started) }; }
      if (e instanceof ProviderError) return this.failed(fence, 'MODEL_ERROR', e.retryable, started, repairs, [e.message]);
      const code: FailCode = (e as { code?: string }).code === 'MODEL_NOT_CONNECTED' ? 'MODEL_ERROR' : 'TOOL_ERROR';
      return this.failed(fence, code, false, started, repairs, [(e as Error).message]);
    }
  }

  private jobFor(run: RunRow) { return this.d.runs.jobView(run.id); }
  private async evaluate(chat: (s: string, u: string, json?: boolean) => Promise<{ text: string }>, job: c.RunnerJob): Promise<{ skip: boolean; reason: string }> {
    try {
      const r = await chat(EVAL_SYSTEM, `Channel brief: ${job.channelBrief}\nThis is a scheduled update.\nRecent Vistas:\n${job.recent.map(x => `- ${x.title}: ${x.summary}`).join('\n')}\nRequest: ${job.prompt}`, true);
      const j = JSON.parse(r.text) as { skip?: boolean; reason?: string };
      return { skip: j.skip === true, reason: j.reason ?? '' };
    } catch { return { skip: false, reason: 'evaluation unavailable; generating' }; }
  }
  private beat(fence: Fence, phase: c.Phase) { return this.d.runs.heartbeat(fence, phase); }
  private elapsed(started: number) { return this.d.clock.now().getTime() - started; }
  private async cancelled(fence: Fence, started: number, repairs: number): Promise<ExecutionOutcome> {
    await this.d.runs.fail(fence, { code: 'CANCELED', retryable: false });
    return { status: 'FAILED', code: 'CANCELED', repairs, durationMs: this.elapsed(started) };
  }
  private async failed(fence: Fence, code: FailCode, retryable: boolean, started: number, repairs: number, errors?: string[]): Promise<ExecutionOutcome> {
    try { await this.d.runs.fail(fence, { code, retryable }); } catch { /* fenced: another attempt owns the run */ }
    return { status: 'FAILED', code, errors, repairs, durationMs: this.elapsed(started) };
  }
}

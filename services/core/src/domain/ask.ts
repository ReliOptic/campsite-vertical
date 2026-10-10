import * as c from '@campsite/contracts';
import type { Db } from '../ports';
import type { Feed } from './feed';
import type { ModelConnections } from './model';
import type { Manifest, Principal } from './types';
import { ApiError, invalid } from './util';
import { ProviderError, type ModelProvider } from '../execution/provider';

const ASK_SYSTEM = 'You answer short questions about one Vista (an agent-made motion graphic) for the person viewing it. Answer in the language of the question, in 2–4 sentences, grounded only in the provided context. If the context does not cover it, say what the Vista does not show and suggest what to look for.';

/** Q5: a short question about the current Vista, answered with the viewer's own model connection. */
export class Asker {
  constructor(private readonly db: Db, private readonly feed: Feed, private readonly models: ModelConnections, private readonly provider: ModelProvider) {}

  async ask(p: Principal, input: unknown): Promise<c.AskResponse> {
    const parsed = c.AskRequest.safeParse(input);
    if (!parsed.success) throw invalid('bad ask');
    const { vista, revision } = await this.feed.accessible(p, parsed.data.vistaId);
    const model = await this.models.requireForExecution(p.workspaceId);
    const manifest = JSON.parse(revision.manifest_json) as Manifest;
    const ch = await this.db.first<{ brief: string; title: string }>('SELECT brief, title FROM channels WHERE id = ?', [vista.channel_id]);
    const context = [
      `Title: ${manifest.title}`, `Summary: ${manifest.summary}`, ch ? `Channel: ${ch.title} — ${ch.brief}` : '',
      manifest.scenes?.length ? `Scenes: ${manifest.scenes.map(s => s.label).join(' → ')}` : '',
      manifest.captions?.length ? `Captions: ${manifest.captions.map(x => x.text).join(' / ')}` : '',
      manifest.sources?.length ? `Sources: ${manifest.sources.map(s => s.label).join('; ')}` : '',
    ].filter(Boolean).join('\n');
    if (this.provider.name === 'stub') return { answer: `이 Vista(${manifest.title})는 "${manifest.summary}"을 다룹니다. 질문하신 "${parsed.data.question}"에 대한 직접 근거는 ${manifest.sources?.[0]?.label ?? '본문'}을 확인해 주세요.`, modelId: 'stub' };
    try {
      const r = await this.provider.chat({ modelId: model.modelId, apiKey: model.apiKey, system: ASK_SYSTEM, user: `${context}\n\nQuestion: ${parsed.data.question}`, maxTokens: 400, temperature: 0.3 });
      return c.AskResponse.parse({ answer: r.text.trim().slice(0, 4000), modelId: r.modelId });
    } catch (e) {
      if (e instanceof ProviderError && e.status === 401) throw new ApiError('INVALID_KEY', 400);
      throw new ApiError('RUN_FAILED', 502);
    }
  }
}

import { pickReference } from './kit/references';
import { shimTag } from './kit/shim';

export interface ChatRequest { modelId: string; apiKey: string; system: string; user: string; maxTokens?: number; temperature?: number; json?: boolean }
export interface ChatResult { text: string; tokensIn: number; tokensOut: number; modelId: string }
export class ProviderError extends Error { constructor(message: string, readonly retryable: boolean, readonly status?: number) { super(message); } }
export interface ModelProvider { readonly name: string; chat(req: ChatRequest): Promise<ChatResult> }

/** OpenRouter chat completions over fetch. The key comes from the user's BYOK and is only used here. */
export class OpenRouterProvider implements ModelProvider {
  readonly name = 'openrouter';
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch, private readonly referer = 'https://campsite.app') {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}`, 'HTTP-Referer': this.referer, 'X-Title': 'Campsite' },
        body: JSON.stringify({ model: req.modelId, max_tokens: req.maxTokens ?? 12000, temperature: req.temperature ?? 0.7, messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }], ...(req.json ? { response_format: { type: 'json_object' } } : {}) }),
      });
    } catch (e) { throw new ProviderError(`network: ${(e as Error).message}`, true); }
    if (!res.ok) {
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      throw new ProviderError(`openrouter ${res.status}`, retryable, res.status);
    }
    const body = await res.json() as { choices?: { message?: { content?: string | { text?: string }[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string; error?: { message?: string } };
    if (body.error) throw new ProviderError(body.error.message ?? 'provider error', false);
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(p => p.text ?? '').join('') : '';
    if (!text) throw new ProviderError('empty completion', true);
    return { text, tokensIn: body.usage?.prompt_tokens ?? 0, tokensOut: body.usage?.completion_tokens ?? 0, modelId: body.model ?? req.modelId };
  }
}

export interface StubOptions { skipScheduled?: boolean; broken?: 'network' | 'static' | 'none'; breakOnce?: boolean }
/** Deterministic provider for local verification: returns a reference Vista chosen by prompt keywords. */
export class StubProvider implements ModelProvider {
  readonly name = 'stub';
  private calls = 0;
  constructor(private readonly opts: StubOptions = {}) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls++;
    if (req.json) {
      const skip = !!this.opts.skipScheduled && /scheduled update/i.test(req.user);
      return { text: JSON.stringify({ skip, reason: skip ? 'no meaningful change in stub mode' : 'first or manual run' }), tokensIn: 10, tokensOut: 5, modelId: 'stub' };
    }
    const ref = pickReference(req.user);
    let html = ref.html.replace('{{SHIM}}', shimTag());
    const breakNow = this.opts.broken && this.opts.broken !== 'none' && (!this.opts.breakOnce || this.calls === 1);
    if (breakNow && this.opts.broken === 'network') html = html.replace('</body>', '<script>fetch("https://example.com/x")</script></body>');
    if (breakNow && this.opts.broken === 'static') html = html.replace('</body>', '<script>eval("1")</script></body>');
    return { text: html, tokensIn: 100, tokensOut: 2000, modelId: 'stub' };
  }
}

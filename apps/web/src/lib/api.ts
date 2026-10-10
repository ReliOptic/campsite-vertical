import * as c from '@campsite/contracts';
import type { z } from 'zod/v4';

export class ApiFailure extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }

async function request<T>(method: string, path: string, schema: z.ZodType<T> | null, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, credentials: 'include', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new ApiFailure('NETWORK', 0); }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiFailure((data?.error?.code as string) ?? 'INTERNAL', res.status);
  return schema ? schema.parse(data) : (data as T);
}

const idem = () => `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const api = {
  authOptions: () => request('GET', '/auth/options', c.AuthOptions),
  devLogin: (email: string, name: string) => request('POST', '/auth/dev/login', c.MeResponse, { email, name }),
  logout: () => request<void>('POST', '/auth/logout', null),
  me: () => request('GET', '/api/me', c.MeResponse),
  runtime: () => request('GET', '/api/runtime', c.RuntimeResponse),
  model: () => request('GET', '/api/model', c.ModelResponse),
  connectModel: (apiKey: string, modelId?: string) => request('POST', '/api/model', c.ModelResponse, { provider: 'openrouter', apiKey, ...(modelId ? { modelId } : {}), verify: true }),
  disconnectModel: () => request('DELETE', '/api/model', c.ModelResponse),
  channels: () => request('GET', '/api/channels', c.ChannelsResponse),
  createChannel: (brief: string, intervalMin?: number, key = idem()) => request('POST', '/api/channels', c.CreateChannelResponse, { brief, ...(intervalMin ? { intervalMin } : {}) }, { 'Idempotency-Key': key }),
  updateChannel: (id: string, patch: c.UpdateChannel) => request('PATCH', `/api/channels/${id}`, c.Channel, patch),
  createRun: (channelId: string, prompt: string) => request('POST', '/api/runs', c.CreateRunResponse, { channelId, prompt }),
  run: (id: string) => request('GET', `/api/runs/${id}`, c.RunResponse),
  cancelRun: (id: string) => request('POST', `/api/runs/${id}/cancel`, c.RunResponse),
  feed: (cursor?: string | null) => request('GET', `/api/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, c.FeedResponse),
  discovery: (cursor?: string | null) => request('GET', `/api/discovery${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, c.DiscoveryResponse),
  vista: (id: string) => request('GET', `/api/vistas/${id}`, c.VistaResponse),
  publish: (id: string) => request('POST', `/api/vistas/${id}/publish`, c.PublishResponse),
  unpublish: (id: string) => request('DELETE', `/api/vistas/${id}/publish`, c.VistaResponse),
  state: (id: string) => request('GET', `/api/vistas/${id}/state`, c.VistaStateResponse),
  commitState: (id: string, body: c.CommitState) => request('PUT', `/api/vistas/${id}/state`, c.CommitStateResponse, body),
  subscriptions: () => request('GET', '/api/subscriptions', c.SubscriptionsResponse),
  subscribe: (channelId: string) => request('POST', '/api/subscriptions', c.SubscriptionsResponse, { channelId }),
  unsubscribe: (channelId: string) => request('DELETE', `/api/subscriptions/${channelId}`, c.SubscriptionsResponse),
  fork: (vistaId: string, rerun: boolean) => request('POST', '/api/forks', c.ForkResponse, { vistaId, rerun }),
  ask: (vistaId: string, question: string) => request('POST', '/api/ask', c.AskResponse, { vistaId, question }),
};
export type Api = typeof api;

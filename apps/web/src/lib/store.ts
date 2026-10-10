import { useSyncExternalStore } from 'react';
import type * as c from '@campsite/contracts';
import { api, ApiFailure } from './api';
import { copy, errorCopy } from '../copy';

export type Mode = 'forMe' | 'discovery';
export type Device = 'iphone' | 'duoClosed' | 'duoOpen' | 'none';
export type Sheet = { kind: 'model' } | { kind: 'prompt' } | { kind: 'ask'; vistaId: string } | { kind: 'profile' } | { kind: 'deepDive'; vistaId: string } | null;
export interface RunState { runId: string; channelId: string; status: c.RunStatus; phase: c.Phase; error?: c.FailCode; vistaId?: string; prompt: string; seenAt: number }

export interface State {
  session: 'loading' | 'anon' | c.MeResponse;
  authOptions: c.AuthOptions | null;
  mode: Mode; device: Device;
  channels: c.Channel[]; feed: c.FeedItem[]; discovery: c.DiscoveryItem[]; subscriptions: c.Subscription[];
  runs: Record<string, RunState>;
  vistas: Record<string, c.VistaResponse>;
  current: { channelId: string | null; vistaId: string | null };
  discoveryIndex: number;
  sheet: Sheet; closingSheet: Sheet;
  toast: string | null; receipt: string | null;
  askAnswer: { vistaId: string; question: string; answer: string } | null;
  forked: Record<string, string>; // origin vistaId → my vistaId
}

type Listener = () => void;
const initial: State = { session: 'loading', authOptions: null, mode: 'forMe', device: deviceFromUrl(), channels: [], feed: [], discovery: [], subscriptions: [], runs: {}, vistas: {}, current: { channelId: null, vistaId: null }, discoveryIndex: 0, sheet: null, closingSheet: null, toast: null, receipt: null, askAnswer: null, forked: {} };

function deviceFromUrl(): Device {
  try { const d = new URLSearchParams(location.search).get('device'); if (d === 'iphone' || d === 'duoClosed' || d === 'duoOpen' || d === 'none') return d; } catch { /* ssr */ }
  return 'iphone';
}

class Store {
  private state: State = initial;
  private listeners = new Set<Listener>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.state;
  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }
  get s() { return this.state; }

  // ---- boot / auth ------------------------------------------------------------
  async boot() {
    try { this.set({ authOptions: await api.authOptions() }); } catch { /* keep null */ }
    try { const me = await api.me(); await this.enter(me); }
    catch (e) { if (e instanceof ApiFailure && e.status === 401) this.set({ session: 'anon' }); else { this.set({ session: 'anon' }); this.toast(errorCopy((e as ApiFailure).code ?? 'NETWORK')); } }
  }
  async devLogin(email: string, name: string) { try { await this.enter(await api.devLogin(email, name)); } catch (e) { this.fail(e); } }
  private async enter(me: c.MeResponse) {
    this.set({ session: me });
    await this.refresh();
    if (!me.model.connected) this.openSheet({ kind: 'model' });
    else if (this.state.channels.length === 0) this.openSheet({ kind: 'prompt' });
    this.startPolling();
  }
  async logout() {
    try { await api.logout(); } catch { /* ignore */ }
    this.stopPolling();
    this.set({ ...initial, device: this.state.device, session: 'anon', authOptions: this.state.authOptions });
  }

  // ---- data ------------------------------------------------------------------
  async refresh() {
    const [channels, feed, subs] = await Promise.all([api.channels(), api.feed(), api.subscriptions().catch(() => ({ items: [] }))]);
    const current = this.state.current;
    const channelId = current.channelId && channels.items.some(ch => ch.id === current.channelId) ? current.channelId : channels.items[0]?.id ?? null;
    const inChannel = feed.items.filter(i => i.channelId === channelId);
    const vistaId = current.vistaId && inChannel.some(i => i.vistaId === current.vistaId) ? current.vistaId : inChannel[0]?.vistaId ?? null;
    this.set({ channels: channels.items, feed: feed.items, subscriptions: subs.items, current: { channelId, vistaId } });
    if (this.state.mode === 'discovery') await this.loadDiscovery();
  }
  async loadDiscovery() {
    try { const d = await api.discovery(); this.set(s => ({ discovery: d.items, discoveryIndex: Math.min(s.discoveryIndex, Math.max(0, d.items.length - 1)) })); } catch (e) { this.fail(e); }
  }
  async refreshMe() { try { this.set({ session: await api.me() }); } catch { /* ignore */ } }
  async vista(id: string): Promise<c.VistaResponse | null> {
    const cached = this.state.vistas[id];
    if (cached && new Date(cached.expiresAt).getTime() - Date.now() > 60_000) return cached;
    try { const v = await api.vista(id); this.set(s => ({ vistas: { ...s.vistas, [id]: v } })); return v; } catch (e) { this.fail(e); return null; }
  }

  // ---- model -------------------------------------------------------------------
  async connectModel(apiKey: string, modelId?: string): Promise<boolean> {
    try { await api.connectModel(apiKey, modelId); await this.refreshMe(); this.closeSheet(); if (this.state.channels.length === 0) this.openSheet({ kind: 'prompt' }); return true; }
    catch (e) { this.fail(e); return false; }
  }
  async disconnectModel() { try { await api.disconnectModel(); await this.refreshMe(); } catch (e) { this.fail(e); } }

  // ---- create ------------------------------------------------------------------
  async createChannel(brief: string, intervalMin?: number): Promise<boolean> {
    try {
      const res = await api.createChannel(brief, intervalMin);
      this.closeSheet();
      this.track({ runId: res.runId, channelId: res.channelId, status: 'QUEUED', phase: 'QUEUED', prompt: brief, seenAt: Date.now() });
      await this.refresh();
      this.set({ current: { channelId: res.channelId, vistaId: null } });
      this.receipt(copy.status.QUEUED);
      return true;
    } catch (e) { this.fail(e); return false; }
  }
  async retry(run: RunState) {
    try { const res = await api.createRun(run.channelId, run.prompt); this.track({ ...run, runId: res.runId, status: 'QUEUED', phase: 'QUEUED', error: undefined, seenAt: Date.now() }); } catch (e) { this.fail(e); }
  }
  private track(run: RunState) { this.set(s => ({ runs: { ...s.runs, [run.runId]: run } })); }
  private startPolling() { if (!this.pollTimer) this.pollTimer = setInterval(() => void this.poll(), 2000); }
  private stopPolling() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }
  private async poll() {
    const active = Object.values(this.state.runs).filter(r => !['READY', 'FAILED', 'SKIPPED'].includes(r.status));
    for (const r of active) {
      try {
        const res = await api.run(r.runId);
        const next: RunState = { ...r, status: res.status, phase: res.phase, error: res.error, vistaId: res.vistaId };
        this.track(next);
        if (res.status === 'READY') { await this.refresh(); await this.refreshMe(); this.set({ current: { channelId: r.channelId, vistaId: res.vistaId ?? null } }); this.receipt(copy.status.DONE); }
        else if (res.status === 'FAILED' || res.status === 'SKIPPED') { await this.refreshMe(); }
      } catch { /* transient */ }
    }
    // Scheduled runs happen without us; refresh the feed occasionally so new episodes appear.
    if (active.length === 0 && Date.now() % 20000 < 2000) await this.refresh().catch(() => undefined);
  }

  // ---- navigation ------------------------------------------------------------------
  selectChannel(channelId: string) {
    const inChannel = this.state.feed.filter(i => i.channelId === channelId);
    this.set({ current: { channelId, vistaId: inChannel[0]?.vistaId ?? null } });
  }
  stepVista(delta: number) {
    const { channelId, vistaId } = this.state.current;
    const inChannel = this.state.feed.filter(i => i.channelId === channelId);
    const idx = inChannel.findIndex(i => i.vistaId === vistaId);
    const next = inChannel[idx + delta];
    if (next) this.set({ current: { channelId, vistaId: next.vistaId } });
  }
  stepDiscovery(delta: number) { this.set(s => ({ discoveryIndex: Math.max(0, Math.min(s.discovery.length - 1, s.discoveryIndex + delta)) })); }
  setMode(mode: Mode) { this.set({ mode }); if (mode === 'discovery') void this.loadDiscovery(); }
  setDevice(device: Device) { this.set({ device }); try { const u = new URL(location.href); u.searchParams.set('device', device); history.replaceState(null, '', u); } catch { /* ignore */ } }

  // ---- social ---------------------------------------------------------------------
  async publish(vistaId: string) { try { await api.publish(vistaId); await this.refresh(); this.set(s => ({ vistas: { ...s.vistas, [vistaId]: { ...s.vistas[vistaId], published: true } } })); this.receipt(copy.forMe.published); } catch (e) { this.fail(e); } }
  async unpublish(vistaId: string) { try { const v = await api.unpublish(vistaId); await this.refresh(); this.set(s => ({ vistas: { ...s.vistas, [vistaId]: v } })); } catch (e) { this.fail(e); } }
  async toggleSubscribe(channelId: string, subscribed: boolean) {
    try { const subs = subscribed ? await api.unsubscribe(channelId) : await api.subscribe(channelId); this.set(s => ({ subscriptions: subs.items, discovery: s.discovery.map(d => d.channelId === channelId ? { ...d, subscribed: !subscribed } : d) })); this.receipt(subscribed ? copy.discovery.unsubscribe : copy.discovery.subscribed); }
    catch (e) { this.fail(e); }
  }
  async fork(vistaId: string) {
    try {
      const res = await api.fork(vistaId, true);
      this.set(s => ({ forked: { ...s.forked, [vistaId]: res.vistaId }, discovery: s.discovery.map(d => d.vistaId === vistaId ? { ...d, forkCount: d.forkCount + 1 } : d) }));
      if (res.runId) this.track({ runId: res.runId, channelId: res.channelId, status: 'QUEUED', phase: 'QUEUED', prompt: '', seenAt: Date.now() });
      await this.refresh(); await this.refreshMe();
      this.receipt(copy.discovery.forked);
    } catch (e) { this.fail(e); }
  }
  async ask(vistaId: string, question: string) {
    this.set({ askAnswer: { vistaId, question, answer: '' } });
    try { const r = await api.ask(vistaId, question); this.set({ askAnswer: { vistaId, question, answer: r.answer } }); }
    catch (e) { this.set({ askAnswer: null }); this.fail(e); }
  }

  // ---- sheets / feedback ----------------------------------------------------------
  openSheet(sheet: Sheet) { this.set({ sheet, closingSheet: null, askAnswer: sheet?.kind === 'ask' ? null : this.state.askAnswer }); }
  closeSheet() { const sheet = this.state.sheet; if (!sheet) return; this.set({ sheet: null, closingSheet: sheet }); setTimeout(() => { if (this.state.closingSheet === sheet) this.set({ closingSheet: null }); }, 260); }
  toast(text: string) { this.set({ toast: text }); setTimeout(() => { if (this.state.toast === text) this.set({ toast: null }); }, 2600); }
  receipt(text: string) { setTimeout(() => { this.set({ receipt: text }); setTimeout(() => { if (this.state.receipt === text) this.set({ receipt: null }); }, 2400); }, 160); }
  private fail(e: unknown) {
    const code = e instanceof ApiFailure ? e.code : 'INTERNAL';
    if (code === 'UNAUTHENTICATED') { this.set({ session: 'anon' }); return; }
    const me = this.state.session;
    const vars: Record<string, string | number> = typeof me === 'object' ? { max: me.usage.channels.max } : {};
    this.toast(errorCopy(code, vars));
  }
}

export const store = new Store();
export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(store.getSnapshot()));
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuMic, LuCompass, LuGitFork, LuPlus, LuPlay, LuPause, LuRotateCcw, LuEllipsis, LuBellPlus, LuBellRing, LuArrowUpRight } from 'react-icons/lu';
import type * as c from '@campsite/contracts';
import { copy, fill, phaseCopy } from '../../copy';
import { store, useStore, type RunState } from '../../lib/store';
import { useVistaState } from '../../lib/vista-state';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Logo } from '../ui/logo';
import { useLayout } from './device';
import { VistaFrame, type VistaFrameHandle } from './vista-frame';
import { AskSheet, DeepDiveSheet, ModelSheet, ProfileSheet, PromptSheet } from './sheets';

// ---------------------------------------------------------------------------------------------------
// Landing (logged out): a plain homepage. Nothing about the product's machinery is on it.
export function Landing() {
  const opts = useStore(s => s.authOptions);
  return (
    <div className="screen flex flex-col items-center justify-center px-8 text-center">
      <Logo size={56} />
      <h1 className="mt-6 text-[30px] font-semibold leading-[36px] tracking-[-0.03em]">Campsite</h1>
      <p className="mt-3 max-w-[280px] text-[16px] leading-[24px] text-muted">{copy.landing.lead}</p>
      <div className="mt-10 flex w-full max-w-[300px] flex-col gap-2">
        <Button size="lg" onClick={() => { location.href = '/auth/google/start'; }} disabled={!opts?.google} data-testid="google-login">{copy.landing.google}</Button>
        {opts?.dev && (
          <div className="mt-6 rounded-[20px] border border-stone p-4 text-left">
            <p className="text-[13px] font-medium">{copy.landing.devTitle}</p>
            <p className="mt-1 text-[12px] text-muted">{copy.landing.devHint}</p>
            <div className="mt-3 flex gap-2">
              {opts.devAccounts.map(a => <Button key={a.email} variant="outline" size="sm" className="flex-1" onClick={() => void store.devLogin(a.email, a.name)} data-testid={`dev-login-${a.name.toLowerCase()}`}>{a.name}</Button>)}
            </div>
          </div>
        )}
      </div>
      <p className="absolute bottom-8 text-[12px] tracking-[0.02em] text-muted">{copy.tagline}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
function ModePill() {
  const mode = useStore(s => s.mode);
  return (
    <div className="flex h-10 items-center rounded-pill bg-paper/85 p-1 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md" role="tablist" aria-label="mode">
      {(['forMe', 'discovery'] as const).map(m => (
        <button key={m} role="tab" aria-selected={mode === m} data-testid={`mode-${m}`} onClick={() => store.setMode(m)}
          className={`h-8 rounded-pill px-4 text-[14px] font-medium transition-[background-color,color] duration-[180ms] ${mode === m ? 'bg-ink text-paper' : 'text-ink/70'}`}>{copy.mode[m]}</button>
      ))}
    </div>
  );
}

function TopBar({ right }: { right: ReactNode }) {
  const layout = useLayout();
  // Host controls never straddle the hinge: on an open Duo they live over the content pane (right).
  return (
    <div className="pointer-events-none absolute right-0 z-20 flex items-center justify-between px-4" style={{ top: layout.safeTop + 6, left: layout.hinge ? layout.hinge[1] : 0 }}>
      <div className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-pill bg-paper/85 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md"><Logo size={22} /></div>
      <div className="pointer-events-auto"><ModePill /></div>
      <div className="pointer-events-auto flex items-center gap-2">{right}</div>
    </div>
  );
}

function Receipt() {
  const receipt = useStore(s => s.receipt);
  const layout = useLayout();
  if (!receipt) return null;
  const left = layout.hinge ? layout.hinge[1] + (layout.width - layout.hinge[1]) / 2 : layout.width / 2;
  return <div className="receipt-enter pointer-events-none absolute z-20 -translate-x-1/2 rounded-pill bg-ink px-4 py-2 text-[13px] text-paper" style={{ top: layout.safeTop + 54, left }} data-testid="receipt" role="status">{receipt}</div>;
}
function Toast() {
  const toast = useStore(s => s.toast);
  const layout = useLayout();
  if (!toast) return null;
  return <div className="receipt-enter absolute left-1/2 z-50 -translate-x-1/2 rounded-[14px] bg-ink px-4 py-3 text-[14px] text-paper shadow-lg" style={{ bottom: layout.safeBottom + 96 }} role="alert" data-testid="toast">{toast}</div>;
}

function StatusLine({ run, onRetry }: { run: RunState | null; onRetry: () => void }) {
  if (!run) return null;
  if (run.status === 'FAILED') return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-8 text-center" data-testid="status-failed">
      <p className="text-[17px] text-ink">{copy.status.FAILED}</p>
      <Button variant="outline" onClick={onRetry}>{copy.status.retry}</Button>
    </div>
  );
  if (run.status === 'READY' || run.status === 'SKIPPED') return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" data-testid="status-line" data-phase={run.phase}>
      <span className="relative flex h-16 w-16 items-center justify-center"><span className="pulse-dot absolute inset-0 rounded-pill bg-sky" /><span className="h-5 w-5 rounded-pill bg-ink" /></span>
      <p className="text-[17px] text-ink">{phaseCopy(run.phase)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
/** Where the Vista lives. Closed: full screen. Duo open: right pane, same iframe (no remount), left pane gets controls. */
interface StageProps { vista: c.VistaResponse | null; owned: boolean; children?: ReactNode; emptyText?: string; run?: RunState | null; onSwipe?: (dir: 1 | -1) => void; onRetry?: () => void }
function VistaStage({ vista, owned, emptyText, run, onSwipe, onRetry }: StageProps) {
  const layout = useLayout();
  const frame = useRef<VistaFrameHandle>(null);
  const vs = useVistaState(vista?.vistaId ?? null);
  const [playing, setPlaying] = useState(true);
  const [scene, setScene] = useState<string | null>(null);
  const touchY = useRef<number | null>(null);
  const wheelLock = useRef(0);
  useEffect(() => { setScene(null); setPlaying(true); }, [vista?.vistaId]);
  const open = !!layout.hinge;
  const rect = open ? { left: layout.hinge![1], top: 0, width: layout.width - layout.hinge![1], height: layout.height } : { left: 0, top: 0, width: layout.width, height: layout.height };
  const onScene = useCallback((id: string) => setScene(id), []);
  const onState = useCallback((s: c.SemanticState) => { vs.onState({ ...s, fold: open ? 'open' : 'closed' }); if (typeof s.scene === 'string') setScene(s.scene); }, [vs.onState, open]);
  const swipeHandlers = {
    onTouchStart: (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; },
    onTouchEnd: (e: React.TouchEvent) => { if (touchY.current == null) return; const dy = e.changedTouches[0].clientY - touchY.current; touchY.current = null; if (Math.abs(dy) > 60) onSwipe?.(dy < 0 ? 1 : -1); },
    onWheel: (e: React.WheelEvent) => { const now = Date.now(); if (now - wheelLock.current < 500 || Math.abs(e.deltaY) < 30) return; wheelLock.current = now; onSwipe?.(e.deltaY > 0 ? 1 : -1); },
  };
  return (
    <>
      <div className="relayout absolute" style={rect} {...swipeHandlers} data-testid="vista-stage">
        {vista ? <VistaFrame key={vista.vistaId} ref={frame} vista={vista} active={playing} style={{ inset: 0 }} initialState={vs.initial} onState={onState} onScene={onScene} /> : (
          <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[17px] text-muted" data-testid="empty-state">{run ? null : emptyText}</div>
        )}
        <StatusLine run={run ?? null} onRetry={() => onRetry?.()} />
      </div>
      {open && (
        <aside className="relayout absolute flex flex-col bg-snow" style={{ left: 0, top: 0, width: layout.hinge![0], height: layout.height, paddingTop: layout.safeTop + 64, paddingBottom: layout.safeBottom + 20 }} data-testid="duo-left-pane">
          {vista ? (
            <div className="flex min-h-0 flex-1 flex-col px-6">
              <h2 className="text-[26px] font-semibold leading-[32px] tracking-[-0.03em]">{vista.title}</h2>
              <p className="mt-2 text-[15px] leading-[22px] text-muted">{vista.summary}</p>
              <div className="mt-5 flex items-center gap-2">
                <Button size="icon" variant="solid" aria-label={playing ? copy.forMe.pause : copy.forMe.play} onClick={() => { setPlaying(p => !p); }} data-testid="duo-playpause">{playing ? <LuPause size={18} /> : <LuPlay size={18} />}</Button>
                <Button size="icon" variant="outline" aria-label={copy.forMe.restart} onClick={() => { frame.current?.restart(); setPlaying(true); }}><LuRotateCcw size={18} /></Button>
                {owned && <Button variant={vista.published ? 'outline' : 'solid'} size="md" onClick={() => vista.published ? store.unpublish(vista.vistaId) : store.publish(vista.vistaId)} data-testid="duo-publish">{vista.published ? copy.forMe.published : copy.forMe.publish}</Button>}
              </div>
              {vista.scenes && vista.scenes.length > 0 && (
                <div className="mt-6">
                  <p className="text-[12px] text-muted">{copy.forMe.scenes}</p>
                  <ol className="mt-2 flex flex-col gap-1">
                    {vista.scenes.map(s => <li key={s.id}><button type="button" onClick={() => { frame.current?.scene(s.id); setScene(s.id); setPlaying(true); }} className={`w-full rounded-[12px] px-3 py-2 text-left text-[15px] ${scene === s.id ? 'bg-ink text-paper' : 'hover:bg-mist'}`} data-testid={`scene-${s.id}`}>{s.label}<span className="float-right text-[12px] opacity-60">{Math.round(s.atMs / 1000)}s</span></button></li>)}
                  </ol>
                </div>
              )}
              {vista.captions && vista.captions.length > 0 && (
                <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
                  <p className="text-[12px] text-muted">{copy.forMe.captions}</p>
                  <ul className="mt-2 flex flex-col gap-2 text-[15px] leading-[22px]">{vista.captions.map((cp, i) => <li key={i} className="flex gap-3"><span className="w-8 shrink-0 text-[12px] text-muted">{Math.round(cp.atMs / 1000)}s</span><span>{cp.text}</span></li>)}</ul>
                </div>
              )}
              <p className="mt-auto pt-4 text-[12px] text-muted">{copy.duo.continuing}</p>
            </div>
          ) : <p className="px-6 text-[15px] text-muted">{emptyText}</p>}
        </aside>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
function ProfileRail({ me }: { me: c.MeResponse }) {
  const channels = useStore(s => s.channels);
  const current = useStore(s => s.current.channelId);
  const runs = useStore(s => s.runs);
  const layout = useLayout();
  const activeChannels = new Set(Object.values(runs).filter(r => !['READY', 'FAILED', 'SKIPPED'].includes(r.status)).map(r => r.channelId));
  return (
    <div className="pointer-events-none absolute right-0 z-20 flex items-end justify-between px-4" style={{ bottom: layout.safeBottom + 12, left: layout.hinge ? layout.hinge[1] : 0 }} data-testid="profile-rail">
      <div className="pointer-events-auto flex max-w-[calc(100%-64px)] items-center gap-3 overflow-x-auto rounded-pill bg-paper/85 p-2 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md [scrollbar-width:none]">
        {channels.map(ch => (
          <button key={ch.id} type="button" aria-label={ch.title} aria-current={current === ch.id} onClick={() => store.selectChannel(ch.id)} data-testid={`channel-${ch.id}`}
            className={`relative shrink-0 rounded-pill transition-transform duration-[180ms] ${current === ch.id ? 'scale-100' : 'scale-90 opacity-80'}`}>
            <Avatar src={ch.latestPosterUrl} label={ch.title} seed={ch.id} size={44} ring={current === ch.id} />
            {activeChannels.has(ch.id) && <span className="pulse-dot absolute -right-0.5 -top-0.5 h-3 w-3 rounded-pill bg-ink ring-2 ring-paper" aria-hidden="true" />}
          </button>
        ))}
        <button type="button" aria-label={copy.forMe.newChannel} onClick={() => store.openSheet({ kind: 'prompt' })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-ink/80 text-ink" data-testid="new-channel"><LuPlus size={20} /></button>
      </div>
      <button type="button" aria-label={copy.forMe.profile} onClick={() => store.openSheet({ kind: 'profile' })} className="pointer-events-auto shrink-0 rounded-pill ring-2 ring-paper shadow-[0_1px_8px_rgba(0,0,0,0.12)]" data-testid="profile-button">
        <Avatar src={me.user.avatarUrl} label={me.user.name} seed={me.user.id} size={44} />
      </button>
    </div>
  );
}

export function ForMe({ me }: { me: c.MeResponse }) {
  const current = useStore(s => s.current);
  const feed = useStore(s => s.feed);
  const runs = useStore(s => s.runs);
  const vistas = useStore(s => s.vistas);
  const channels = useStore(s => s.channels);
  const layout = useLayout();
  const vistaId = current.vistaId;
  useEffect(() => { if (vistaId) void store.vista(vistaId); }, [vistaId]);
  const vista = vistaId ? vistas[vistaId] ?? null : null;
  const run = useMemo(() => Object.values(runs).filter(r => r.channelId === current.channelId).sort((a, b) => b.seenAt - a.seenAt)[0] ?? null, [runs, current.channelId]);
  const showRun = run && !(run.status === 'READY' && vistaId) ? run : null;
  const item = feed.find(i => i.vistaId === vistaId);
  const emptyText = channels.length === 0 ? copy.forMe.empty : copy.status.QUEUED;
  return (
    <>
      <VistaStage vista={vista} owned emptyText={emptyText} run={showRun && showRun.status !== 'SKIPPED' ? showRun : null} onSwipe={d => store.stepVista(d)} onRetry={() => run && store.retry(run)} />
      <TopBar right={<>
        {vista && <Button variant="glass" size="icon" aria-label={copy.forMe.ask} onClick={() => store.openSheet({ kind: 'ask', vistaId: vista.vistaId })} data-testid="ask-button"><LuMic size={19} /></Button>}
        {vista && <Button variant="glass" size="icon" aria-label={copy.forMe.deepDive} onClick={() => store.openSheet({ kind: 'deepDive', vistaId: vista.vistaId })} data-testid="deepdive-button"><LuCompass size={19} /></Button>}
      </>} />
      {vista && !layout.hinge && (
        <div className="pointer-events-none absolute right-4 z-20" style={{ bottom: layout.safeBottom + 76 }}>
          <Button variant={item?.published ? 'glass' : 'solid'} size="sm" className="pointer-events-auto" onClick={() => item?.published ? store.unpublish(vista.vistaId) : store.publish(vista.vistaId)} data-testid="publish-button">{item?.published ? copy.forMe.published : copy.forMe.publish}</Button>
        </div>
      )}
      <ProfileRail me={me} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
export function Discovery() {
  const items = useStore(s => s.discovery);
  const index = useStore(s => s.discoveryIndex);
  const vistas = useStore(s => s.vistas);
  const forked = useStore(s => s.forked);
  const layout = useLayout();
  const item = items[index] ?? null;
  useEffect(() => { if (item) void store.vista(item.vistaId); }, [item?.vistaId]);
  const vista = item ? vistas[item.vistaId] ?? null : null;
  const railBottom = layout.safeBottom + 112;
  return (
    <>
      <VistaStage vista={vista} owned={false} emptyText={copy.discovery.empty} onSwipe={d => store.stepDiscovery(d)} />
      <TopBar right={item && <Button variant="glass" size="icon" aria-label={copy.discovery.fork} onClick={() => void store.fork(item.vistaId)} data-testid="fork-button" disabled={!!forked[item.vistaId]}><LuGitFork size={19} /></Button>} />
      {item && (
        <>
          <div className="absolute right-3 z-20 flex flex-col items-center gap-3" style={{ bottom: railBottom, ...(layout.hinge ? { right: 12 } : {}) }} data-testid="action-rail">
            <RailButton label={item.subscribed ? copy.discovery.subscribed : copy.discovery.subscribe} onClick={() => void store.toggleSubscribe(item.channelId, item.subscribed)} active={item.subscribed} testId="rail-subscribe">{item.subscribed ? <LuBellRing size={22} /> : <LuBellPlus size={22} />}</RailButton>
            <RailButton label={forked[item.vistaId] ? copy.discovery.forked : fill(copy.discovery.forks, { n: item.forkCount })} onClick={() => void store.fork(item.vistaId)} active={!!forked[item.vistaId]} testId="rail-fork"><LuGitFork size={22} /></RailButton>
            <RailButton label={copy.forMe.deepDive} onClick={() => store.openSheet({ kind: 'deepDive', vistaId: item.vistaId })} testId="rail-deepdive"><LuArrowUpRight size={22} /></RailButton>
            <RailButton label={copy.discovery.more} onClick={() => store.openSheet({ kind: 'ask', vistaId: item.vistaId })} testId="rail-more"><LuEllipsis size={22} /></RailButton>
          </div>
          <div className="absolute left-4 z-20 flex items-center gap-3 rounded-[20px] bg-paper/90 p-3 pr-4 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md" style={{ bottom: layout.safeBottom + 16, right: 76, ...(layout.hinge ? { left: layout.hinge[1] + 16 } : {}) }} data-testid="channel-guide">
            <Avatar src={item.publisher.avatarUrl} label={item.publisher.name} seed={item.publisher.workspaceId} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{item.channelTitle}</p>
              <p className="truncate text-[13px] text-muted">{fill(copy.discovery.by, { name: item.publisher.name })}</p>
            </div>
            <Button size="sm" variant={item.subscribed ? 'outline' : 'solid'} onClick={() => void store.toggleSubscribe(item.channelId, item.subscribed)} data-testid="guide-subscribe">{item.subscribed ? copy.discovery.subscribed : copy.discovery.subscribe}</Button>
          </div>
          <div className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-[12px] text-muted" style={{ bottom: layout.safeBottom + 4 }}>{index + 1} / {items.length}</div>
        </>
      )}
    </>
  );
}
function RailButton({ label, onClick, children, active, testId }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} data-testid={testId} className="flex flex-col items-center gap-1">
      <span className={`flex h-12 w-12 items-center justify-center rounded-pill shadow-[0_1px_8px_rgba(0,0,0,0.1)] backdrop-blur-md transition-colors duration-[180ms] ${active ? 'bg-ink text-paper' : 'bg-paper/85 text-ink'}`}>{children}</span>
      <span className="max-w-[64px] truncate text-[11px] text-ink/80">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------
export function Shell({ me }: { me: c.MeResponse }) {
  const mode = useStore(s => s.mode);
  const sheet = useStore(s => s.sheet);
  const closing = useStore(s => s.closingSheet);
  const vistas = useStore(s => s.vistas);
  const active = sheet ?? closing;
  const pushed = !!sheet;
  const layout = useLayout();
  const pushBy = Math.min(120, Math.round(layout.height * 0.14));
  return (
    <div className="screen" data-testid="screen" data-mode={mode}>
      <div className={`screen-push absolute inset-0 transition-transform duration-[320ms] ${pushed ? 'ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'ease-[cubic-bezier(0.4,0,0.8,0.2)] duration-[240ms]'}`} style={{ transform: pushed ? `translateY(${pushBy}px) scale(0.96)` : 'none', borderRadius: pushed ? 28 : 0, overflow: 'hidden' }} aria-hidden={pushed}>
        {mode === 'forMe' ? <ForMe me={me} /> : <Discovery />}
        <Receipt />
      </div>
      {active?.kind === 'model' && <ModelSheet open={sheet?.kind === 'model'} closing={closing?.kind === 'model'} />}
      {active?.kind === 'prompt' && <PromptSheet open={sheet?.kind === 'prompt'} closing={closing?.kind === 'prompt'} />}
      {active?.kind === 'ask' && <AskSheet open={sheet?.kind === 'ask'} closing={closing?.kind === 'ask'} vistaId={active.vistaId} />}
      {active?.kind === 'deepDive' && <DeepDiveSheet open={sheet?.kind === 'deepDive'} closing={closing?.kind === 'deepDive'} vista={vistas[active.vistaId] ?? null} />}
      {active?.kind === 'profile' && <ProfileSheet open={sheet?.kind === 'profile'} closing={closing?.kind === 'profile'} />}
      <Toast />
    </div>
  );
}

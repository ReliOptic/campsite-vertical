import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuMic, LuCompass, LuGitFork, LuPlus, LuPlay, LuPause, LuRotateCcw, LuEllipsis, LuBellPlus, LuBellRing, LuArrowUpRight } from 'react-icons/lu';
import type * as c from '@campsite/contracts';
import { copy, fill, phaseCopy } from '../../copy';
import { store, useStore, type RunState } from '../../lib/store';
import { useVistaState } from '../../lib/vista-state';
import { cn } from '../../lib/cn';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Logo } from '../ui/logo';
import { contentPane, useLayout } from './device';
import { VistaFrame, type VistaFrameHandle } from './vista-frame';
import { AskSheet, DeepDiveSheet, ModelSheet, ProfileSheet, PromptSheet } from './sheets';

const TINTS = ['bg-butter', 'bg-sky', 'bg-lavender', 'bg-secondary'];
const tintFor = (key: string) => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; };
function Face({ src, label, seed, className }: { src?: string | null; label: string; seed: string; className?: string }) {
  return (
    <Avatar className={cn('size-11', className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className={cn('text-[13px] font-semibold text-foreground', tintFor(seed))}>{label.trim().slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
const glass = 'rounded-full border-0 bg-background/85 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md hover:bg-background';

// ---------------------------------------------------------------------------------------------------
export function Landing() {
  const opts = useStore(s => s.authOptions);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const own = () => { const n = name.trim(); const e = email.trim() || `${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@campsite.test`; if (n) void store.devLogin(e, n); };
  return (
    <div className="screen flex flex-col items-center justify-center px-8 text-center">
      <Logo size={56} />
      <h1 className="mt-6 text-[30px] font-semibold leading-9 tracking-[-0.03em]">Campsite</h1>
      <p className="mt-3 max-w-[280px] text-[16px] leading-6 text-muted-foreground">{copy.landing.lead}</p>
      <div className="mt-10 flex w-full max-w-[320px] flex-col gap-2">
        <Button size="lg" className="rounded-full" onClick={() => { location.href = '/auth/google/start'; }} disabled={!opts?.google} data-testid="google-login">{copy.landing.google}</Button>
        {opts?.dev && (
          <div className="mt-6 rounded-2xl border p-4 text-left">
            <p className="text-[13px] font-medium">{copy.landing.devTitle}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{copy.landing.devHint}</p>
            <div className="mt-3 flex gap-2">
              {opts.devAccounts.map(a => <Button key={a.email} variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => void store.devLogin(a.email, a.name)} data-testid={`dev-login-${a.name.toLowerCase()}`}>{a.name}</Button>)}
            </div>
            <Separator className="my-3" />
            <div className="flex gap-2">
              <Input placeholder={copy.landing.ownName} value={name} onChange={e => setName(e.target.value)} className="h-9 rounded-full" data-testid="own-name" onKeyDown={e => { if (e.key === 'Enter') own(); }} />
              <Input placeholder={copy.landing.ownEmail} value={email} onChange={e => setEmail(e.target.value)} className="h-9 rounded-full" data-testid="own-email" onKeyDown={e => { if (e.key === 'Enter') own(); }} />
              <Button size="sm" className="rounded-full" disabled={!name.trim()} onClick={own} data-testid="own-login">{copy.landing.ownGo}</Button>
            </div>
          </div>
        )}
      </div>
      <p className="absolute bottom-8 text-[12px] text-muted-foreground">{copy.tagline}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
function ModeTabs() {
  const mode = useStore(s => s.mode);
  return (
    <Tabs value={mode} onValueChange={v => store.setMode(v as 'forMe' | 'discovery')}>
      <TabsList className="h-10 rounded-full bg-background/85 p-1 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md">
        <TabsTrigger value="forMe" data-testid="mode-forMe" className="h-8 rounded-full px-4 text-[14px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{copy.mode.forMe}</TabsTrigger>
        <TabsTrigger value="discovery" data-testid="mode-discovery" className="h-8 rounded-full px-4 text-[14px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{copy.mode.discovery}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
function IconAction({ label, onClick, testId, children, disabled }: { label: string; onClick: () => void; testId: string; children: ReactNode; disabled?: boolean }) {
  return <Button variant="outline" size="icon-lg" className={glass} aria-label={label} title={label} onClick={onClick} data-testid={testId} disabled={disabled}>{children}</Button>;
}

/** Host bar: over the content pane; on the Duo outer display actions stack vertically beside the status column (Apple: vertical bars). */
function TopBar({ actions }: { actions: ReactNode }) {
  const layout = useLayout();
  const pane = contentPane(layout);
  const vertical = layout.verticalBarEdge === 'trailing';
  return (
    <>
      <div className="pointer-events-none absolute z-20 flex items-center justify-between" style={{ top: layout.safeTop + 6, left: pane.left + 16, width: pane.width - 32 }}>
        <div className={cn('pointer-events-auto flex size-10 items-center justify-center', glass)}><Logo size={22} /></div>
        <div className="pointer-events-auto"><ModeTabs /></div>
        {!vertical && <div className="pointer-events-auto flex items-center gap-2">{actions}</div>}
        {vertical && <div className="size-10" />}
      </div>
      {vertical && <div className="absolute z-20 flex flex-col items-center gap-2" style={{ top: layout.safeTop + 56, left: pane.left + pane.width - 56 }} data-testid="vertical-bar">{actions}</div>}
    </>
  );
}

function Receipt() {
  const receipt = useStore(s => s.receipt);
  const layout = useLayout();
  const pane = contentPane(layout);
  if (!receipt) return null;
  return <Badge className="receipt-enter pointer-events-none absolute z-20 -translate-x-1/2 rounded-full px-3 py-1.5 text-[13px]" style={{ top: layout.safeTop + 54, left: pane.left + pane.width / 2 }} data-testid="receipt" role="status">{receipt}</Badge>;
}
function Toast() {
  const toast = useStore(s => s.toast);
  const layout = useLayout();
  if (!toast) return null;
  return <div className="receipt-enter absolute left-1/2 z-50 -translate-x-1/2 rounded-xl bg-primary px-4 py-3 text-[14px] text-primary-foreground shadow-lg" style={{ bottom: layout.safeBottom + 96 }} role="alert" data-testid="toast">{toast}</div>;
}

function StatusLine({ run, onRetry }: { run: RunState | null; onRetry: () => void }) {
  if (!run) return null;
  if (run.status === 'FAILED') return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-8 text-center" data-testid="status-failed">
      <p className="text-[17px]">{copy.status.FAILED}</p>
      <Button variant="outline" className="rounded-full" onClick={onRetry}>{copy.status.retry}</Button>
    </div>
  );
  if (run.status === 'READY' || run.status === 'SKIPPED') return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4" data-testid="status-line" data-phase={run.phase}>
      <span className="relative flex size-16 items-center justify-center"><span className="pulse-dot absolute inset-0 rounded-full bg-sky" /><span className="size-5 rounded-full bg-primary" /></span>
      <p className="text-[17px]">{phaseCopy(run.phase)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
/** Primary pane: the Vista. Closed: whole safe area. Duo open: right pane, same iframe (no remount); left pane = secondary (controls). */
interface StageProps { vista: c.VistaResponse | null; owned: boolean; emptyText: string; run?: RunState | null; onSwipe?: (dir: 1 | -1) => void; onRetry?: () => void }
function VistaStage({ vista, owned, emptyText, run, onSwipe, onRetry }: StageProps) {
  const layout = useLayout();
  const frame = useRef<VistaFrameHandle>(null);
  const vs = useVistaState(vista?.vistaId ?? null);
  const [playing, setPlaying] = useState(true);
  const [scene, setScene] = useState<string | null>(null);
  const touchY = useRef<number | null>(null);
  const wheelLock = useRef(0);
  useEffect(() => { setScene(null); setPlaying(true); }, [vista?.vistaId]);
  const open = !!layout.division;
  const rect = contentPane(layout);
  const onScene = useCallback((id: string) => setScene(id), []);
  const onState = useCallback((s: c.SemanticState) => { vs.onState({ ...s, fold: open ? 'open' : 'closed' }); if (typeof s.scene === 'string') setScene(s.scene); }, [vs.onState, open]);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => { touchY.current = e.touches[0].clientY; },
    onTouchEnd: (e: React.TouchEvent) => { if (touchY.current == null) return; const dy = e.changedTouches[0].clientY - touchY.current; touchY.current = null; if (Math.abs(dy) > 60) onSwipe?.(dy < 0 ? 1 : -1); },
    onWheel: (e: React.WheelEvent) => { const now = Date.now(); if (now - wheelLock.current < 500 || Math.abs(e.deltaY) < 30) return; wheelLock.current = now; onSwipe?.(e.deltaY > 0 ? 1 : -1); },
  };
  return (
    <>
      <div className="relayout absolute" style={rect} {...swipe} data-testid="vista-stage">
        {vista ? <VistaFrame key={vista.vistaId} ref={frame} vista={vista} active={playing} style={{ inset: 0 }} initialState={vs.initial} onState={onState} onScene={onScene} /> : (
          <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[17px] text-muted-foreground" data-testid="empty-state">{run ? null : emptyText}</div>
        )}
        <StatusLine run={run ?? null} onRetry={() => onRetry?.()} />
      </div>
      {open && (
        <aside className="relayout absolute flex flex-col bg-background" style={{ left: 0, top: 0, width: layout.division!.frame[0], height: layout.height, paddingTop: layout.safeTop + 64, paddingBottom: layout.safeBottom + 20 }} data-testid="duo-left-pane">
          {vista ? (
            <div className="flex min-h-0 flex-1 flex-col px-6">
              <h2 className="text-[26px] font-semibold leading-8 tracking-[-0.03em]">{vista.title}</h2>
              <p className="mt-2 text-[15px] leading-[22px] text-muted-foreground">{vista.summary}</p>
              <div className="mt-5 flex items-center gap-2">
                <Button size="icon-lg" className="rounded-full" aria-label={playing ? copy.forMe.pause : copy.forMe.play} onClick={() => setPlaying(p => !p)} data-testid="duo-playpause">{playing ? <LuPause /> : <LuPlay />}</Button>
                <Button size="icon-lg" variant="outline" className="rounded-full" aria-label={copy.forMe.restart} onClick={() => { frame.current?.restart(); setPlaying(true); }}><LuRotateCcw /></Button>
                {owned && <Button variant={vista.published ? 'outline' : 'default'} className="rounded-full" onClick={() => vista.published ? store.unpublish(vista.vistaId) : store.publish(vista.vistaId)} data-testid="duo-publish">{vista.published ? copy.forMe.published : copy.forMe.publish}</Button>}
              </div>
              {vista.scenes && vista.scenes.length > 0 && (
                <div className="mt-6">
                  <p className="text-[12px] text-muted-foreground">{copy.forMe.scenes}</p>
                  <ol className="mt-2 flex flex-col gap-1">
                    {vista.scenes.map(s => <li key={s.id}><Button variant={scene === s.id ? 'default' : 'ghost'} className="w-full justify-between rounded-xl text-[15px]" onClick={() => { frame.current?.scene(s.id); setScene(s.id); setPlaying(true); vs.onState({ scene: s.id, atMs: s.atMs, fold: 'open' }); }} data-testid={`scene-${s.id}`}>{s.label}<span className="text-[12px] opacity-60">{Math.round(s.atMs / 1000)}s</span></Button></li>)}
                  </ol>
                </div>
              )}
              {vista.captions && vista.captions.length > 0 && (
                <ScrollArea className="mt-6 min-h-0 flex-1">
                  <p className="text-[12px] text-muted-foreground">{copy.forMe.captions}</p>
                  <ul className="mt-2 flex flex-col gap-2 pr-3 text-[15px] leading-[22px]">{vista.captions.map((cp, i) => <li key={i} className="flex gap-3"><span className="w-8 shrink-0 text-[12px] text-muted-foreground">{Math.round(cp.atMs / 1000)}s</span><span>{cp.text}</span></li>)}</ul>
                </ScrollArea>
              )}
              <p className="mt-auto pt-4 text-[12px] text-muted-foreground">{copy.duo.continuing}</p>
            </div>
          ) : <p className="px-6 text-[15px] text-muted-foreground">{emptyText}</p>}
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
  const pane = contentPane(layout);
  const active = new Set(Object.values(runs).filter(r => !['READY', 'FAILED', 'SKIPPED'].includes(r.status)).map(r => r.channelId));
  return (
    <div className="pointer-events-none absolute z-20 flex items-end justify-between" style={{ bottom: layout.safeBottom + 12, left: pane.left + 16, width: pane.width - 32 }} data-testid="profile-rail">
      <div className={cn('pointer-events-auto flex max-w-[calc(100%-60px)] items-center gap-3 overflow-x-auto p-2 [scrollbar-width:none]', glass)}>
        {channels.map(ch => (
          <button key={ch.id} type="button" aria-label={ch.title} aria-current={current === ch.id} onClick={() => store.selectChannel(ch.id)} data-testid={`channel-${ch.id}`}
            className={cn('relative shrink-0 rounded-full transition-transform duration-150', current === ch.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'scale-90 opacity-80')}>
            <Face src={ch.latestPosterUrl} label={ch.title} seed={ch.id} />
            {active.has(ch.id) && <span className="pulse-dot absolute -right-0.5 -top-0.5 size-3 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />}
          </button>
        ))}
        <Button variant="outline" size="icon-lg" className="rounded-full" aria-label={copy.forMe.newChannel} onClick={() => store.openSheet({ kind: 'prompt' })} data-testid="new-channel"><LuPlus /></Button>
      </div>
      <button type="button" aria-label={copy.forMe.profile} onClick={() => store.openSheet({ kind: 'profile' })} className="pointer-events-auto shrink-0 rounded-full ring-2 ring-background shadow-[0_1px_8px_rgba(0,0,0,0.12)]" data-testid="profile-button">
        <Face src={me.user.avatarUrl} label={me.user.name} seed={me.user.id} />
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
  const pane = contentPane(layout);
  const vistaId = current.vistaId;
  useEffect(() => { if (vistaId) void store.vista(vistaId); }, [vistaId]);
  const vista = vistaId ? vistas[vistaId] ?? null : null;
  const run = useMemo(() => Object.values(runs).filter(r => r.channelId === current.channelId).sort((a, b) => b.seenAt - a.seenAt)[0] ?? null, [runs, current.channelId]);
  const showRun = run && !(run.status === 'READY' && vistaId) && run.status !== 'SKIPPED' ? run : null;
  const item = feed.find(i => i.vistaId === vistaId);
  return (
    <>
      <VistaStage vista={vista} owned emptyText={channels.length === 0 ? copy.forMe.empty : copy.status.QUEUED} run={showRun} onSwipe={d => store.stepVista(d)} onRetry={() => run && store.retry(run)} />
      <TopBar actions={vista && <>
        <IconAction label={copy.forMe.ask} onClick={() => store.openSheet({ kind: 'ask', vistaId: vista.vistaId })} testId="ask-button"><LuMic /></IconAction>
        <IconAction label={copy.forMe.deepDive} onClick={() => store.openSheet({ kind: 'deepDive', vistaId: vista.vistaId })} testId="deepdive-button"><LuCompass /></IconAction>
      </>} />
      {vista && !layout.division && (
        <div className="pointer-events-none absolute z-20" style={{ bottom: layout.safeBottom + 76, left: pane.left + pane.width - 16, transform: 'translateX(-100%)' }}>
          <Button variant={item?.published ? 'outline' : 'default'} size="sm" className={cn('pointer-events-auto rounded-full', item?.published && glass)} onClick={() => item?.published ? store.unpublish(vista.vistaId) : store.publish(vista.vistaId)} data-testid="publish-button">{item?.published ? copy.forMe.published : copy.forMe.publish}</Button>
        </div>
      )}
      <ProfileRail me={me} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
function RailButton({ label, onClick, children, active, testId }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; testId: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} data-testid={testId} className="flex flex-col items-center gap-1">
      <span className={cn('flex size-12 items-center justify-center rounded-full shadow-[0_1px_8px_rgba(0,0,0,0.1)] backdrop-blur-md transition-colors duration-150 [&_svg]:size-[22px]', active ? 'bg-primary text-primary-foreground' : 'bg-background/85 text-foreground')}>{children}</span>
      <span className="max-w-[64px] truncate text-[11px] text-foreground/80">{label}</span>
    </button>
  );
}

export function Discovery() {
  const items = useStore(s => s.discovery);
  const index = useStore(s => s.discoveryIndex);
  const vistas = useStore(s => s.vistas);
  const forked = useStore(s => s.forked);
  const layout = useLayout();
  const pane = contentPane(layout);
  const item = items[index] ?? null;
  useEffect(() => { if (item) void store.vista(item.vistaId); }, [item?.vistaId]);
  const vista = item ? vistas[item.vistaId] ?? null : null;
  const right = layout.width - (pane.left + pane.width) + 12;
  return (
    <>
      <VistaStage vista={vista} owned={false} emptyText={copy.discovery.empty} onSwipe={d => store.stepDiscovery(d)} />
      <TopBar actions={item && <IconAction label={copy.discovery.fork} onClick={() => void store.fork(item.vistaId)} testId="fork-button" disabled={!!forked[item.vistaId]}><LuGitFork /></IconAction>} />
      {item && (
        <>
          <div className="absolute z-20 flex flex-col items-center gap-3" style={{ bottom: layout.safeBottom + 112, right }} data-testid="action-rail">
            <RailButton label={item.subscribed ? copy.discovery.subscribed : copy.discovery.subscribe} onClick={() => void store.toggleSubscribe(item.channelId, item.subscribed)} active={item.subscribed} testId="rail-subscribe">{item.subscribed ? <LuBellRing /> : <LuBellPlus />}</RailButton>
            <RailButton label={forked[item.vistaId] ? copy.discovery.forked : fill(copy.discovery.forks, { n: item.forkCount })} onClick={() => void store.fork(item.vistaId)} active={!!forked[item.vistaId]} testId="rail-fork"><LuGitFork /></RailButton>
            <RailButton label={copy.forMe.deepDive} onClick={() => store.openSheet({ kind: 'deepDive', vistaId: item.vistaId })} testId="rail-deepdive"><LuArrowUpRight /></RailButton>
            <RailButton label={copy.discovery.more} onClick={() => store.openSheet({ kind: 'ask', vistaId: item.vistaId })} testId="rail-more"><LuEllipsis /></RailButton>
          </div>
          <div className="absolute z-20 flex items-center gap-3 rounded-2xl bg-background/90 p-3 pr-4 shadow-[0_1px_8px_rgba(0,0,0,0.08)] backdrop-blur-md" style={{ bottom: layout.safeBottom + 16, left: pane.left + 16, right: right + 64 }} data-testid="channel-guide">
            <Face src={item.publisher.avatarUrl} label={item.publisher.name} seed={item.publisher.workspaceId} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{item.channelTitle}</p>
              <p className="truncate text-[13px] text-muted-foreground">{fill(copy.discovery.by, { name: item.publisher.name })}</p>
            </div>
            <Button size="sm" variant={item.subscribed ? 'outline' : 'default'} className="rounded-full" onClick={() => void store.toggleSubscribe(item.channelId, item.subscribed)} data-testid="guide-subscribe">{item.subscribed ? copy.discovery.subscribed : copy.discovery.subscribe}</Button>
          </div>
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 text-[12px] text-muted-foreground" style={{ bottom: layout.safeBottom + 4, left: pane.left + pane.width / 2 }}>{index + 1} / {items.length}</div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
export function Shell({ me }: { me: c.MeResponse }) {
  const mode = useStore(s => s.mode);
  const sheet = useStore(s => s.sheet);
  const vistas = useStore(s => s.vistas);
  const layout = useLayout();
  const pushed = !!sheet;
  const pushBy = Math.min(120, Math.round(layout.height * 0.14));
  const askId = sheet?.kind === 'ask' ? sheet.vistaId : null;
  const deepId = sheet?.kind === 'deepDive' ? sheet.vistaId : null;
  return (
    <div className="screen" data-testid="screen" data-mode={mode}>
      <div className="screen-push absolute inset-0 overflow-hidden" data-pushed={pushed} style={{ transform: pushed ? `translateY(${pushBy}px) scale(0.96)` : 'none', borderRadius: pushed ? 28 : 0 }} aria-hidden={pushed}>
        {mode === 'forMe' ? <ForMe me={me} /> : <Discovery />}
        <Receipt />
      </div>
      <ModelSheet />
      <PromptSheet />
      <ProfileSheet />
      {askId && <AskSheet vistaId={askId} />}
      {deepId && <DeepDiveSheet vista={vistas[deepId] ?? null} />}
      <Toast />
    </div>
  );
}

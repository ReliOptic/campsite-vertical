import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuMic, LuKeyboard, LuSquareArrowOutUpRight, LuCopy } from 'react-icons/lu';
import * as c from '@campsite/contracts';
import { copy, fill } from '../../copy';
import { store, useStore, type Sheet as SheetKind } from '../../lib/store';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { Separator } from '../ui/separator';
import { Spinner } from '../ui/spinner';
import { contentPane, useLayout, useScreenElement } from './device';

/**
 * The one sheet pattern (Muse reference): a dark panel descends from the top while the screen is pushed down.
 * Built on shadcn Sheet (Radix Dialog) with side="top", portaled into the device screen.
 * Geometry per the Duo white paper: x=safeLeft+12, width=W−24, y=safeTop+12, radius 28, max height 620.
 */
function TopSheet({ kind, title, help, children, footer, testId }: { kind: NonNullable<SheetKind>['kind']; title: string; help?: string; children: ReactNode; footer: ReactNode; testId: string }) {
  const sheet = useStore(s => s.sheet);
  const layout = useLayout();
  const container = useScreenElement();
  const open = sheet?.kind === kind;
  const pane = contentPane(layout);
  const compact = pane.width < 600;
  const width = compact ? pane.width - 24 : Math.min(640, pane.width - 48);
  const left = pane.left + (compact ? 12 : (pane.width - width) / 2);
  const top = layout.safeTop + (compact ? 12 : 24);
  const maxHeight = Math.min(620, layout.height - layout.safeBottom - 12 - top);
  return (
    <Sheet open={open} onOpenChange={o => { if (!o) store.closeSheet(); }}>
      <SheetContent side="top" container={container} showCloseButton={false} data-testid={testId}
        overlayClassName="absolute bg-black/30 data-[state=open]:duration-200 data-[state=closed]:duration-150"
        className="absolute rounded-[28px] border-0 bg-black text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)] data-[state=open]:duration-300 data-[state=closed]:duration-200 gap-0 p-0 inset-x-auto"
        style={{ left, top, width, maxHeight }}>
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="text-[22px] font-semibold leading-7 tracking-[-0.02em] text-white">{title}</SheetTitle>
          {help && <SheetDescription className="text-[15px] leading-[21px] text-white/60">{help}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">{children}</div>
        <SheetFooter className="flex-row gap-3 px-5 pb-5 pt-3">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const darkField = 'rounded-2xl border-0 bg-white/10 text-white placeholder:text-white/35 focus-visible:bg-white/15 focus-visible:ring-white/40 min-h-11 text-[16px]';
const chipGroup = 'flex-wrap gap-1.5';
const chip = 'h-8 rounded-full border-0 bg-white/10 px-3 text-[13px] text-white/80 hover:bg-white/15 hover:text-white data-[state=on]:bg-white data-[state=on]:text-black';

export function ModelSheet() {
  const me = useStore(s => s.session);
  const [key, setKey] = useState('');
  const [modelId, setModelId] = useState(c.DEFAULT_MODEL_OPTIONS[1].id);
  const [busy, setBusy] = useState(false);
  const connected = typeof me === 'object' && me.model.connected;
  const submit = async () => { if (!c.OpenRouterKey.safeParse(key).success) { store.toast(copy.model.invalid); return; } setBusy(true); const ok = await store.connectModel(key, modelId); setBusy(false); if (ok) setKey(''); };
  return (
    <TopSheet kind="model" title={copy.model.title} help={copy.model.help} testId="model-sheet"
      footer={<><Button variant="secondary" size="lg" className="flex-1 rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => store.closeSheet()}>{copy.model.later}</Button><Button size="lg" className="flex-1 rounded-full bg-white text-black hover:bg-white/90" disabled={busy || key.trim().length < 20} onClick={submit} data-testid="model-connect">{busy ? <Spinner /> : copy.model.connect}</Button></>}>
      {connected && typeof me === 'object' && <p className="mb-3 text-[14px] text-white/60">{copy.model.connected} · {me.model.keyHint} · {me.model.modelId}</p>}
      <Label htmlFor="model-key" className="text-[13px] text-white/50">{copy.model.keyLabel}</Label>
      <Input id="model-key" data-testid="model-key" className={`${darkField} mt-1 font-mono text-[15px]`} type="password" autoComplete="off" spellCheck={false} placeholder={copy.model.keyPlaceholder} value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} autoFocus />
      <Label className="mt-4 block text-[13px] text-white/50">{copy.model.modelLabel}</Label>
      <ToggleGroup type="single" spacing={2} value={modelId} onValueChange={v => { if (v) setModelId(v); }} className={`${chipGroup} mt-1 justify-start`} aria-label={copy.model.modelLabel}>
        {c.DEFAULT_MODEL_OPTIONS.map(o => <ToggleGroupItem key={o.id} value={o.id} className={chip}>{o.label}</ToggleGroupItem>)}
      </ToggleGroup>
      {connected && <Button variant="link" className="mt-3 h-auto p-0 text-[13px] text-white/60" onClick={() => void store.disconnectModel()}>{copy.model.disconnect}</Button>}
    </TopSheet>
  );
}

export function PromptSheet() {
  const [brief, setBrief] = useState('');
  const [interval, setInterval_] = useState('off');
  const [busy, setBusy] = useState(false);
  const composing = useRef(false);
  const submit = async () => { if (!brief.trim() || busy) return; setBusy(true); const ok = await store.createChannel(brief.trim(), interval === 'off' ? undefined : Number(interval)); setBusy(false); if (ok) setBrief(''); };
  const opts: [string, string][] = [['off', copy.prompt.scheduleOff], ['1440', copy.prompt.scheduleDaily], ['360', copy.prompt.scheduleSix], ['60', copy.prompt.scheduleHourly]];
  return (
    <TopSheet kind="prompt" title={copy.prompt.title} help={copy.prompt.help} testId="prompt-sheet"
      footer={<><Button variant="secondary" size="lg" className="flex-1 rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => store.closeSheet()}>{copy.prompt.cancel}</Button><Button size="lg" className="flex-1 rounded-full bg-white text-black hover:bg-white/90" disabled={!brief.trim() || busy} onClick={submit} data-testid="prompt-create">{busy ? <Spinner /> : copy.prompt.create}</Button></>}>
      <Textarea data-testid="prompt-input" className={`${darkField} min-h-[132px] resize-none leading-[25px]`} placeholder={copy.prompt.placeholder} value={brief} onChange={e => setBrief(e.target.value)} autoFocus
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing.current) { e.preventDefault(); void submit(); } }} />
      <Label className="mt-3 block text-[13px] text-white/50">{copy.prompt.scheduleLabel}</Label>
      <ToggleGroup type="single" spacing={2} value={interval} onValueChange={v => { if (v) setInterval_(v); }} className={`${chipGroup} mt-1.5 justify-start`} aria-label={copy.prompt.scheduleLabel}>
        {opts.map(([v, label]) => <ToggleGroupItem key={v} value={v} className={chip} data-testid={`schedule-${v}`}>{label}</ToggleGroupItem>)}
      </ToggleGroup>
    </TopSheet>
  );
}

interface SpeechRecognitionLike { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
function speechCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AskSheet({ vistaId }: { vistaId: string }) {
  const answer = useStore(s => s.askAnswer);
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const canSpeak = !!speechCtor();
  useEffect(() => () => rec.current?.stop(), []);
  const listen = () => {
    const Ctor = speechCtor(); if (!Ctor) return;
    const r = new Ctor(); r.lang = 'ko-KR'; r.interimResults = true;
    r.onresult = e => { setQ(Array.from(e.results).map(x => x[0].transcript).join('')); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };
  const send = () => { if (q.trim()) void store.ask(vistaId, q.trim()); };
  return (
    <TopSheet kind="ask" title={copy.ask.title} testId="ask-sheet"
      footer={<><Button variant="secondary" size="lg" className="flex-1 rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => store.closeSheet()}>{copy.prompt.cancel}</Button><Button size="lg" className="flex-1 rounded-full bg-white text-black hover:bg-white/90" disabled={!q.trim()} onClick={send} data-testid="ask-send">{copy.ask.send}</Button></>}>
      <div className="flex items-start gap-2">
        <Textarea data-testid="ask-input" className={`${darkField} min-h-[72px] resize-none`} placeholder={listening ? copy.ask.listening : copy.ask.placeholder} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} autoFocus />
        {canSpeak && <Button size="icon-lg" variant="secondary" className={`rounded-full ${listening ? 'bg-white text-black' : 'bg-white/12 text-white hover:bg-white/20'}`} aria-label={listening ? copy.ask.typed : copy.ask.mic} onClick={() => listening ? rec.current?.stop() : listen()}>{listening ? <LuKeyboard /> : <LuMic />}</Button>}
      </div>
      {answer && answer.vistaId === vistaId && (
        <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-[16px] leading-6 animate-in fade-in-0 duration-200" data-testid="ask-answer">
          <p className="text-[13px] text-white/50">{answer.question}</p>
          <p className="mt-1">{answer.answer || <span className="inline-flex items-center gap-2 text-white/60"><Spinner />{copy.ask.thinking}</span>}</p>
        </div>
      )}
    </TopSheet>
  );
}

export function DeepDiveSheet({ vista }: { vista: c.VistaResponse | null }) {
  const text = vista ? `${vista.title}\n${vista.summary}` : '';
  const prompt = encodeURIComponent(`${text}\n\n이 주제를 더 깊이 설명해 주세요.`);
  const go = (url: string) => { window.open(url, '_blank', 'noopener'); store.closeSheet(); };
  const row = 'w-full justify-between rounded-full bg-white text-black hover:bg-white/90';
  return (
    <TopSheet kind="deepDive" title={copy.deepDive.title} help={vista?.title} testId="deepdive-sheet"
      footer={<Button variant="secondary" size="lg" className="flex-1 rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => store.closeSheet()}>{copy.common.close}</Button>}>
      <div className="flex flex-col gap-2">
        <Button size="lg" className={row} onClick={() => go(`https://chatgpt.com/?q=${prompt}`)}>{copy.deepDive.chatgpt}<LuSquareArrowOutUpRight /></Button>
        <Button size="lg" className={row} onClick={() => go(`https://claude.ai/new?q=${prompt}`)}>{copy.deepDive.claude}<LuSquareArrowOutUpRight /></Button>
        <Button size="lg" variant="secondary" className="w-full justify-between rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => { void navigator.clipboard?.writeText(text); store.receipt(copy.common.done); store.closeSheet(); }}>{copy.deepDive.copy}<LuCopy /></Button>
      </div>
    </TopSheet>
  );
}

export function ProfileSheet() {
  const me = useStore(s => s.session);
  const subs = useStore(s => s.subscriptions);
  if (typeof me !== 'object') return null;
  const next = me.nextUpdateAt ? new Date(me.nextUpdateAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : copy.profile.none;
  return (
    <TopSheet kind="profile" title={me.user.name} help={me.user.email} testId="profile-sheet"
      footer={<><Button variant="secondary" size="lg" className="flex-1 rounded-full bg-white/12 text-white hover:bg-white/20" onClick={() => store.closeSheet()}>{copy.common.close}</Button><Button size="lg" className="flex-1 rounded-full bg-white text-black hover:bg-white/90" onClick={() => void store.logout()} data-testid="logout">{copy.profile.logout}</Button></>}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[15px]">
        <dt className="text-white/50">{copy.profile.plan}</dt><dd className="capitalize">{me.plan}</dd>
        <dt className="text-white/50">{copy.forMe.newChannel}</dt><dd>{fill(copy.profile.channels, { used: me.usage.channels.used, max: me.usage.channels.max })}</dd>
        <dt className="text-white/50">Vista</dt><dd>{fill(copy.profile.today, { used: me.usage.runsToday.used, max: me.usage.runsToday.max })}</dd>
        <dt className="text-white/50">{copy.profile.nextUpdate}</dt><dd>{next}</dd>
        <dt className="text-white/50">{copy.profile.model}</dt><dd className="flex items-center gap-3">{me.model.connected ? me.model.modelId : '—'}<Button variant="link" className="h-auto p-0 text-[13px] text-white/60" onClick={() => store.openSheet({ kind: 'model' })}>{copy.model.change}</Button></dd>
      </dl>
      {subs.length > 0 && <><Separator className="my-4 bg-white/15" /><p className="text-[13px] text-white/50">{copy.forMe.subscriptions}</p><ul className="mt-2 flex flex-col gap-2">{subs.map(s => <li key={s.channelId} className="flex items-center justify-between text-[15px]"><span>{s.title} · {s.publisher.name}</span><Button variant="link" className="h-auto p-0 text-[13px] text-white/60" onClick={() => void store.toggleSubscribe(s.channelId, true)}>{copy.discovery.unsubscribe}</Button></li>)}</ul></>}
    </TopSheet>
  );
}

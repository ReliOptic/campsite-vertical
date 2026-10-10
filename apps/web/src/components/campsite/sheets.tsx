import { useEffect, useRef, useState } from 'react';
import { LuMic, LuKeyboard, LuSquareArrowOutUpRight, LuCopy } from 'react-icons/lu';
import * as c from '@campsite/contracts';
import { copy, fill } from '../../copy';
import { store, useStore } from '../../lib/store';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { TopSheet } from './top-sheet';

const dark = 'w-full rounded-[16px] bg-white/10 px-4 py-3 text-[17px] leading-[25px] text-paper placeholder:text-white/35 focus:bg-white/15 outline-none';

export function ModelSheet({ open, closing }: { open: boolean; closing: boolean }) {
  const me = useStore(s => s.session);
  const [key, setKey] = useState('');
  const [modelId, setModelId] = useState(c.DEFAULT_MODEL_OPTIONS[1].id);
  const [busy, setBusy] = useState(false);
  const connected = typeof me === 'object' && me.model.connected;
  const submit = async () => { if (!c.OpenRouterKey.safeParse(key).success) { store.toast(copy.model.invalid); return; } setBusy(true); const ok = await store.connectModel(key, modelId); setBusy(false); if (ok) setKey(''); };
  return (
    <TopSheet open={open} closing={closing} title={copy.model.title} help={copy.model.help} onClose={() => store.closeSheet()} testId="model-sheet"
      footer={<><Button variant="dark" size="lg" className="flex-1" onClick={() => store.closeSheet()}>{copy.model.later}</Button><Button variant="inverse" size="lg" className="flex-1" disabled={busy || key.trim().length < 20} onClick={submit} data-testid="model-connect">{busy ? <Spinner /> : copy.model.connect}</Button></>}>
      {connected && typeof me === 'object' && <p className="mb-3 text-[14px] text-white/60">{copy.model.connected} · {me.model.keyHint} · {me.model.modelId}</p>}
      <label className="block text-[13px] text-white/50">{copy.model.keyLabel}</label>
      <input data-autofocus data-testid="model-key" className={`${dark} mt-1 font-mono text-[15px]`} type="password" autoComplete="off" spellCheck={false} placeholder={copy.model.keyPlaceholder} value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} />
      <label className="mt-4 block text-[13px] text-white/50">{copy.model.modelLabel}</label>
      <div className="mt-1 flex flex-wrap gap-2">
        {c.DEFAULT_MODEL_OPTIONS.map(o => (
          <button key={o.id} type="button" onClick={() => setModelId(o.id)} className={`h-9 whitespace-nowrap rounded-pill px-3 text-[14px] ${modelId === o.id ? 'bg-paper text-ink' : 'bg-white/10 text-white/80'}`}>{o.label}</button>
        ))}
      </div>
      {connected && <button type="button" className="mt-4 text-[14px] text-white/50 underline" onClick={() => void store.disconnectModel()}>{copy.model.disconnect}</button>}
    </TopSheet>
  );
}

export function PromptSheet({ open, closing }: { open: boolean; closing: boolean }) {
  const [brief, setBrief] = useState('');
  const [interval, setInterval_] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const composing = useRef(false);
  const submit = async () => { if (!brief.trim() || busy) return; setBusy(true); const ok = await store.createChannel(brief.trim(), interval); setBusy(false); if (ok) setBrief(''); };
  const opts: [string, number | undefined][] = [[copy.prompt.scheduleOff, undefined], [copy.prompt.scheduleDaily, 1440], [copy.prompt.scheduleSix, 360], [copy.prompt.scheduleHourly, 60]];
  return (
    <TopSheet open={open} closing={closing} title={copy.prompt.title} help={copy.prompt.help} onClose={() => store.closeSheet()} testId="prompt-sheet"
      footer={<><Button variant="dark" size="lg" className="flex-1" onClick={() => store.closeSheet()}>{copy.prompt.cancel}</Button><Button variant="inverse" size="lg" className="flex-1" disabled={!brief.trim() || busy} onClick={submit} data-testid="prompt-create">{busy ? <Spinner /> : copy.prompt.create}</Button></>}>
      <textarea data-autofocus data-testid="prompt-input" className={`${dark} min-h-[132px] resize-none`} placeholder={copy.prompt.placeholder} value={brief} onChange={e => setBrief(e.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !composing.current) { e.preventDefault(); void submit(); } }} />
      <div className="mt-3 text-[13px] text-white/50">
        <span>{copy.prompt.scheduleLabel}</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{opts.map(([label, v]) => <button key={label} type="button" onClick={() => setInterval_(v)} className={`h-8 whitespace-nowrap rounded-pill px-3 text-[13px] ${interval === v ? 'bg-paper text-ink' : 'bg-white/10 text-white/80'}`} data-testid={`schedule-${v ?? 'off'}`}>{label}</button>)}</div>
      </div>
    </TopSheet>
  );
}

interface SpeechRecognitionLike { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
function speechCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AskSheet({ open, closing, vistaId }: { open: boolean; closing: boolean; vistaId: string }) {
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
    <TopSheet open={open} closing={closing} title={copy.ask.title} onClose={() => store.closeSheet()} testId="ask-sheet"
      footer={<><Button variant="dark" size="lg" className="flex-1" onClick={() => store.closeSheet()}>{copy.prompt.cancel}</Button><Button variant="inverse" size="lg" className="flex-1" disabled={!q.trim()} onClick={send} data-testid="ask-send">{copy.ask.send}</Button></>}>
      <div className="flex items-start gap-2">
        <textarea data-autofocus data-testid="ask-input" className={`${dark} min-h-[72px] resize-none`} placeholder={listening ? copy.ask.listening : copy.ask.placeholder} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        {canSpeak && <Button variant="dark" size="icon" aria-label={listening ? copy.ask.typed : copy.ask.mic} onClick={() => listening ? rec.current?.stop() : listen()} className={listening ? 'bg-paper text-ink' : ''}>{listening ? <LuKeyboard size={20} /> : <LuMic size={20} />}</Button>}
      </div>
      {answer && answer.vistaId === vistaId && (
        <div className="mt-4 rounded-[16px] bg-white/10 px-4 py-3 text-[16px] leading-[24px] result-enter" data-testid="ask-answer">
          <p className="text-[13px] text-white/50">{answer.question}</p>
          <p className="mt-1">{answer.answer || <span className="inline-flex items-center gap-2 text-white/60"><Spinner />{copy.ask.thinking}</span>}</p>
        </div>
      )}
    </TopSheet>
  );
}

export function DeepDiveSheet({ open, closing, vista }: { open: boolean; closing: boolean; vista: c.VistaResponse | null }) {
  const text = vista ? `${vista.title}\n${vista.summary}` : '';
  const prompt = encodeURIComponent(`${text}\n\n이 주제를 더 깊이 설명해 주세요.`);
  const go = (url: string) => { window.open(url, '_blank', 'noopener'); store.closeSheet(); };
  return (
    <TopSheet open={open} closing={closing} title={copy.deepDive.title} help={vista?.title} onClose={() => store.closeSheet()} testId="deepdive-sheet"
      footer={<Button variant="dark" size="lg" className="flex-1" onClick={() => store.closeSheet()}>{copy.common.close}</Button>}>
      <div className="flex flex-col gap-2">
        <Button variant="inverse" size="lg" className="justify-between" onClick={() => go(`https://chatgpt.com/?q=${prompt}`)}>{copy.deepDive.chatgpt}<LuSquareArrowOutUpRight size={18} /></Button>
        <Button variant="inverse" size="lg" className="justify-between" onClick={() => go(`https://claude.ai/new?q=${prompt}`)}>{copy.deepDive.claude}<LuSquareArrowOutUpRight size={18} /></Button>
        <Button variant="dark" size="lg" className="justify-between" onClick={() => { void navigator.clipboard?.writeText(text); store.receipt(copy.common.done); store.closeSheet(); }}>{copy.deepDive.copy}<LuCopy size={18} /></Button>
      </div>
    </TopSheet>
  );
}

export function ProfileSheet({ open, closing }: { open: boolean; closing: boolean }) {
  const me = useStore(s => s.session);
  const subs = useStore(s => s.subscriptions);
  if (typeof me !== 'object') return null;
  const next = me.nextUpdateAt ? new Date(me.nextUpdateAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : copy.profile.none;
  return (
    <TopSheet open={open} closing={closing} title={me.user.name} help={me.user.email} onClose={() => store.closeSheet()} testId="profile-sheet"
      footer={<><Button variant="dark" size="lg" className="flex-1" onClick={() => store.closeSheet()}>{copy.common.close}</Button><Button variant="inverse" size="lg" className="flex-1" onClick={() => void store.logout()} data-testid="logout">{copy.profile.logout}</Button></>}>
      <dl className="grid grid-cols-2 gap-y-3 text-[15px]">
        <dt className="text-white/50">{copy.profile.plan}</dt><dd className="capitalize">{me.plan}</dd>
        <dt className="text-white/50">{copy.forMe.newChannel}</dt><dd>{fill(copy.profile.channels, { used: me.usage.channels.used, max: me.usage.channels.max })}</dd>
        <dt className="text-white/50">Vista</dt><dd>{fill(copy.profile.today, { used: me.usage.runsToday.used, max: me.usage.runsToday.max })}</dd>
        <dt className="text-white/50">{copy.profile.nextUpdate}</dt><dd>{next}</dd>
        <dt className="text-white/50">{copy.profile.model}</dt><dd className="flex items-center gap-2">{me.model.connected ? me.model.modelId : '—'}<button type="button" className="text-[13px] text-white/60 underline" onClick={() => store.openSheet({ kind: 'model' })}>{copy.model.change}</button></dd>
      </dl>
      {subs.length > 0 && <div className="mt-5"><p className="text-[13px] text-white/50">{copy.forMe.subscriptions}</p><ul className="mt-2 flex flex-col gap-2">{subs.map(s => <li key={s.channelId} className="flex items-center justify-between text-[15px]"><span>{s.title} · {s.publisher.name}</span><button type="button" className="text-[13px] text-white/60 underline" onClick={() => void store.toggleSubscribe(s.channelId, true)}>{copy.discovery.unsubscribe}</button></li>)}</ul></div>}
    </TopSheet>
  );
}

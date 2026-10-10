import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import * as c from '@campsite/contracts';

export interface VistaFrameHandle { play(): void; pause(): void; restart(): void; seek(atMs: number): void; scene(sceneId: string): void; restore(state: c.SemanticState): void }
export interface VistaFrameProps { vista: c.VistaResponse; active: boolean; style?: CSSProperties; className?: string; onState?: (state: c.SemanticState) => void; onScene?: (sceneId: string, atMs?: number) => void; onReady?: (durationMs?: number) => void; initialState?: c.SemanticState | null }

/**
 * Sandboxed player. Host ↔ Vista only via validated postMessage; the iframe has an opaque origin, so
 * `event.source` is the trust anchor (never event.origin) and nothing sensitive is ever posted.
 */
export const VistaFrame = forwardRef<VistaFrameHandle, VistaFrameProps>(function VistaFrame({ vista, active, style, className, onState, onScene, onReady, initialState }, ref) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const post = (msg: c.HostMessage) => { c.HostMessage.parse(msg); iframe.current?.contentWindow?.postMessage(msg, '*'); };
  useImperativeHandle(ref, () => ({ play: () => post({ type: 'campsite:play' }), pause: () => post({ type: 'campsite:pause' }), restart: () => post({ type: 'campsite:restart' }), seek: atMs => post({ type: 'campsite:seek', atMs }), scene: sceneId => post({ type: 'campsite:scene', sceneId }), restore: state => post({ type: 'campsite:restore', state }) }), []);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (!iframe.current || ev.source !== iframe.current.contentWindow) return;
      const parsed = c.VistaMessage.safeParse(ev.data);
      if (!parsed.success) return;
      const m = parsed.data;
      if (m.type === 'campsite:ready') { setReady(true); onReady?.(m.durationMs); if (initialState && Object.keys(initialState).length) post({ type: 'campsite:restore', state: initialState }); post({ type: active ? 'campsite:play' : 'campsite:pause' }); }
      else if (m.type === 'campsite:state') onState?.(m.state);
      else if (m.type === 'campsite:scene') onScene?.(m.sceneId, m.atMs);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [vista.vistaId, active, initialState, onState, onScene, onReady]);

  useEffect(() => { if (ready) post({ type: active ? 'campsite:play' : 'campsite:pause' }); }, [active, ready]);
  useEffect(() => { setReady(false); setLoaded(false); }, [vista.playUrl]);
  useEffect(() => { if (loaded && !ready) { const t = setTimeout(() => setReady(true), 3000); return () => clearTimeout(t); } }, [loaded, ready]);

  const fit = vista.aspect === '9:16';
  return (
    <div className={`absolute overflow-hidden bg-paper ${className ?? ''}`} style={style} data-testid="vista-frame" data-vista-id={vista.vistaId} data-ready={ready ? '1' : '0'}>
      <img src={vista.posterUrl} alt="" className={`absolute inset-0 h-full w-full ${fit ? 'object-contain' : 'object-cover'} transition-opacity duration-[220ms] ${ready ? 'opacity-0' : 'opacity-100'}`} draggable={false} />
      <iframe ref={iframe} title={vista.title} src={vista.playUrl} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="" onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full border-0 bg-transparent transition-opacity duration-[220ms] ${ready ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
});

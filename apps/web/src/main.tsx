import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { store, useStore, type Device } from './lib/store';
import { DeviceStage } from './components/campsite/device';
import { Landing, Shell } from './components/campsite/screen';
import { copy } from './copy';
import { Logo } from './components/ui/logo';

function DeviceToolbar() {
  const device = useStore(s => s.device);
  const opts: [Device, string][] = [['iphone', copy.device.iphone], ['duoClosed', copy.device.duoClosed], ['duoOpen', copy.device.duoOpen], ['none', copy.device.none]];
  return (
    <>
      <Logo size={20} wordmark />
      <div className="flex items-center gap-1 rounded-pill bg-white p-1 shadow-[0_1px_4px_rgba(0,0,0,0.08)]" role="tablist" aria-label="device">
        {opts.map(([d, label]) => <button key={d} role="tab" aria-selected={device === d} data-testid={`device-${d}`} onClick={() => store.setDevice(d)} className={`h-8 rounded-pill px-3 text-[13px] ${device === d ? 'bg-ink text-white' : 'text-ink/70'}`}>{label}</button>)}
      </div>
      <span className="text-[11px] tracking-[0.04em] text-ink/50">{copy.tagline}</span>
    </>
  );
}

function App() {
  const session = useStore(s => s.session);
  const device = useStore(s => s.device);
  useEffect(() => { void store.boot(); }, []);
  return (
    <DeviceStage device={device} toolbar={<DeviceToolbar />}>
      {session === 'loading' ? <div className="screen" /> : session === 'anon' ? <Landing /> : <Shell me={session} />}
    </DeviceStage>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

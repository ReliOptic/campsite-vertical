import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { store, useStore, type Device } from './lib/store';
import { DeviceStage } from './components/campsite/device';
import { Landing, Shell } from './components/campsite/screen';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { copy } from './copy';
import { Logo } from './components/ui/logo';

function DeviceToolbar() {
  const device = useStore(s => s.device);
  const opts: [Device, string][] = [['iphone', copy.device.iphone], ['duoClosed', copy.device.duoClosed], ['duoOpen', copy.device.duoOpen], ['none', copy.device.none]];
  return (
    <>
      <Logo size={20} wordmark />
      <Tabs value={device} onValueChange={v => store.setDevice(v as Device)}>
        <TabsList className="h-9 rounded-full">
          {opts.map(([d, label]) => <TabsTrigger key={d} value={d} data-testid={`device-${d}`} className="h-7 rounded-full px-3 text-[13px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <span className="text-[11px] text-muted-foreground">{copy.tagline}</span>
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

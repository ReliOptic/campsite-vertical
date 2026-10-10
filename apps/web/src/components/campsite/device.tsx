import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Device } from '../../lib/store';

/** Logical fixtures from the Duo white paper (not official device measurements). */
export interface Layout { device: Device; width: number; height: number; safeTop: number; safeBottom: number; hinge: [number, number] | null; island: boolean }
export const FIXTURES: Record<Device, Layout> = {
  iphone: { device: 'iphone', width: 390, height: 844, safeTop: 59, safeBottom: 34, hinge: null, island: true },
  duoClosed: { device: 'duoClosed', width: 390, height: 844, safeTop: 44, safeBottom: 24, hinge: null, island: false },
  duoOpen: { device: 'duoOpen', width: 840, height: 900, safeTop: 24, safeBottom: 24, hinge: [408, 432], island: false },
  none: { device: 'none', width: 0, height: 0, safeTop: 0, safeBottom: 0, hinge: null, island: false },
};
const LayoutContext = createContext<Layout>(FIXTURES.iphone);
export const useLayout = () => useContext(LayoutContext);

function useWindowSize() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const on = () => set({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return s;
}

/** Review stage: the device sits in the browser; the app runs inside its screen at logical size. */
export function DeviceStage({ device, toolbar, children }: { device: Device; toolbar: ReactNode; children: ReactNode }) {
  const win = useWindowSize();
  if (device === 'none') {
    const layout: Layout = { ...FIXTURES.none, width: win.w, height: win.h, safeTop: 0, safeBottom: 0 };
    return <LayoutContext.Provider value={layout}><div className="fixed inset-0 bg-paper">{children}</div></LayoutContext.Provider>;
  }
  const fx = FIXTURES[device];
  const bezel = device === 'duoOpen' ? 14 : 12;
  const outerW = fx.width + bezel * 2, outerH = fx.height + bezel * 2;
  const scale = Math.min((win.w - 48) / outerW, (win.h - 96) / outerH, 1);
  return (
    <LayoutContext.Provider value={fx}>
      <div className="fixed inset-0 flex flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between px-5">{toolbar}</div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="relayout relative" style={{ width: outerW * scale, height: outerH * scale }}>
            <div className="relayout absolute left-0 top-0 origin-top-left" style={{ width: outerW, height: outerH, transform: `scale(${scale})` }}>
              <div className={`relayout absolute inset-0 rounded-[54px] bg-[#0E0E10] shadow-[0_30px_80px_rgba(0,0,0,0.28),inset_0_0_0_2px_#2a2a2e] ${device === 'duoOpen' ? 'rounded-[36px]' : ''}`} />
              <div className="relayout absolute overflow-hidden bg-paper" style={{ left: bezel, top: bezel, width: fx.width, height: fx.height, borderRadius: device === 'duoOpen' ? 26 : 44 }}>
                {children}
                {fx.island && <div className="pointer-events-none absolute left-1/2 top-[11px] h-[34px] w-[120px] -translate-x-1/2 rounded-pill bg-[#0E0E10]" aria-hidden="true" />}
                {device === 'duoClosed' && <div className="pointer-events-none absolute right-[14px] top-[14px] h-[14px] w-[14px] rounded-pill bg-[#0E0E10]" aria-hidden="true" />}
                {fx.hinge && <div className="pointer-events-none absolute top-0 bottom-0 bg-gradient-to-r from-black/[0.06] via-black/[0.12] to-black/[0.06]" style={{ left: fx.hinge[0], width: fx.hinge[1] - fx.hinge[0] }} aria-hidden="true" />}
                {device === 'duoOpen' && <div className="pointer-events-none absolute right-[14px] top-[12px] h-[12px] w-[12px] rounded-pill bg-[#0E0E10]" aria-hidden="true" />}
                <div className="pointer-events-none absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-pill bg-ink/80" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}

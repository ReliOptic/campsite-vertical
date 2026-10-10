import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Device } from '../../lib/store';

/**
 * Device fixtures for the browser review stage. Geometry follows Apple's iPhone Duo developer guidance
 * (Tech Talks 111461/111462/111463): the outer display keeps the app left of a vertical status-bar/camera
 * column and lays bars out vertically; the inner display is regular/regular with a *division* reserved
 * region that has zero width while the device is flat; content keeps continuity across poses.
 * Point values are review fixtures, not official device measurements.
 */
export interface Layout {
  device: Device; width: number; height: number;
  safeTop: number; safeBottom: number; safeLeft: number; safeRight: number;
  /** Division reserved region (hinge). Inactive = zero width (flat). */
  division: { frame: [number, number]; active: boolean } | null;
  /** Vertical bar edge for host controls on the outer display (Apple: toolbars/tab bars lay out vertically). */
  verticalBarEdge: 'trailing' | null;
  island: boolean;
}
export const FIXTURES: Record<Device, Layout> = {
  iphone:    { device: 'iphone',    width: 390, height: 844, safeTop: 59, safeBottom: 34, safeLeft: 0, safeRight: 0,  division: null, verticalBarEdge: null, island: true },
  duoClosed: { device: 'duoClosed', width: 430, height: 844, safeTop: 20, safeBottom: 20, safeLeft: 0, safeRight: 40, division: null, verticalBarEdge: 'trailing', island: false },
  duoOpen:   { device: 'duoOpen',   width: 840, height: 900, safeTop: 24, safeBottom: 24, safeLeft: 0, safeRight: 0,  division: { frame: [419, 421], active: false }, verticalBarEdge: null, island: false },
  none:      { device: 'none',      width: 0,   height: 0,   safeTop: 0,  safeBottom: 0,  safeLeft: 0, safeRight: 0,  division: null, verticalBarEdge: null, island: false },
};
/** Content pane (primary) for a layout: the right half on an open Duo (split arrangement), else the safe area. */
export function contentPane(l: Layout) {
  if (l.division) return { left: l.division.frame[1], top: 0, width: l.width - l.division.frame[1], height: l.height };
  return { left: l.safeLeft, top: 0, width: l.width - l.safeLeft - l.safeRight, height: l.height };
}
const LayoutContext = createContext<Layout>(FIXTURES.iphone);
export const useLayout = () => useContext(LayoutContext);
const ScreenContext = createContext<HTMLElement | null>(null);
/** The element sheets portal into (stays inside the device frame). */
export const useScreenElement = () => useContext(ScreenContext);

function useWindowSize() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const on = () => set({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return s;
}

export function DeviceStage({ device, toolbar, children }: { device: Device; toolbar: ReactNode; children: ReactNode }) {
  const win = useWindowSize();
  const screenRef = useRef<HTMLDivElement>(null);
  const [screenEl, setScreenEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setScreenEl(screenRef.current); }, [device]);
  if (device === 'none') {
    const layout: Layout = { ...FIXTURES.none, width: win.w, height: win.h };
    return (
      <LayoutContext.Provider value={layout}><ScreenContext.Provider value={screenEl}>
        <div ref={screenRef} className="fixed inset-0 bg-background">{children}</div>
      </ScreenContext.Provider></LayoutContext.Provider>
    );
  }
  const fx = FIXTURES[device];
  const bezel = device === 'duoOpen' ? 14 : 12;
  const radius = device === 'duoOpen' ? 26 : 44;
  const outerW = fx.width + bezel * 2, outerH = fx.height + bezel * 2;
  const scale = Math.min((win.w - 48) / outerW, (win.h - 96) / outerH, 1);
  return (
    <LayoutContext.Provider value={fx}><ScreenContext.Provider value={screenEl}>
      <div className="fixed inset-0 flex flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between px-5">{toolbar}</div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <div className="relayout relative" style={{ width: outerW * scale, height: outerH * scale }}>
            <div className="relayout absolute left-0 top-0 origin-top-left" style={{ width: outerW, height: outerH, transform: `scale(${scale})` }}>
              <div className="relayout absolute inset-0 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.25),inset_0_0_0_2px_#2a2a2a]" style={{ borderRadius: radius + bezel }} />
              <div ref={screenRef} className="relayout absolute overflow-hidden bg-background" style={{ left: bezel, top: bezel, width: fx.width, height: fx.height, borderRadius: radius }} data-testid="device-screen">
                {children}
                {fx.island && <div className="pointer-events-none absolute left-1/2 top-[11px] h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />}
                {fx.verticalBarEdge === 'trailing' && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col items-center" style={{ width: fx.safeRight }} aria-hidden="true">
                    <div className="mt-[14px] h-[14px] w-[14px] rounded-full bg-black" />
                    <div className="mt-2 text-[10px] font-semibold tracking-tight text-foreground [writing-mode:vertical-rl]">9:41</div>
                  </div>
                )}
                {fx.division && <div className="pointer-events-none absolute inset-y-0 bg-black/10" style={{ left: fx.division.frame[0], width: fx.division.frame[1] - fx.division.frame[0] }} aria-hidden="true" />}
                {device === 'duoOpen' && <div className="pointer-events-none absolute right-[14px] top-[12px] h-[12px] w-[12px] rounded-full bg-black" aria-hidden="true" />}
                <div className="pointer-events-none absolute bottom-[8px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-foreground/80" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScreenContext.Provider></LayoutContext.Provider>
  );
}

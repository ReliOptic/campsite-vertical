import { useEffect, useRef, type ReactNode } from 'react';
import { useLayout } from './device';
import { copy } from '../../copy';

/**
 * The one sheet pattern: the whole screen is pushed down and a dark panel descends from the top (Muse reference).
 * Geometry follows the white paper: compact x=safeLeft+12, width=W-24, y=safeTop+12; max height 620; radius 28.
 */
export function TopSheet({ open, closing, title, help, children, onClose, footer, testId }: { open: boolean; closing: boolean; title: string; help?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; testId?: string }) {
  const layout = useLayout();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() ?? panel.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open && !closing) return null;
  const compact = layout.width < 600;
  const x = compact ? 12 : Math.max(12, (layout.width - Math.min(640, layout.width - 48)) / 2);
  const width = compact ? layout.width - 24 : Math.min(640, layout.width - 48);
  const y = layout.safeTop + (compact ? 12 : 24);
  const maxH = Math.min(620, layout.height - layout.safeBottom - 12 - y);
  return (
    <>
      <div className={`absolute inset-0 z-30 bg-ink ${open ? 'backdrop-enter' : 'backdrop-exit'}`} style={{ opacity: 0.28 }} onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId ?? 'top-sheet'}
        className={`absolute z-40 flex flex-col rounded-[28px] bg-[#1F1F1F] text-paper shadow-[0_24px_60px_rgba(0,0,0,0.35)] ${open ? 'sheet-enter' : 'sheet-exit'}`} style={{ left: x, top: y, width, maxHeight: maxH }}>
        <div className="px-5 pt-5">
          <h2 className="text-[22px] font-semibold leading-[28px] tracking-[-0.02em]">{title}</h2>
          {help && <p className="mt-2 text-[15px] leading-[21px] text-white/60">{help}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4">{children}</div>
        {footer && <div className="flex gap-3 px-5 pb-5 pt-3">{footer}</div>}
        <span className="sr-only">{copy.common.close}</span>
      </div>
    </>
  );
}

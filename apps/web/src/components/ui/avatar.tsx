import { cn } from '../../lib/cn';
const TINTS = ['bg-butter', 'bg-sky', 'bg-lavender', 'bg-stone'];
export function tintFor(key: string) { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
export function Avatar({ src, label, seed, size = 40, className, ring }: { src?: string | null; label: string; seed: string; size?: number; className?: string; ring?: boolean }) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill text-ink', !src && tintFor(seed), ring && 'update-ring', className)} style={{ width: size, height: size }} aria-label={label} role="img">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="text-[13px] font-semibold">{label.trim().slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

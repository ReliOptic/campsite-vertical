// Brand mark: circle + triangle (from the brand board). Kept small; never competes with the Vista.
export function Logo({ size = 22, wordmark = false, dark = false }: { size?: number; wordmark?: boolean; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="Campsite">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs><linearGradient id="cs-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D6E6FF" /><stop offset="1" stopColor="#FFE7C7" /></linearGradient></defs>
        <circle cx="15" cy="13" r="12" fill="url(#cs-g)" />
        <path d="M9 29 L19 10 L29 29 Z" fill={dark ? '#FFFFFF' : '#1F1F1F'} />
      </svg>
      {wordmark && <span className={`text-[17px] font-semibold tracking-[-0.02em] ${dark ? 'text-paper' : 'text-ink'}`}>Campsite</span>}
    </span>
  );
}

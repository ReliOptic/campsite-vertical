export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-pill border-2 border-current border-r-transparent spin-slow ${className}`} aria-hidden="true" />;
}

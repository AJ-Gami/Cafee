export function ProgressBar({
  value,
  max = 1,
  tone = 'sage',
  label,
  className = '',
}: {
  value: number;
  max?: number;
  tone?: 'sage' | 'espresso' | 'caramel' | 'rust' | 'honey';
  label: string;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const colors = {
    sage: 'bg-sage-600',
    espresso: 'bg-espresso-700',
    caramel: 'bg-caramel-500',
    rust: 'bg-rust-600',
    honey: 'bg-honey-700',
  } as const;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(pct)}
      className={`h-2 w-full overflow-hidden rounded-full bg-cream-300/70 ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

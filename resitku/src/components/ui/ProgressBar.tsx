/** Bar kemajuan: hijau (<80%), kuning (80–100%), merah (>100%). */
export function ProgressBar({ value, max, className = "" }: { value: number; max: number | null; className?: string }) {
  if (!max || max <= 0) {
    return <div className={`h-2 w-full rounded-full bg-line ${className}`} />;
  }
  const ratio = value / max;
  const color = ratio > 1 ? "bg-red-500" : ratio >= 0.8 ? "bg-accent-strong" : "bg-emerald-500";
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

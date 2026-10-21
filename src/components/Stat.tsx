import type { ReactNode } from 'react';

/** KPI tile: important numbers readable at a glance. */
export function Stat({
  label,
  value,
  hint,
  icon,
  emphasis = false,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-espresso-800/[0.07] bg-cream-50 p-3.5 shadow-card ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-espresso-600">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 truncate font-semibold text-espresso-800 ${emphasis ? 'text-[26px] leading-8' : 'text-xl leading-7'}`}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 truncate text-xs text-espresso-600">{hint}</div> : null}
    </div>
  );
}

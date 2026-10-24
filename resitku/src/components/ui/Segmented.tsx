"use client";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex rounded-2xl bg-line/70 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 truncate rounded-xl px-2 text-sm font-semibold transition-colors ${
            value === o.value ? "bg-white text-ink shadow-sm" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tab bergaris bawah (untuk sub-tab di dalam skrin). */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold ${
            value === o.value ? "border-ink text-ink" : "border-transparent text-muted"
          }`}
        >
          {o.label}
          {o.badge ? <span className="rounded-full bg-accent px-1.5 text-[11px] text-ink">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

import { useRef, type KeyboardEvent } from 'react';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  badge?: number | null;
}

/** Accessible tab strip for switching sub-sections inside a screen. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const option = options[next];
    if (option) {
      onChange(option.id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-2xl bg-cream-200 p-1">
      {options.map((o, i) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors ${
              active ? 'bg-cream-50 text-espresso-800 shadow-card' : 'text-espresso-600 hover:text-espresso-800'
            }`}
          >
            {o.label}
            {o.badge ? (
              <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rust-600 px-1.5 text-[11px] leading-5 text-white">
                {o.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

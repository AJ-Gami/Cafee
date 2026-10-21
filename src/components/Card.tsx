import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-2xl border border-espresso-800/[0.07] bg-cream-50 p-4 shadow-card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({
  title,
  subtitle,
  action,
  icon,
  as: Tag = 'h2',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 text-espresso-600">{icon}</span> : null}
        <div className="min-w-0">
          <Tag className="font-display text-lg leading-tight text-espresso-800">{title}</Tag>
          {subtitle ? <p className="mt-0.5 text-sm text-espresso-600">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pb-1 pt-2">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight text-espresso-800">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-espresso-600">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Row({ label, value, strong = false, muted = false, indent = false }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${indent ? 'pl-4' : ''}`}>
      <dt className={`min-w-0 ${strong ? 'font-semibold text-espresso-800' : muted ? 'text-sm text-espresso-600' : 'text-espresso-700'}`}>{label}</dt>
      <dd className={`tabular shrink-0 text-right ${strong ? 'font-semibold text-espresso-800' : muted ? 'text-sm text-espresso-600' : 'text-espresso-800'}`}>{value}</dd>
    </div>
  );
}

import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-espresso-800/15 bg-cream-50/60 px-6 py-8 text-center">
      <span className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-cream-200 text-espresso-600">{icon}</span>
      <p className="font-display text-lg text-espresso-800">{title}</p>
      {children ? <div className="max-w-xs text-sm text-espresso-600">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

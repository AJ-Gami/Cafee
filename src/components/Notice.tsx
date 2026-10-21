import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'good' | 'warn' | 'bad';

const STYLES: Record<NoticeTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-caramel-100 text-espresso-800 border-caramel-200', icon: <Info className="size-5" aria-hidden="true" /> },
  good: { box: 'bg-sage-100 text-sage-800 border-sage-200', icon: <CircleCheck className="size-5" aria-hidden="true" /> },
  warn: { box: 'bg-honey-100 text-honey-700 border-honey-700/20', icon: <TriangleAlert className="size-5" aria-hidden="true" /> },
  bad: { box: 'bg-rust-100 text-rust-700 border-rust-600/20', icon: <CircleAlert className="size-5" aria-hidden="true" /> },
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  role,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  role?: 'status' | 'alert';
}) {
  const s = STYLES[tone];
  return (
    <div className={`flex gap-3 rounded-2xl border p-3.5 ${s.box}`} role={role}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup notis"
          className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-black/5"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

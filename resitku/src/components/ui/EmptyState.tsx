import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-ink">
        <Icon className="size-7" />
      </span>
      <h3 className="mt-4 font-bold">{title}</h3>
      {text ? <p className="mt-1 max-w-[280px] text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

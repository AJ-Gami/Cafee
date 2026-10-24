"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  back,
  right,
}: {
  title: string;
  eyebrow?: string;
  /** Laluan untuk butang kembali, atau true untuk router.back(). */
  back?: string | boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="flex items-center gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)]">
      {back ? (
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
          className="-ml-1 grid size-10 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="eyebrow text-muted">{eyebrow}</p> : null}
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  );
}

"use client";

import { Plus } from "lucide-react";

/** Butang + kuning terapung di kanan bawah, di atas nav bawah. */
export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 mx-auto flex max-w-[480px] justify-end px-4">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto grid size-14 place-items-center rounded-full bg-accent text-ink shadow-[0_8px_24px_rgba(245,196,0,0.45)] active:scale-95 active:bg-accent-strong"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </button>
    </div>
  );
}

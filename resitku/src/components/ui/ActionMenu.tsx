"use client";

import type { LucideIcon } from "lucide-react";
import { BottomSheet } from "./BottomSheet";

export type ActionItem = {
  icon: LucideIcon;
  label: string;
  description?: string;
  onSelect: () => void;
};

/** Senarai pilihan dalam bottom sheet, contohnya pilihan butang +. */
export function ActionMenu({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: ActionItem[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <ul className="flex flex-col gap-2 pb-2">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left active:bg-canvas"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-ink">
                <item.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{item.label}</span>
                {item.description ? <span className="block text-sm text-muted">{item.description}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

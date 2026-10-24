"use client";

import { X } from "lucide-react";
import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { Spinner } from "./Spinner";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Jika diberi, sheet menjadi borang dengan butang Batal / Simpan. */
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  /** Kandungan tambahan di footer (contohnya butang Padam). */
  footerExtra?: ReactNode;
};

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = "Simpan",
  submitting,
  submitDisabled,
  footerExtra,
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitting && !submitDisabled) void onSubmit?.();
  };

  const body = (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
      {onSubmit ? (
        <div className="pb-safe border-t border-line bg-white px-5 pt-3">
          {footerExtra}
          <div className="flex gap-3 pb-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-12 flex-1 rounded-2xl border border-line bg-white font-semibold text-ink active:bg-canvas disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || submitDisabled}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-ink active:bg-accent-strong disabled:opacity-50"
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="pb-safe" />
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Tutup"
        className="animate-fade-in absolute inset-0 bg-black/40"
        onClick={() => !submitting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet-up relative flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup"
            className="grid size-9 place-items-center rounded-full bg-canvas text-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        {onSubmit ? (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            {body}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        )}
      </div>
    </div>
  );
}

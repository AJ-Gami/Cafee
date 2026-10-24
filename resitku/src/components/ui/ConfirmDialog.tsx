"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "./Spinner";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Padam",
  danger = true,
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !loading && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button type="button" aria-label="Tutup" className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => !loading && onClose()} />
      <div role="alertdialog" aria-modal="true" className="animate-fade-in relative w-full max-w-[380px] rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          {danger ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {message ? <div className="mt-1 text-sm text-muted">{message}</div> : null}
          </div>
        </div>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-11 flex-1 rounded-2xl border border-line font-semibold disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-50 ${
              danger ? "bg-red-600 text-white" : "bg-accent text-ink"
            }`}
          >
            {loading ? <Spinner className="size-4" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

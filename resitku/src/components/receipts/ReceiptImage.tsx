"use client";

import { FileText, Minus, Plus, X, ZoomIn } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { signedUrl } from "@/lib/receipts";

/** Gambar resit melalui signed URL. Ketik untuk paparan penuh dengan zoom. PDF dibuka dalam tab baharu. */
export function ReceiptImage({
  path,
  fileType,
  className = "h-56",
}: {
  path: string | null;
  fileType: "image" | "pdf" | null;
  className?: string;
}) {
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    signedUrl(path).then((u) => !cancelled && setUrl({ path, url: u }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return null;
  const current = url?.path === path ? url.url : undefined;
  if (current === undefined) return <Skeleton className={`w-full rounded-2xl ${className}`} />;
  if (current === null) {
    return <div className={`grid w-full place-items-center rounded-2xl bg-line text-sm text-muted ${className}`}>Fail tidak dapat dimuatkan</div>;
  }

  if (fileType === "pdf") {
    return (
      <a
        href={current}
        target="_blank"
        rel="noreferrer"
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white ${className}`}
      >
        <FileText className="size-10 text-muted" />
        <span className="font-semibold">Buka PDF</span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setScale(1);
          setZoomOpen(true);
        }}
        className={`relative block w-full overflow-hidden rounded-2xl border border-line bg-ink/5 ${className}`}
        aria-label="Besarkan gambar resit"
      >
        <img src={current} alt="Gambar resit" className="h-full w-full object-contain" />
        <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white">
          <ZoomIn className="size-4" />
        </span>
      </button>
      {zoomOpen ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Gambar resit">
          <div className="flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top)+12px)] text-white">
            <div className="flex gap-2">
              <button type="button" aria-label="Kecilkan" onClick={() => setScale((s) => Math.max(1, s - 0.5))} className="grid size-10 place-items-center rounded-full bg-white/15">
                <Minus className="size-5" />
              </button>
              <button type="button" aria-label="Besarkan" onClick={() => setScale((s) => Math.min(4, s + 0.5))} className="grid size-10 place-items-center rounded-full bg-white/15">
                <Plus className="size-5" />
              </button>
            </div>
            <button type="button" aria-label="Tutup" onClick={() => setZoomOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/15">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto" style={{ touchAction: "pan-x pan-y pinch-zoom" }} onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2.5))}>
            <img
              src={current}
              alt="Gambar resit"
              className="mx-auto max-w-none origin-top-left"
              style={{ width: `${scale * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

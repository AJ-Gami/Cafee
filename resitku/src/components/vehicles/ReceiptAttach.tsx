"use client";

import { Camera, CheckCircle2, ImageUp } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

/** Butang snap/lampir resit dalam borang servis & minyak. */
export function ReceiptAttach({
  attached,
  status,
  onCamera,
  onGallery,
  onRemove,
}: {
  attached: boolean;
  status: "idle" | "uploading" | "scanning";
  onCamera: () => void;
  onGallery: () => void;
  onRemove: () => void;
}) {
  if (status !== "idle") {
    return (
      <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent-soft text-sm font-semibold">
        <Spinner className="size-4" /> {status === "uploading" ? "Memuat naik resit…" : "AI sedang membaca resit…"}
      </div>
    );
  }
  if (attached) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <span className="flex-1 font-semibold">Resit dilampirkan</span>
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-muted underline">
          Tanggal
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onCamera} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-semibold text-muted">
        <Camera className="size-4" /> Snap resit
      </button>
      <button type="button" onClick={onGallery} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-semibold text-muted">
        <ImageUp className="size-4" /> Galeri / PDF
      </button>
    </div>
  );
}

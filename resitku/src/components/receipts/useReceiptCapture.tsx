"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { createReceiptFromFile } from "@/lib/receipts";

/**
 * Aliran snap resit: input kamera / galeri tersembunyi, muat naik, kemudian buka skrin semakan
 * yang akan memanggil AI. Pulangkan `element` yang mesti dirender dalam skrin.
 */
export function useReceiptCapture() {
  const router = useRouter();
  const { userId, plan } = useSession();
  const { error } = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!(await canUse("receipt_scan", { plan }))) return error(LIMIT_MESSAGE);
    setBusy(true);
    try {
      const receipt = await createReceiptFromFile(file, userId);
      router.push(`/belanja/resit/${receipt.id}?imbas=1`);
    } catch (err) {
      error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const element = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
      {busy ? (
        <div className="fixed inset-0 z-[65] flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm" role="status">
          <Spinner className="size-8" />
          <p className="font-semibold">Memuat naik resit…</p>
        </div>
      ) : null}
    </>
  );

  return {
    openCamera: () => cameraRef.current?.click(),
    openGallery: () => galleryRef.current?.click(),
    busy,
    element,
  };
}

"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { createReceiptFromFile, scanReceipt } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import type { Receipt } from "@/lib/types";

/**
 * Snap resit di dalam borang lain (servis / minyak): aliran scan yang sama seperti Fasa 2, tetapi hasil
 * dipulangkan kepada borang untuk mengisi medan, tanpa membuka skrin semakan.
 */
export function useInlineReceiptScan(onResult: (receipt: Receipt) => void) {
  const { userId, plan } = useSession();
  const { error, toast } = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "scanning">("idle");

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!(await canUse("receipt_scan", { plan }))) return error(LIMIT_MESSAGE);
    let receipt: Receipt | null = null;
    try {
      setStatus("uploading");
      receipt = await createReceiptFromFile(file, userId);
      setStatus("scanning");
      await scanReceipt(receipt.id);
    } catch (err) {
      if (!receipt) {
        setStatus("idle");
        return error(errorMessage(err));
      }
      toast("AI tidak dapat membaca resit. Resit tetap dilampirkan; isi butiran secara manual.");
    }
    const { data } = await getSupabase().from("receipts").select("*").eq("id", receipt.id).single();
    setStatus("idle");
    if (data) onResult({ ...(data as Receipt), total_amount: data.total_amount === null ? null : Number(data.total_amount) });
  };

  const element = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
    </>
  );

  return {
    element,
    status,
    busy: status !== "idle",
    openCamera: () => cameraRef.current?.click(),
    openGallery: () => galleryRef.current?.click(),
  };
}

/** Selepas rekod disimpan: tandakan resit sebagai disahkan dengan butiran akhir. */
export async function confirmAttachedReceipt(receiptId: string, fields: { merchant: string | null; date: string; total: number }) {
  await getSupabase()
    .from("receipts")
    .update({ status: "confirmed", merchant: fields.merchant, receipt_date: fields.date, total_amount: fields.total })
    .eq("id", receiptId);
}

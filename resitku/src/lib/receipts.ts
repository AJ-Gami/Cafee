"use client";

import { getSupabase } from "@/lib/supabase/client";
import { currentYearKL } from "@/lib/format";
import type { Receipt } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Mampatkan gambar di browser: sisi panjang maksimum 1600px, JPEG. */
export async function compressImage(file: File): Promise<File> {
  const { default: imageCompression } = await import("browser-image-compression");
  try {
    const out = await imageCompression(file, {
      maxWidthOrHeight: 1600,
      maxSizeMB: 1.5,
      fileType: "image/jpeg",
      initialQuality: 0.82,
      useWebWorker: true,
    });
    return new File([out], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // Contohnya HEIC pada browser yang tidak menyokongnya: muat naik fail asal.
    return file;
  }
}

function extFor(file: File, isPdf: boolean): string {
  if (isPdf) return "pdf";
  const fromType = file.type.split("/")[1];
  if (fromType === "jpeg") return "jpg";
  if (fromType) return fromType.replace("+xml", "");
  return file.name.split(".").pop()?.toLowerCase() || "jpg";
}

/** Muat naik fail ke bucket 'receipts' dan pulangkan path + jenis fail. */
export async function uploadReceiptFile(file: File, userId: string): Promise<{ path: string; fileType: "image" | "pdf" }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("Hanya gambar atau PDF dibenarkan.");

  const prepared = isImage ? await compressImage(file) : file;
  if (prepared.size > MAX_UPLOAD_BYTES) throw new Error("Fail terlalu besar (maksimum 15 MB).");

  const path = `${userId}/${currentYearKL()}/${crypto.randomUUID()}.${extFor(prepared, isPdf)}`;
  const { error } = await getSupabase()
    .storage.from("receipts")
    .upload(path, prepared, { contentType: isPdf ? "application/pdf" : prepared.type || "image/jpeg", upsert: false });
  if (error) throw new Error(`Gagal memuat naik: ${error.message}`);
  return { path, fileType: isPdf ? "pdf" : "image" };
}

/** Muat naik fail dan cipta rekod resit (status processing) untuk dibaca AI. */
export async function createReceiptFromFile(file: File, userId: string): Promise<Receipt> {
  const { path, fileType } = await uploadReceiptFile(file, userId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("receipts")
    .insert({ user_id: userId, file_path: path, file_type: fileType, status: "processing", kind: "receipt" })
    .select()
    .single();
  if (error) {
    await supabase.storage.from("receipts").remove([path]);
    throw error;
  }
  return data as Receipt;
}

/** Panggil route scan AI. Melontar Error dengan mesej BM jika gagal. */
export async function scanReceipt(receiptId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/receipts/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptId }),
    });
  } catch {
    throw new Error("Tiada sambungan internet. Cuba lagi.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "AI gagal membaca resit.");
  }
}

/** Signed URL untuk paparan (sah 1 jam). */
export async function signedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await getSupabase().storage.from("receipts").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/**
 * Padam resit sepenuhnya: fail storan, rekod resit (item dipadam secara cascade) dan
 * belanja yang dipautkan. Dipanggil HANYA selepas pengguna mengesahkan.
 */
export async function deleteReceiptCompletely(receipt: Pick<Receipt, "id" | "file_path">, opts: { deleteExpense: boolean }) {
  const supabase = getSupabase();
  if (opts.deleteExpense) {
    const { error } = await supabase.from("expenses").delete().eq("receipt_id", receipt.id).is("vehicle_id", null);
    if (error) throw error;
  }
  const { error } = await supabase.from("receipts").delete().eq("id", receipt.id);
  if (error) throw error;
  if (receipt.file_path) await supabase.storage.from("receipts").remove([receipt.file_path]);
}

export const RECEIPT_DELETE_WARNING =
  "LHDN mensyaratkan resit disimpan 7 tahun. Resit yang dipadam tidak boleh dipulihkan.";

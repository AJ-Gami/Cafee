/**
 * Had pakej (Fasa 7). Buat masa ini semua ciri dibenarkan untuk semua pengguna.
 * Fasa 7 hanya perlu mengubah fungsi ini (contohnya: had 15 scan AI sebulan untuk Free,
 * dikira daripada jadual ai_usage).
 */
export type Feature = "receipt_scan" | "add_debt" | "add_vehicle" | "save_link";

export type LimitContext = {
  plan?: string;
  /** Bilangan scan AI bulan ini (daripada ai_usage), jika diketahui. */
  monthlyScans?: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function canUse(feature: Feature, context: LimitContext = {}): Promise<boolean> {
  return true;
}

/** Mesej yang dipaparkan bila had dicapai (digunakan dalam Fasa 7). */
export const LIMIT_MESSAGE = "Had pakej anda telah dicapai.";

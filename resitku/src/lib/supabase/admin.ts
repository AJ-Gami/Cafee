import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Klien service role: memintas RLS. Guna HANYA dalam route server yang sudah
 * menyemak kebenaran (contohnya skrin admin kategori cukai).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum ditetapkan.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

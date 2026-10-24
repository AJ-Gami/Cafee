import "server-only";

import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Semak pengguna ialah admin (ADMIN_EMAILS). Pulangkan klien service role atau respons ralat. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sila log masuk semula." }, { status: 401 }) } as const;
  if (!isAdminEmail(user.email)) return { error: NextResponse.json({ error: "Akses admin sahaja." }, { status: 403 }) } as const;
  try {
    return { admin: createAdminClient(), user } as const;
  } catch {
    return {
      error: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum ditetapkan di pelayan." }, { status: 500 }),
    } as const;
  }
}

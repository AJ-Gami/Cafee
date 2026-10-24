import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Hanya benarkan laluan dalaman (elak open redirect). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/**
 * Sasaran pautan OAuth (Google), pengesahan email dan set semula kata laluan.
 * Menyokong aliran PKCE (?code=) dan token_hash (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let error: string | null = searchParams.get("error_description");
  if (!error && code) {
    const res = await supabase.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (!error && tokenHash && type) {
    const res = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    error = res.error?.message ?? null;
  } else if (!error) {
    error = "Pautan tidak lengkap.";
  }

  if (error) {
    return NextResponse.redirect(`${origin}/log-masuk?error=${encodeURIComponent(error)}`);
  }
  const target = type === "recovery" ? "/set-semula-kata-laluan" : next;
  return NextResponse.redirect(`${origin}${target}`);
}

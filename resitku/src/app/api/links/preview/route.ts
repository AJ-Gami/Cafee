import { NextResponse, type NextRequest } from "next/server";
import { fetchLinkPreview } from "@/lib/linkPreview";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/links/preview?url=
 * Pratonton pautan (og:title, og:description, og:image). Gagal secara senyap: pulangkan medan kosong.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sila log masuk semula." }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url")?.trim();
  if (!url || url.length > 2048) return NextResponse.json({ error: "URL tidak sah." }, { status: 400 });

  try {
    const preview = await fetchLinkPreview(url);
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ title: null, description: null, image: null, url });
  }
}

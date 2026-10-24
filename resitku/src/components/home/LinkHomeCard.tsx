"use client";

import { ChevronRight, Heart, Link2 } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { getSupabase } from "@/lib/supabase/client";

/** Kad Pautan (biru) di Home. Pautan tiada tab sendiri; ketik untuk buka /pautan. */
export function LinkHomeCard() {
  const { data, loading } = useData(async () => {
    const supabase = getSupabase();
    const [count, fav, latest] = await Promise.all([
      supabase.from("links").select("id", { count: "exact", head: true }),
      supabase.from("links").select("id", { count: "exact", head: true }).eq("is_favourite", true),
      supabase.from("links").select("title, url").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { count: count.count ?? 0, fav: fav.count ?? 0, latest: latest.data as { title: string | null; url: string } | null };
  }, []);

  return (
    <Link href="/pautan" className="flex items-center gap-3 rounded-2xl bg-link p-4 text-white active:opacity-90">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
        <Link2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-white/70">Pautan</p>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-32 bg-white/20" />
        ) : data && data.count > 0 ? (
          <>
            <p className="font-bold">
              {data.count} pautan disimpan
              {data.fav > 0 ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-white/80">
                  <Heart className="size-3 fill-current" /> {data.fav}
                </span>
              ) : null}
            </p>
            {data.latest ? <p className="truncate text-xs text-white/70">Terkini: {data.latest.title || data.latest.url}</p> : null}
          </>
        ) : (
          <p className="text-sm font-semibold">Simpan pautan resipi, artikel atau produk</p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-white/70" />
    </Link>
  );
}

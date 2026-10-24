import { redirect } from "next/navigation";

/**
 * Sasaran Web Share Target (manifest). Android biasanya menghantar URL dalam `text`.
 * Alihkan ke /pautan dengan borang Simpan pautan yang telah diisi.
 */
export default async function SharePage({ searchParams }: PageProps<"/kongsi">) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const text = first(sp.text);
  const title = first(sp.title);
  const url = first(sp.url) || text.match(/https?:\/\/[^\s<>"']+/i)?.[0] || "";
  if (!url) redirect("/pautan");
  const qs = new URLSearchParams({ simpan: url });
  if (title) qs.set("tajuk", title);
  redirect(`/pautan?${qs.toString()}`);
}

import type { Metadata } from "next";
import { TaxCategoryDetail } from "./TaxCategoryDetail";

export const metadata: Metadata = { title: "Kategori cukai" };

export default async function TaxCategoryPage({ params, searchParams }: PageProps<"/belanja/cukai/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const year = Number(Array.isArray(sp.tahun) ? sp.tahun[0] : sp.tahun) || null;
  return <TaxCategoryDetail id={id} year={year} />;
}

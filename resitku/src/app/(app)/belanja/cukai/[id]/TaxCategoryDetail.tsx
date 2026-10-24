"use client";

import { ChevronRight, FileText, HandCoins, Pencil, Receipt as ReceiptIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ZakatSheet, type ZakatPayment } from "@/components/tax/ZakatSheet";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { currentYearKL, formatDate, formatRM } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { computeTaxUsage, fetchTaxCategories, fetchTaxItems, fetchZakatTotal, normalizeTaxCategory } from "@/lib/tax";
import { BENEFICIARY_LABELS } from "@/lib/types";

async function load(id: string, yearHint: number | null) {
  const supabase = getSupabase();
  const { data: row, error } = await supabase.from("tax_relief_categories").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const category = normalizeTaxCategory(row);
  const year = category.assessment_year ?? yearHint ?? currentYearKL();
  const [categories, items, zakatTotal] = await Promise.all([fetchTaxCategories(year, { includeInactive: true }), fetchTaxItems(year), fetchZakatTotal(year)]);
  const summary = computeTaxUsage(categories, items, zakatTotal);
  const ids = new Set([id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const ownItems = items
    .filter((i) => ids.has(i.tax_category_id))
    .sort((a, b) => (b.receipt.receipt_date ?? "").localeCompare(a.receipt.receipt_date ?? ""));
  let zakat: ZakatPayment[] = [];
  if (category.code === "ZAKAT") {
    const { data } = await supabase
      .from("zakat_payments")
      .select("id, paid_date, amount, type, institution, receipt_id")
      .gte("paid_date", `${year}-01-01`)
      .lte("paid_date", `${year}-12-31`)
      .order("paid_date", { ascending: false });
    zakat = (data ?? []).map((z) => ({ ...(z as ZakatPayment), amount: Number(z.amount) }));
  }
  return { category, year, usage: summary.byId.get(id), items: ownItems, catName, zakat };
}

export function TaxCategoryDetail({ id, year }: { id: string; year: number | null }) {
  const { success, error } = useToast();
  const { data, loading, error: loadError, reload } = useData(() => load(id, year), [id, year]);
  const [editing, setEditing] = useState<ZakatPayment | null>(null);
  const [deleting, setDeleting] = useState<ZakatPayment | null>(null);
  const [busy, setBusy] = useState(false);

  const removeZakat = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const { error: err } = await getSupabase().from("zakat_payments").delete().eq("id", deleting.id);
      if (err) throw err;
      success("Rekod zakat dipadam.");
      setDeleting(null);
      reload();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main>
        <PageHeader title="Kategori cukai" back="/belanja?tab=cukai" />
        <div className="flex flex-col gap-3 px-4">
          <SkeletonCard className="h-32" />
          <SkeletonList rows={4} />
        </div>
      </main>
    );
  }
  if (loadError || !data) {
    return (
      <main>
        <PageHeader title="Kategori cukai" back="/belanja?tab=cukai" />
        <div className="px-4">
          <EmptyState icon={FileText} title="Kategori tidak dijumpai" text={loadError ?? undefined} />
        </div>
      </main>
    );
  }

  const { category, usage, items, catName, zakat } = data;
  const cap = category.cap_amount;
  const isZakat = category.code === "ZAKAT";

  return (
    <main>
      <PageHeader title={category.name} eyebrow={`YA ${data.year}`} back="/belanja?tab=cukai" />
      <div className="flex flex-col gap-3 px-4">
        <div className="rounded-2xl bg-tax p-4 text-white">
          <p className="eyebrow text-white/70">{isZakat ? "Jumlah rebat" : "Digunakan"}</p>
          <p className="mt-1 text-3xl font-extrabold">{formatRM(usage?.used ?? 0)}</p>
          {cap !== null ? (
            <>
              <p className="text-sm text-white/80">
                daripada had {formatRM(cap)} · baki {formatRM(Math.max(0, cap - (usage?.used ?? 0)))}
              </p>
              <ProgressBar value={usage?.used ?? 0} max={cap} className="mt-3 bg-white/20" />
            </>
          ) : (
            <p className="text-sm text-white/80">Tiada had</p>
          )}
          {usage && usage.excess > 0 ? <p className="mt-2 text-sm font-semibold text-red-200">Lebihan {formatRM(usage.excess)} tidak boleh dituntut</p> : null}
        </div>
        {category.description ? <p className="px-1 text-sm text-muted">{category.description}</p> : null}
        {category.notes ? <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{category.notes}</p> : null}

        {isZakat ? (
          zakat.length === 0 ? (
            <EmptyState icon={HandCoins} title="Belum ada rekod zakat" text="Rekod bayaran zakat atau fitrah dari tracker cukai." />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {zakat.map((z) => (
                <div key={z.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{z.institution || (z.type === "fitrah" ? "Fitrah" : "Zakat")}</p>
                    <p className="text-xs text-muted">
                      {z.type === "fitrah" ? "Fitrah" : "Zakat"} · {formatDate(z.paid_date)}
                    </p>
                  </div>
                  <p className="font-bold">{formatRM(z.amount)}</p>
                  {z.receipt_id ? (
                    <Link href={`/belanja/resit/${z.receipt_id}`} aria-label="Lihat resit" className="grid size-9 place-items-center rounded-xl active:bg-canvas">
                      <ReceiptIcon className="size-4" />
                    </Link>
                  ) : null}
                  <button type="button" aria-label="Edit" onClick={() => setEditing(z)} className="grid size-9 place-items-center rounded-xl active:bg-canvas">
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" aria-label="Padam" onClick={() => setDeleting(z)} className="grid size-9 place-items-center rounded-xl text-red-600 active:bg-red-50">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </Card>
          )
        ) : items.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="Belum ada item" text="Tandakan item resit dengan kategori ini semasa semakan, atau tambah tuntutan manual." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {items.map((i) => (
              <Link key={i.id} href={`/belanja/resit/${i.receipt_id}`} className="flex items-center gap-3 px-3 py-3 active:bg-canvas">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas">
                  {i.receipt.kind === "statement" ? <FileText className="size-5" /> : <ReceiptIcon className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {i.receipt.merchant ?? "Resit"} · {formatDate(i.receipt.receipt_date)}
                    {i.beneficiary ? ` · ${BENEFICIARY_LABELS[i.beneficiary]}` : ""}
                    {i.tax_category_id !== category.id ? ` · ${catName.get(i.tax_category_id)}` : ""}
                  </span>
                </span>
                <span className="font-bold">{formatRM(i.amount)}</span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            ))}
          </Card>
        )}
        {isZakat ? <Button variant="secondary" onClick={() => setEditing({ id: "", paid_date: "", amount: 0, type: "zakat", institution: null, receipt_id: null })}>Rekod zakat / fitrah</Button> : null}
      </div>
      {editing ? <ZakatSheet payment={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Padam rekod zakat?"
        message="Resit yang dilampirkan (jika ada) tidak dipadam."
        loading={busy}
        onConfirm={removeZakat}
        onClose={() => setDeleting(null)}
      />
    </main>
  );
}

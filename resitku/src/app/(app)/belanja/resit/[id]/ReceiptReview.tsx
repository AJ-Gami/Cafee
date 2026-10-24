"use client";

import { AlertCircle, RefreshCw, ScanLine } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ReceiptImage } from "@/components/receipts/ReceiptImage";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { scanReceipt } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import type { Expense, Receipt, ReceiptItem } from "@/lib/types";
import { ReviewForm } from "./ReviewForm";

export type ReceiptBundle = {
  receipt: Receipt;
  items: ReceiptItem[];
  expense: Expense | null;
  zakatPaymentId: string | null;
};

async function loadBundle(id: string): Promise<ReceiptBundle | null> {
  const supabase = getSupabase();
  const { data: receipt, error } = await supabase.from("receipts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!receipt) return null;
  const [items, expense, zakat] = await Promise.all([
    supabase.from("receipt_items").select("*").eq("receipt_id", id).order("sort_order"),
    supabase.from("expenses").select("*").eq("receipt_id", id).limit(1).maybeSingle(),
    supabase.from("zakat_payments").select("id").eq("receipt_id", id).limit(1).maybeSingle(),
  ]);
  if (items.error) throw new Error(items.error.message);
  return {
    receipt: { ...(receipt as Receipt), total_amount: receipt.total_amount === null ? null : Number(receipt.total_amount) },
    items: (items.data ?? []).map((i) => ({ ...(i as ReceiptItem), amount: Number(i.amount), quantity: Number(i.quantity) })),
    expense: expense.data ? { ...(expense.data as Expense), amount: Number(expense.data.amount) } : null,
    zakatPaymentId: zakat.error ? null : ((zakat.data?.id as string | undefined) ?? null),
  };
}

export function ReceiptReview({ id }: { id: string }) {
  const params = useSearchParams();
  const { error: toastError } = useToast();
  const { data, loading, error, reload } = useData(() => loadBundle(id), [id]);
  const autoScan = params.get("imbas") === "1";
  const triggered = useRef(false);
  const [scanning, setScanning] = useState(false);

  const runScan = async () => {
    setScanning(true);
    try {
      await scanReceipt(id);
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setScanning(false);
      reload();
    }
  };

  // Imbas automatik sekali sahaja bila datang terus dari aliran snap (?imbas=1).
  const startAutoScan = useEffectEvent(() => {
    triggered.current = true;
    void runScan();
  });
  const shouldAutoScan = autoScan && data?.receipt.status === "processing";
  useEffect(() => {
    if (shouldAutoScan && !triggered.current) startAutoScan();
  }, [shouldAutoScan]);

  if (loading) {
    return (
      <main>
        <PageHeader title="Semak resit" back="/belanja" />
        <div className="flex flex-col gap-3 px-4">
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-40" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main>
        <PageHeader title="Semak resit" back="/belanja" />
        <div className="px-4">
          <EmptyState
            icon={AlertCircle}
            title={error ? "Gagal memuatkan resit" : "Resit tidak dijumpai"}
            text={error ?? "Resit ini mungkin telah dipadam."}
            action={error ? <Button onClick={reload}>Cuba lagi</Button> : undefined}
          />
        </div>
      </main>
    );
  }

  if (data.receipt.status === "processing" || scanning) {
    const inFlight = scanning || shouldAutoScan;
    return (
      <main>
        <PageHeader title="Membaca resit" eyebrow="AI" back="/belanja" />
        <div className="flex flex-col gap-3 px-4">
          <div className="relative">
            <ReceiptImage path={data.receipt.file_path} fileType={data.receipt.file_type} className="h-64" />
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute inset-x-0 h-1/3 animate-pulse bg-gradient-to-b from-accent/0 via-accent/40 to-accent/0" />
            </div>
          </div>
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft">
              {inFlight ? <Spinner className="size-5" /> : <ScanLine className="size-5" />}
            </span>
            <div className="flex-1">
              <p className="font-semibold">{inFlight ? "AI sedang membaca resit…" : "Resit belum dibaca"}</p>
              <p className="text-sm text-muted">{inFlight ? "Biasanya 5–15 saat." : "Ketik untuk mula membaca dengan AI."}</p>
            </div>
          </Card>
          {inFlight ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-2/3" />
            </div>
          ) : (
            <Button onClick={runScan}>
              <RefreshCw className="size-4" /> Baca dengan AI
            </Button>
          )}
        </div>
      </main>
    );
  }

  return <ReviewForm key={data.receipt.updated_at} bundle={data} onRescan={runScan} />;
}

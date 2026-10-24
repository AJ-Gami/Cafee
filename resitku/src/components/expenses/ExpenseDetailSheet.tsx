"use client";

import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Car, ChevronRight, Pencil, Receipt as ReceiptIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ReceiptImage } from "@/components/receipts/ReceiptImage";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { formatDate, formatRM } from "@/lib/format";
import { deleteReceiptCompletely, RECEIPT_DELETE_WARNING } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory, Receipt } from "@/lib/types";

export function ExpenseDetailSheet({
  expense,
  category,
  onClose,
  onEdit,
  onDeleted,
}: {
  expense: Expense;
  category: ExpenseCategory | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { success, error } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleteReceipt, setDeleteReceipt] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: receipt } = useData(async () => {
    if (!expense.receipt_id) return null;
    const { data } = await getSupabase().from("receipts").select("id, file_path, file_type, kind").eq("id", expense.receipt_id).maybeSingle();
    return data as Pick<Receipt, "id" | "file_path" | "file_type" | "kind"> | null;
  }, [expense.receipt_id]);

  const remove = async () => {
    setDeleting(true);
    try {
      if (receipt && deleteReceipt) {
        await deleteReceiptCompletely(receipt, { deleteExpense: true });
      } else {
        const { error: err } = await getSupabase().from("expenses").delete().eq("id", expense.id);
        if (err) throw err;
      }
      success(deleteReceipt ? "Belanja dan resit dipadam." : "Belanja dipadam.");
      onDeleted();
      onClose();
    } catch (e) {
      error(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <>
      <BottomSheet open onClose={onClose} title="Butiran belanja">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft">
              <CategoryIcon name={category?.icon} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{expense.merchant || category?.name || "Belanja"}</p>
              <p className="text-sm text-muted">
                {category?.name ?? "Tiada kategori"} · {formatDate(expense.expense_date)}
              </p>
            </div>
            <p className="text-xl font-extrabold">{formatRM(expense.amount)}</p>
          </div>
          {expense.note ? <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm">{expense.note}</p> : null}

          {receipt?.file_path ? <ReceiptImage path={receipt.file_path} fileType={receipt.file_type} className="h-48" /> : null}
          {receipt ? (
            <Link href={`/belanja/resit/${receipt.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 active:bg-canvas">
              <ReceiptIcon className="size-5" />
              <span className="flex-1 font-semibold">Lihat item & kategori cukai</span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ) : null}

          {expense.vehicle_id ? (
            <Link href={`/kenderaan/${expense.vehicle_id}`} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <Car className="size-5 shrink-0" />
              <span className="flex-1">Belanja ini dicipta daripada rekod kenderaan. Edit atau padam melalui tab Kenderaan.</span>
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <div className="flex gap-3 pb-3">
              <Button variant="danger" className="flex-1" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" /> Padam
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onEdit}>
                <Pencil className="size-4" /> Edit
              </Button>
            </div>
          )}
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirming}
        title="Padam belanja ini?"
        message={receipt ? "Belanja ini mempunyai resit yang dilampirkan." : "Tindakan ini tidak boleh dibatalkan."}
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      >
        {receipt ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-red-600" checked={deleteReceipt} onChange={(e) => setDeleteReceipt(e.target.checked)} />
              <span>Padam juga resit (gambar dan item cukai)</span>
            </label>
            {deleteReceipt ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{RECEIPT_DELETE_WARNING}</p> : null}
            {!deleteReceipt ? <p className="text-xs text-muted">Resit akan disimpan dan masih dikira dalam tracker cukai.</p> : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

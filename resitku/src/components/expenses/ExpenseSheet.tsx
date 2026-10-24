"use client";

import { Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { formatRM, parseAmount, todayKL } from "@/lib/format";
import { uploadReceiptFile } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { CategorySelect } from "./CategorySelect";

/** Borang tambah / edit belanja manual. Gambar resit pilihan (tanpa bacaan AI). */
export function ExpenseSheet({
  open,
  onClose,
  expense,
  categories,
  onCategoriesChange,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  categories: ExpenseCategory[];
  onCategoriesChange: (list: ExpenseCategory[]) => void;
  onSaved: () => void;
}) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.expense_date ?? todayKL());
  const [merchant, setMerchant] = useState(expense?.merchant ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category_id ?? null);
  const [note, setNote] = useState(expense?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = parseAmount(amount);
    if (value === null || value <= 0) return error("Masukkan jumlah yang sah.");
    if (!date) return error("Pilih tarikh.");
    if (!categoryId) return error("Pilih kategori.");
    setSaving(true);
    const supabase = getSupabase();
    try {
      let receiptId = expense?.receipt_id ?? null;
      if (file) {
        const { path, fileType } = await uploadReceiptFile(file, userId);
        const { data, error: err } = await supabase
          .from("receipts")
          .insert({
            user_id: userId,
            file_path: path,
            file_type: fileType,
            merchant: merchant.trim() || null,
            receipt_date: date,
            total_amount: value,
            status: "confirmed",
            kind: "receipt",
          })
          .select("id")
          .single();
        if (err) throw err;
        receiptId = data.id;
      }
      const payload = {
        user_id: userId,
        expense_date: date,
        amount: value,
        merchant: merchant.trim() || null,
        category_id: categoryId,
        note: note.trim() || null,
        receipt_id: receiptId,
      };
      const res = expense
        ? await supabase.from("expenses").update(payload).eq("id", expense.id)
        : await supabase.from("expenses").insert(payload);
      if (res.error) throw res.error;
      // Selaraskan resit yang dipautkan (tarikh/jumlah) supaya tahun taksiran kekal betul.
      if (expense?.receipt_id && !file) {
        await supabase
          .from("receipts")
          .update({ receipt_date: date, total_amount: value, merchant: merchant.trim() || null })
          .eq("id", expense.receipt_id)
          .eq("kind", "receipt");
      }
      success(expense ? "Belanja dikemas kini." : `Disimpan: ${formatRM(value)}`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={expense ? "Edit belanja" : "Tambah belanja"} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Field label="Jumlah" htmlFor="exp-amount">
          <MoneyInput id="exp-amount" value={amount} onChange={setAmount} autoFocus={!expense} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarikh" htmlFor="exp-date">
            <Input id="exp-date" type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Kedai" htmlFor="exp-merchant">
            <Input id="exp-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Pilihan" />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Kategori</p>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCreated={(c) => onCategoriesChange([...categories, c])}
          />
        </div>
        <Field label="Nota" htmlFor="exp-note">
          <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilihan" rows={2} />
        </Field>
        {!expense?.receipt_id ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Gambar resit (pilihan)</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                <Paperclip className="size-4 shrink-0" />
                <span className="flex-1 truncate">{file.name}</span>
                <button type="button" aria-label="Buang lampiran" onClick={() => setFile(null)} className="text-muted">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-semibold text-muted"
              >
                <Paperclip className="size-4" /> Lampirkan gambar atau PDF
              </button>
            )}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

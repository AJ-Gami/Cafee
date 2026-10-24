"use client";

import { Paperclip, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input, MoneyInput, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { formatRM, parseAmount, todayKL } from "@/lib/format";
import { uploadReceiptFile } from "@/lib/receipts";
import { getSupabase } from "@/lib/supabase/client";
import { orderWithChildren, taxOptionLabel } from "@/lib/tax";
import { BENEFICIARY_LABELS, type Beneficiary, type TaxCategory } from "@/lib/types";

/**
 * Tuntutan manual (penyata premium, KWSP, SSPN, PRS…). Mencipta resit kind=statement
 * dengan satu item, dan boleh melampirkan dokumen.
 */
export function TaxClaimSheet({
  year,
  categories,
  onClose,
  onSaved,
}: {
  year: number;
  categories: TaxCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => {
    const list = orderWithChildren(categories.filter((c) => c.code !== "ZAKAT"));
    // Kategori berasaskan penyata dahulu kerana itulah kegunaan utama borang ini.
    return [...list.filter((c) => c.proof_type === "statement"), ...list.filter((c) => c.proof_type !== "statement")];
  }, [categories]);
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? "");
  const [date, setDate] = useState(() => (Number(todayKL().slice(0, 4)) === year ? todayKL() : `${year}-12-31`));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const category = options.find((c) => c.id === categoryId);
  const allowed = category?.allowed_beneficiaries ?? [];

  const save = async () => {
    const value = parseAmount(amount);
    if (!category) return error("Pilih kategori.");
    if (value === null || value <= 0) return error("Masukkan jumlah yang sah.");
    if (!date.startsWith(String(year))) return error(`Tarikh mesti dalam tahun ${year}.`);
    if (allowed.length > 1 && !beneficiary) return error("Pilih untuk siapa tuntutan ini.");
    setSaving(true);
    const supabase = getSupabase();
    try {
      const uploaded = file ? await uploadReceiptFile(file, userId) : null;
      const { data: receipt, error: rErr } = await supabase
        .from("receipts")
        .insert({
          user_id: userId,
          kind: "statement",
          status: "confirmed",
          merchant: description.trim() || category.name,
          receipt_date: date,
          total_amount: value,
          file_path: uploaded?.path ?? null,
          file_type: uploaded?.fileType ?? null,
        })
        .select("id")
        .single();
      if (rErr) throw rErr;
      const { error: iErr } = await supabase.from("receipt_items").insert({
        receipt_id: receipt.id,
        user_id: userId,
        name: description.trim() || category.name,
        quantity: 1,
        amount: value,
        tax_category_id: category.id,
        beneficiary: allowed.length === 1 ? allowed[0] : beneficiary,
      });
      if (iErr) {
        await supabase.from("receipts").delete().eq("id", receipt.id);
        throw iErr;
      }
      success(`Tuntutan ${category.name} ${formatRM(value)} disimpan.`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title="Tambah tuntutan manual" onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Untuk penyata premium insurans, KWSP, SSPN, PRS, PERKESO dan seumpamanya.</p>
        <Field label="Kategori cukai" htmlFor="claim-cat" hint={category?.notes ?? undefined}>
          <Select
            id="claim-cat"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setBeneficiary(null);
            }}
          >
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {taxOptionLabel(c, options)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah" htmlFor="claim-amount">
            <MoneyInput id="claim-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Tarikh" htmlFor="claim-date">
            <Input id="claim-date" type="date" value={date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Penerangan / institusi" htmlFor="claim-desc">
          <Input id="claim-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Penyata KWSP 2026" />
        </Field>
        {allowed.length > 1 ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Untuk siapa?</p>
            <div className="flex flex-wrap gap-2">
              {allowed.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={beneficiary === b}
                  onClick={() => setBeneficiary(b)}
                  className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${beneficiary === b ? "border-ink bg-ink text-white" : "border-line"}`}
                >
                  {BENEFICIARY_LABELS[b]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p className="mb-1.5 text-sm font-semibold">Dokumen (pilihan)</p>
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
              <Paperclip className="size-4" /> Lampirkan penyata (gambar / PDF)
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

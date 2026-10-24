"use client";

import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input, MoneyInput } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { formatRM, parseAmount, todayKL } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";

export type ZakatPayment = {
  id: string;
  paid_date: string;
  amount: number;
  type: "zakat" | "fitrah";
  institution: string | null;
  receipt_id: string | null;
};

export function ZakatSheet({ payment, onClose, onSaved }: { payment?: ZakatPayment | null; onClose: () => void; onSaved: () => void }) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const [type, setType] = useState<"zakat" | "fitrah">(payment?.type ?? "zakat");
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [date, setDate] = useState(payment?.paid_date ?? todayKL());
  const [institution, setInstitution] = useState(payment?.institution ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = parseAmount(amount);
    if (value === null || value <= 0) return error("Masukkan jumlah yang sah.");
    setSaving(true);
    try {
      const payload = { user_id: userId, type, amount: value, paid_date: date, institution: institution.trim() || null };
      const res = payment
        ? await getSupabase().from("zakat_payments").update(payload).eq("id", payment.id)
        : await getSupabase().from("zakat_payments").insert(payload);
      if (res.error) throw res.error;
      success(`${type === "fitrah" ? "Fitrah" : "Zakat"} ${formatRM(value)} direkod.`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={payment ? "Edit zakat" : "Rekod zakat"} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "zakat", label: "Zakat" },
            { value: "fitrah", label: "Fitrah" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah" htmlFor="zakat-amount">
            <MoneyInput id="zakat-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Tarikh bayar" htmlFor="zakat-date">
            <Input id="zakat-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Institusi" htmlFor="zakat-inst">
          <Input id="zakat-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Contoh: Lembaga Zakat Selangor" />
        </Field>
        <p className="text-xs text-muted">Zakat dan fitrah ialah rebat: ditolak terus daripada cukai yang perlu dibayar.</p>
      </div>
    </BottomSheet>
  );
}

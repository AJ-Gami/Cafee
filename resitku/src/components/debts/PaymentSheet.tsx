"use client";

import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input, MoneyInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { DIRECTION_LABELS, type Debt } from "@/lib/debts";
import { formatRM, parseAmount, round2, todayKL } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";

export function PaymentSheet({ debt, onClose, onSaved }: { debt: Debt; onClose: () => void; onSaved: () => void }) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const [amount, setAmount] = useState(debt.min_payment ? String(Math.min(debt.min_payment, debt.current_balance)) : "");
  const [date, setDate] = useState(todayKL());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const value = parseAmount(amount);
  const over = value !== null && value > debt.current_balance;

  const save = async () => {
    if (value === null || value <= 0) return error("Masukkan jumlah yang sah.");
    if (over) return error(`Jumlah melebihi baki ${formatRM(debt.current_balance)}.`);
    setSaving(true);
    try {
      const { error: err } = await getSupabase()
        .from("debt_payments")
        .insert({ user_id: userId, debt_id: debt.id, paid_date: date, amount: value, note: note.trim() || null });
      if (err) throw err;
      const left = round2(debt.current_balance - value);
      success(left <= 0 ? `Tahniah! ${debt.name} selesai sepenuhnya 🎉` : `Dicatat. Baki ${debt.name}: ${formatRM(left)}`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={DIRECTION_LABELS[debt.direction].record} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-canvas px-3 py-2.5 text-sm">
          <span className="font-semibold">{debt.name}</span> · baki {formatRM(debt.current_balance)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah" htmlFor="pay-amount" error={over ? "Melebihi baki" : null}>
            <MoneyInput id="pay-amount" value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Tarikh" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <button type="button" onClick={() => setAmount(String(debt.current_balance))} className="self-start text-sm font-semibold underline">
          Bayar penuh ({formatRM(debt.current_balance)})
        </button>
        <Field label="Nota" htmlFor="pay-note">
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilihan" />
        </Field>
      </div>
    </BottomSheet>
  );
}

"use client";

import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { normalizeMyPhone, type Debt, type DebtDirection } from "@/lib/debts";
import { parseAmount } from "@/lib/format";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { getSupabase } from "@/lib/supabase/client";

export function DebtSheet({
  direction,
  debt,
  onClose,
  onSaved,
}: {
  direction: DebtDirection;
  debt?: Debt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId, plan } = useSession();
  const { success, error } = useToast();
  const owe = direction === "i_owe";
  const [name, setName] = useState(debt?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(debt?.whatsapp_number ?? "");
  const [original, setOriginal] = useState(debt ? String(debt.original_amount) : "");
  const [balance, setBalance] = useState(debt ? String(debt.current_balance) : "");
  const [minPayment, setMinPayment] = useState(debt?.min_payment != null ? String(debt.min_payment) : "");
  const [term, setTerm] = useState(debt?.term_years != null ? String(debt.term_years) : "");
  const [rate, setRate] = useState(debt?.interest_rate != null ? String(debt.interest_rate) : "");
  const [note, setNote] = useState(debt?.note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const originalValue = parseAmount(original);
    const balanceValue = balance.trim() ? parseAmount(balance) : originalValue;
    if (!name.trim()) return error(owe ? "Masukkan nama hutang." : "Masukkan nama orang.");
    if (originalValue === null || originalValue <= 0) return error("Masukkan jumlah asal yang sah.");
    if (balanceValue === null || balanceValue < 0) return error("Masukkan baki semasa yang sah.");
    if (whatsapp.trim() && !normalizeMyPhone(whatsapp)) return error("Nombor WhatsApp tidak sah. Contoh: 012-345 6789");
    if (!debt && !(await canUse("add_debt", { plan }))) return error(LIMIT_MESSAGE);
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        direction,
        name: name.trim(),
        whatsapp_number: owe ? null : whatsapp.trim() || null,
        original_amount: originalValue,
        current_balance: balanceValue,
        min_payment: owe && minPayment.trim() ? parseAmount(minPayment) : null,
        term_years: owe && term.trim() ? Number(term) || null : null,
        interest_rate: owe && rate.trim() ? Number(rate) || null : null,
        note: note.trim() || null,
      };
      const res = debt
        ? await getSupabase().from("debts").update(payload).eq("id", debt.id)
        : await getSupabase().from("debts").insert(payload);
      if (res.error) throw res.error;
      success(debt ? "Hutang dikemas kini." : "Hutang ditambah.");
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const title = debt ? "Edit hutang" : owe ? "Tambah hutang" : "Tambah orang berhutang";

  return (
    <BottomSheet open onClose={onClose} title={title} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Field label={owe ? "Nama hutang" : "Siapa"} htmlFor="debt-name">
          <Input
            id="debt-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={owe ? "Contoh: PTPTN, Kad kredit Maybank" : "Contoh: Ali"}
            autoFocus={!debt}
          />
        </Field>
        {!owe ? (
          <Field label="WhatsApp (pilihan)" htmlFor="debt-wa" hint="Untuk butang peringatan melalui WhatsApp.">
            <Input id="debt-wa" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="012-345 6789" />
          </Field>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah asal" htmlFor="debt-original">
            <MoneyInput id="debt-original" value={original} onChange={setOriginal} />
          </Field>
          <Field label="Baki semasa" htmlFor="debt-balance" hint={!debt ? "Kosong = sama dengan asal" : undefined}>
            <MoneyInput id="debt-balance" value={balance} onChange={setBalance} placeholder={original || "0.00"} />
          </Field>
        </div>
        {owe ? (
          <>
            <Field label="Bayaran minimum sebulan (pilihan)" htmlFor="debt-min">
              <MoneyInput id="debt-min" value={minPayment} onChange={setMinPayment} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tempoh (tahun)" htmlFor="debt-term">
                <Input id="debt-term" inputMode="decimal" value={term} onChange={(e) => setTerm(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Pilihan" />
              </Field>
              <Field label="Faedah (% setahun)" htmlFor="debt-rate">
                <Input id="debt-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Pilihan" />
              </Field>
            </div>
          </>
        ) : null}
        <Field label="Nota" htmlFor="debt-note">
          <Textarea id="debt-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilihan" />
        </Field>
      </div>
    </BottomSheet>
  );
}

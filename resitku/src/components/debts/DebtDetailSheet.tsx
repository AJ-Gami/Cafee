"use client";

import { MessageCircle, Pencil, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { DIRECTION_LABELS, whatsappReminderUrl, type Debt, type DebtPayment } from "@/lib/debts";
import { formatDate, formatRM } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";

export function DebtDetailSheet({
  debt,
  onClose,
  onEdit,
  onPay,
  onChanged,
}: {
  debt: Debt;
  onClose: () => void;
  onEdit: () => void;
  onPay: () => void;
  onChanged: () => void;
}) {
  const { displayName } = useSession();
  const { success, error } = useToast();
  const [confirm, setConfirm] = useState<"debt" | DebtPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = DIRECTION_LABELS[debt.direction];
  const { data: payments, reload } = useData(async () => {
    const { data, error: err } = await getSupabase().from("debt_payments").select("*").eq("debt_id", debt.id).order("paid_date", { ascending: false });
    if (err) throw new Error(err.message);
    return (data ?? []).map((p) => ({ ...(p as DebtPayment), amount: Number(p.amount) }));
  }, [debt.id, debt.current_balance]);
  const wa = debt.direction === "owed_to_me" ? whatsappReminderUrl(debt, displayName) : null;
  const paid = Math.max(0, debt.original_amount - debt.current_balance);

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "debt") {
        const { error: err } = await getSupabase().from("debts").delete().eq("id", debt.id);
        if (err) throw err;
        success("Hutang dipadam.");
        onChanged();
        onClose();
      } else {
        const { error: err } = await getSupabase().from("debt_payments").delete().eq("id", confirm.id);
        if (err) throw err;
        success("Bayaran dipadam. Baki dikemas kini.");
        setConfirm(null);
        reload();
        onChanged();
      }
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet open onClose={onClose} title={debt.name}>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-debt p-4 text-white">
            <p className="eyebrow text-white/60">Baki</p>
            <p className="text-3xl font-extrabold">{formatRM(debt.current_balance)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-accent" style={{ width: `${debt.original_amount > 0 ? Math.min(100, (paid / debt.original_amount) * 100) : 0}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-white/70">
              {labels.paid} {formatRM(paid)} daripada {formatRM(debt.original_amount)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            {debt.min_payment != null ? <Info label="Bayaran minimum" value={formatRM(debt.min_payment)} /> : null}
            {debt.interest_rate != null ? <Info label="Faedah" value={`${debt.interest_rate}% setahun`} /> : null}
            {debt.term_years != null ? <Info label="Tempoh" value={`${debt.term_years} tahun`} /> : null}
            {debt.whatsapp_number ? <Info label="WhatsApp" value={debt.whatsapp_number} /> : null}
          </dl>
          {debt.note ? <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm">{debt.note}</p> : null}

          {debt.status === "active" ? (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={onPay}>
                <Wallet className="size-4" /> {labels.record}
              </Button>
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 font-semibold text-white">
                  <MessageCircle className="size-4" /> Ingatkan
                </a>
              ) : null}
            </div>
          ) : null}

          <div>
            <h3 className="eyebrow mb-2 text-muted">Sejarah bayaran</h3>
            {!payments ? null : payments.length === 0 ? (
              <p className="text-sm text-muted">Belum ada bayaran dicatat.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{formatDate(p.paid_date)}</p>
                      {p.note ? <p className="truncate text-xs text-muted">{p.note}</p> : null}
                    </div>
                    <span className="font-bold">{formatRM(p.amount)}</span>
                    <button type="button" aria-label="Padam bayaran" onClick={() => setConfirm(p)} className="grid size-8 place-items-center rounded-lg text-muted active:bg-canvas">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3 pb-3">
            <Button variant="danger" className="flex-1" onClick={() => setConfirm("debt")}>
              <Trash2 className="size-4" /> Padam
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onEdit}>
              <Pencil className="size-4" /> Edit
            </Button>
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "debt" ? "Padam hutang ini?" : "Padam bayaran ini?"}
        message={confirm === "debt" ? "Semua sejarah bayaran untuk hutang ini juga akan dipadam." : "Baki hutang akan ditambah semula."}
        loading={busy}
        onConfirm={doDelete}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

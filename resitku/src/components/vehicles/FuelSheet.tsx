"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { confirmAttachedReceipt, useInlineReceiptScan } from "@/components/receipts/useInlineReceiptScan";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, MoneyInput, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { formatRM, parseAmount, todayKL } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import type { ParsedReceipt } from "@/lib/types";
import type { FuelLog, Vehicle } from "@/lib/vehicles";
import { ReceiptAttach } from "./ReceiptAttach";

/** Cuba cari liter daripada item resit minyak (contohnya "RON95 30.25L"). */
function litersFromReceipt(ocr: unknown): string | null {
  const items = (ocr as Partial<ParsedReceipt> | null)?.items ?? [];
  for (const item of items) {
    const m = item.name.match(/(\d+(?:\.\d+)?)\s*(?:l|liter|litre|ltr)\b/i);
    if (m) return m[1]!;
    if (/ron|diesel|petrol|primax|v-power|fuelsave/i.test(item.name) && item.quantity > 1 && item.quantity < 200) return String(item.quantity);
  }
  return null;
}

export function FuelSheet({
  vehicles,
  vehicleId,
  log,
  onClose,
  onSaved,
}: {
  vehicles: Vehicle[];
  vehicleId?: string | null;
  log?: FuelLog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const [vid, setVid] = useState(log?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "");
  const [date, setDate] = useState(log?.fill_date ?? todayKL());
  const [amount, setAmount] = useState(log ? log.amount.toFixed(2) : "");
  const [liters, setLiters] = useState(log?.liters != null ? String(log.liters) : "");
  const [odometer, setOdometer] = useState(log?.odometer != null ? String(log.odometer) : "");
  const [station, setStation] = useState(log?.station ?? "");
  const [receiptId, setReceiptId] = useState<string | null>(log?.receipt_id ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scan = useInlineReceiptScan((r) => {
    setReceiptId(r.id);
    if (r.total_amount != null) setAmount(r.total_amount.toFixed(2));
    if (r.receipt_date) setDate(r.receipt_date);
    if (r.merchant && !station) setStation(r.merchant);
    const l = litersFromReceipt(r.ocr_json);
    if (l && !liters) setLiters(l);
  });
  const vehicle = vehicles.find((v) => v.id === vid);

  const save = async () => {
    const value = parseAmount(amount);
    if (!vid) return error("Pilih kenderaan.");
    if (value === null || value <= 0) return error("Masukkan jumlah yang sah.");
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        vehicle_id: vid,
        fill_date: date,
        amount: value,
        liters: liters ? Number(liters) : null,
        odometer: odometer ? Number(odometer) : null,
        station: station.trim() || null,
        receipt_id: receiptId,
      };
      const res = log ? await getSupabase().from("fuel_logs").update(payload).eq("id", log.id) : await getSupabase().from("fuel_logs").insert(payload);
      if (res.error) throw res.error;
      if (receiptId) await confirmAttachedReceipt(receiptId, { merchant: station.trim() || null, date, total: value });
      success(`Isi minyak ${formatRM(value)} direkod & ditambah ke Belanja.`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!log) return;
    setSaving(true);
    try {
      const { error: err } = await getSupabase().from("fuel_logs").delete().eq("id", log.id);
      if (err) throw err;
      success("Log minyak dan belanja berkaitan dipadam.");
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
      setSaving(false);
    }
  };

  const pricePerLiter = parseAmount(amount) && Number(liters) > 0 ? (parseAmount(amount)! / Number(liters)).toFixed(2) : null;

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={log ? "Edit isi minyak" : "Isi minyak"}
        onSubmit={save}
        submitting={saving}
        submitDisabled={scan.busy}
        footerExtra={
          log ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="mb-2 flex w-full items-center justify-center gap-2 py-1 text-sm font-semibold text-red-600">
              <Trash2 className="size-4" /> Padam log minyak
            </button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {vehicles.length > 1 || !vehicle ? (
            <Field label="Kenderaan" htmlFor="fuel-vehicle">
              <Select id="fuel-vehicle" value={vid} onChange={(e) => setVid(e.target.value)}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.plate_number ? ` (${v.plate_number})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm font-semibold">
              {vehicle.name}
              {vehicle.plate_number ? ` · ${vehicle.plate_number}` : ""}
            </p>
          )}
          {scan.element}
          <ReceiptAttach attached={Boolean(receiptId)} status={scan.status} onCamera={scan.openCamera} onGallery={scan.openGallery} onRemove={() => setReceiptId(null)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jumlah" htmlFor="fuel-amount">
              <MoneyInput id="fuel-amount" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Liter" htmlFor="fuel-liters" hint={pricePerLiter ? `RM ${pricePerLiter} / L` : undefined}>
              <Input id="fuel-liters" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Pilihan" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarikh" htmlFor="fuel-date">
              <Input id="fuel-date" type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Odometer (km)" htmlFor="fuel-odo" hint={vehicle?.current_odometer ? `Semasa: ${vehicle.current_odometer.toLocaleString("en-MY")}` : undefined}>
              <Input id="fuel-odo" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Field label="Stesen" htmlFor="fuel-station">
            <Input id="fuel-station" value={station} onChange={(e) => setStation(e.target.value)} placeholder="Contoh: Petronas" />
          </Field>
          <p className="text-xs text-muted">Untuk purata L/100km yang tepat, isi penuh tangki dan rekod odometer setiap kali.</p>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Padam log minyak?"
        message="Belanja yang dicipta untuk log ini juga akan dipadam. Resit yang dilampirkan kekal disimpan."
        loading={saving}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

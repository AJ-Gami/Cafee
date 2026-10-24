"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { confirmAttachedReceipt, useInlineReceiptScan } from "@/components/receipts/useInlineReceiptScan";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { formatRM, parseAmount, todayKL } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import type { Vehicle, VehicleService } from "@/lib/vehicles";
import { ReceiptAttach } from "./ReceiptAttach";

export function ServiceSheet({
  vehicles,
  vehicleId,
  service,
  onClose,
  onSaved,
}: {
  vehicles: Vehicle[];
  vehicleId?: string | null;
  service?: VehicleService | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId } = useSession();
  const { success, error } = useToast();
  const [vid, setVid] = useState(service?.vehicle_id ?? vehicleId ?? vehicles[0]?.id ?? "");
  const [date, setDate] = useState(service?.service_date ?? todayKL());
  const [odometer, setOdometer] = useState(service?.odometer != null ? String(service.odometer) : "");
  const [cost, setCost] = useState(service ? String(service.cost) : "");
  const [workDone, setWorkDone] = useState(service?.work_done ?? "");
  const [workshop, setWorkshop] = useState(service?.workshop ?? "");
  const [nextKm, setNextKm] = useState(service?.next_service_km != null ? String(service.next_service_km) : "");
  const [nextDate, setNextDate] = useState(service?.next_service_date ?? "");
  const [receiptId, setReceiptId] = useState<string | null>(service?.receipt_id ?? null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scan = useInlineReceiptScan((r) => {
    setReceiptId(r.id);
    if (r.total_amount != null) setCost(String(r.total_amount));
    if (r.receipt_date) setDate(r.receipt_date);
    if (r.merchant && !workshop) setWorkshop(r.merchant);
  });
  const vehicle = vehicles.find((v) => v.id === vid);

  const save = async () => {
    const value = parseAmount(cost);
    if (!vid) return error("Pilih kenderaan.");
    if (value === null || value < 0) return error("Masukkan kos yang sah.");
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        vehicle_id: vid,
        service_date: date,
        odometer: odometer ? Number(odometer) : null,
        cost: value,
        work_done: workDone.trim() || null,
        workshop: workshop.trim() || null,
        receipt_id: receiptId,
        next_service_km: nextKm ? Number(nextKm) : null,
        next_service_date: nextDate || null,
      };
      const res = service
        ? await getSupabase().from("vehicle_services").update(payload).eq("id", service.id)
        : await getSupabase().from("vehicle_services").insert(payload);
      if (res.error) throw res.error;
      if (receiptId) await confirmAttachedReceipt(receiptId, { merchant: workshop.trim() || null, date, total: value });
      success(`Servis ${formatRM(value)} direkod & ditambah ke Belanja.`);
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!service) return;
    setSaving(true);
    try {
      const { error: err } = await getSupabase().from("vehicle_services").delete().eq("id", service.id);
      if (err) throw err;
      success("Rekod servis dan belanja berkaitan dipadam.");
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={service ? "Edit servis" : "Rekod servis"}
        onSubmit={save}
        submitting={saving}
        submitDisabled={scan.busy}
        footerExtra={
          service ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="mb-2 flex w-full items-center justify-center gap-2 py-1 text-sm font-semibold text-red-600">
              <Trash2 className="size-4" /> Padam rekod servis
            </button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {vehicles.length > 1 || !vehicle ? (
            <Field label="Kenderaan" htmlFor="svc-vehicle">
              <Select id="svc-vehicle" value={vid} onChange={(e) => setVid(e.target.value)}>
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
            <Field label="Tarikh" htmlFor="svc-date">
              <Input id="svc-date" type="date" value={date} max={todayKL()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Kos" htmlFor="svc-cost">
              <MoneyInput id="svc-cost" value={cost} onChange={setCost} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Odometer (km)" htmlFor="svc-odo" hint={vehicle?.current_odometer ? `Semasa: ${vehicle.current_odometer.toLocaleString("en-MY")}` : undefined}>
              <Input id="svc-odo" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Bengkel" htmlFor="svc-workshop">
              <Input id="svc-workshop" value={workshop} onChange={(e) => setWorkshop(e.target.value)} placeholder="Pilihan" />
            </Field>
          </div>
          <Field label="Kerja dibuat" htmlFor="svc-work">
            <Textarea id="svc-work" rows={2} value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder="Contoh: Tukar minyak hitam, penapis" />
          </Field>
          <p className="eyebrow -mb-2 text-muted">Servis seterusnya (pilihan)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pada km" htmlFor="svc-nextkm">
              <Input
                id="svc-nextkm"
                inputMode="numeric"
                value={nextKm}
                onChange={(e) => setNextKm(e.target.value.replace(/\D/g, ""))}
                placeholder={odometer ? String(Number(odometer) + 10000) : ""}
              />
            </Field>
            <Field label="Atau tarikh" htmlFor="svc-nextdate">
              <Input id="svc-nextdate" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </Field>
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Padam rekod servis?"
        message="Belanja yang dicipta untuk servis ini juga akan dipadam. Resit yang dilampirkan kekal disimpan."
        loading={saving}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

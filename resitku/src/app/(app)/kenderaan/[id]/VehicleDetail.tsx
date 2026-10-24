"use client";

import { AlertTriangle, Car, Fuel, Gauge, Paperclip, Pencil, Trash2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VehicleActions, type VehicleSheetState } from "@/components/vehicles/VehicleActions";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { UnderlineTabs } from "@/components/ui/Segmented";
import { SkeletonCard, SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { formatDate, formatRM } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { fetchFuelLogs, fetchServices, fetchVehicles, vehicleReminders, vehicleStats } from "@/lib/vehicles";

async function load(id: string) {
  const [vehicles, services, fuel] = await Promise.all([fetchVehicles(), fetchServices(id), fetchFuelLogs(id)]);
  return { vehicles, vehicle: vehicles.find((v) => v.id === id) ?? null, services, fuel };
}

export function VehicleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"servis" | "minyak">("servis");
  const [sheet, setSheet] = useState<VehicleSheetState>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data, loading } = useData(() => load(id), [id, version]);
  const bump = () => setVersion((v) => v + 1);

  if (loading) {
    return (
      <main>
        <PageHeader title="Kenderaan" back="/kenderaan" />
        <div className="flex flex-col gap-3 px-4">
          <SkeletonCard className="h-40" />
          <SkeletonList rows={3} />
        </div>
      </main>
    );
  }
  if (!data?.vehicle) {
    return (
      <main>
        <PageHeader title="Kenderaan" back="/kenderaan" />
        <div className="px-4">
          <EmptyState icon={Car} title="Kenderaan tidak dijumpai" text="Kenderaan ini mungkin telah dipadam." />
        </div>
      </main>
    );
  }

  const { vehicle, services, fuel, vehicles } = data;
  const reminders = vehicleReminders(vehicle, services);
  const stats = vehicleStats(services, fuel);

  const remove = async () => {
    setDeleting(true);
    try {
      const { error: err } = await getSupabase().from("vehicles").delete().eq("id", vehicle.id);
      if (err) throw err;
      success("Kenderaan dan semua rekodnya dipadam.");
      router.push("/kenderaan");
    } catch (e) {
      error(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <main>
      <PageHeader
        title={vehicle.name}
        eyebrow={vehicle.plate_number ?? "Kenderaan"}
        back="/kenderaan"
        right={
          <button type="button" aria-label="Edit kenderaan" onClick={() => setSheet({ kind: "vehicle", vehicle })} className="grid size-10 place-items-center rounded-full bg-white shadow-sm">
            <Pencil className="size-4" />
          </button>
        }
      />
      <div className="flex flex-col gap-3 px-4">
        <div className="rounded-2xl p-4 text-white" style={{ background: vehicle.color }}>
          <p className="eyebrow text-white/70">Jumlah belanja</p>
          <p className="text-3xl font-extrabold">{formatRM(stats.totalCost)}</p>
          <p className="text-sm text-white/80">
            Servis {formatRM(stats.serviceCost)} · Minyak {formatRM(stats.fuelCost)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="Odometer" value={vehicle.current_odometer != null ? `${vehicle.current_odometer.toLocaleString("en-MY")}` : "–"} unit="km" />
            <Metric label="Kos per km" value={stats.costPerKm != null ? `RM ${stats.costPerKm.toFixed(2)}` : "–"} />
            <Metric label="Purata" value={stats.litersPer100 != null ? stats.litersPer100.toFixed(1) : "–"} unit="L/100km" />
          </div>
        </div>

        {reminders.length > 0 ? (
          <Card className="divide-y divide-line overflow-hidden">
            {reminders.map((r) => (
              <p key={r.key} className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold ${r.severity === "critical" ? "text-red-700" : "text-amber-700"}`}>
                <AlertTriangle className="size-4 shrink-0" /> {r.text}
              </p>
            ))}
          </Card>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <InfoBox label="Cukai jalan tamat" value={formatDate(vehicle.road_tax_expiry)} />
          <InfoBox label="Insurans tamat" value={formatDate(vehicle.insurance_expiry)} />
        </div>
        {stats.litersPer100 == null && fuel.length > 0 ? (
          <p className="px-1 text-xs text-muted">Purata L/100km memerlukan sekurang-kurangnya dua log minyak dengan odometer dan liter.</p>
        ) : null}

        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "servis", label: `Servis (${services.length})` },
            { value: "minyak", label: `Log minyak (${fuel.length})` },
          ]}
        />

        {tab === "servis" ? (
          services.length === 0 ? (
            <EmptyState icon={Wrench} title="Belum ada rekod servis" action={<Button onClick={() => setSheet({ kind: "service" })}>Rekod servis</Button>} />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {services.map((s) => (
                <button key={s.id} type="button" onClick={() => setSheet({ kind: "service", service: s })} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas">
                    <Wrench className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.work_done || s.workshop || "Servis"}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatDate(s.service_date)}
                      {s.odometer != null ? ` · ${s.odometer.toLocaleString("en-MY")} km` : ""}
                      {s.workshop && s.work_done ? ` · ${s.workshop}` : ""}
                    </span>
                  </span>
                  {s.receipt_id ? <Paperclip className="size-4 text-muted" aria-label="Ada resit" /> : null}
                  <span className="font-bold">{formatRM(s.cost)}</span>
                </button>
              ))}
            </Card>
          )
        ) : fuel.length === 0 ? (
          <EmptyState icon={Fuel} title="Belum ada log minyak" action={<Button onClick={() => setSheet({ kind: "fuel" })}>Isi minyak</Button>} />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {fuel.map((f) => (
              <button key={f.id} type="button" onClick={() => setSheet({ kind: "fuel", log: f })} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas">
                  <Fuel className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.station || "Isi minyak"}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatDate(f.fill_date)}
                    {f.liters != null ? ` · ${f.liters.toFixed(2)} L` : ""}
                    {f.odometer != null ? ` · ${f.odometer.toLocaleString("en-MY")} km` : ""}
                  </span>
                </span>
                {f.receipt_id ? <Paperclip className="size-4 text-muted" aria-label="Ada resit" /> : null}
                <span className="font-bold">{formatRM(f.amount)}</span>
              </button>
            ))}
          </Card>
        )}

        <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" /> Padam kenderaan
        </Button>
      </div>

      <VehicleActions vehicles={vehicles} vehicleId={vehicle.id} sheet={sheet} setSheet={setSheet} onSaved={bump} />
      <ConfirmDialog
        open={confirmDelete}
        title={`Padam ${vehicle.name}?`}
        message="Semua rekod servis, log minyak dan belanja berkaitan akan dipadam. Resit yang dilampirkan kekal disimpan."
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </main>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-1 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="truncate text-sm font-extrabold">{value}</p>
      {unit ? <p className="text-[10px] text-white/70">{unit}</p> : null}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
      <Gauge className="size-4 text-muted" />
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}

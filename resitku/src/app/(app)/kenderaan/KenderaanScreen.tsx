"use client";

import { Car, Plus } from "lucide-react";
import { useState } from "react";
import { VehicleActions, type VehicleSheetState } from "@/components/vehicles/VehicleActions";
import { VehicleCard } from "@/components/vehicles/VehicleCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { formatRM, monthRange, currentMonthKL } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { fetchServices, fetchVehicles, vehicleReminders } from "@/lib/vehicles";

async function load() {
  const [from, to] = monthRange(currentMonthKL());
  const [vehicles, services, monthExp] = await Promise.all([
    fetchVehicles(),
    fetchServices(),
    getSupabase().from("expenses").select("amount").not("vehicle_id", "is", null).gte("expense_date", from).lt("expense_date", to),
  ]);
  return { vehicles, services, monthTotal: (monthExp.data ?? []).reduce((s, e) => s + Number(e.amount), 0) };
}

export function KenderaanScreen() {
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<VehicleSheetState>(null);
  const { data, loading } = useData(load, [version]);
  const vehicles = data?.vehicles ?? [];

  return (
    <main>
      <PageHeader title="Kenderaan" />
      <div className="flex flex-col gap-3 px-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard className="h-36" />
            <SkeletonCard className="h-36" />
          </div>
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={Car}
            title="Belum ada kenderaan"
            text="Tambah kenderaan untuk menjejak servis, minyak dan peringatan cukai jalan."
            action={<Button onClick={() => setSheet({ kind: "vehicle" })}>Tambah kenderaan</Button>}
          />
        ) : (
          <>
            <p className="px-1 text-sm text-muted">
              Belanja kenderaan bulan ini: <span className="font-bold text-ink">{formatRM(data?.monthTotal ?? 0)}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {vehicles.map((v) => (
                <VehicleCard key={v.id} vehicle={v} reminders={vehicleReminders(v, data?.services ?? [])} />
              ))}
              <button
                type="button"
                onClick={() => setSheet({ kind: "vehicle" })}
                className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-muted active:bg-white"
              >
                <Plus className="size-6" />
                Tambah kenderaan
              </button>
            </div>
          </>
        )}
      </div>
      <VehicleActions vehicles={vehicles} sheet={sheet} setSheet={setSheet} onSaved={() => setVersion((v) => v + 1)} />
    </main>
  );
}

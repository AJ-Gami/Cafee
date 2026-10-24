"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { useData } from "@/hooks/useData";
import { fetchServices, fetchVehicles, vehicleReminders } from "@/lib/vehicles";

/** Kad Kenderaan (hijau) di Home, dengan peringatan cukai jalan / insurans / servis. */
export function VehicleHomeCard() {
  const { data, loading } = useData(async () => {
    const [vehicles, services] = await Promise.all([fetchVehicles(), fetchServices()]);
    const reminders = vehicles.flatMap((v) => vehicleReminders(v, services).map((r) => ({ ...r, vehicle: v.name })));
    // Peringatan kritikal (sudah tamat / lewat) dahulu.
    reminders.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
    return { count: vehicles.length, reminders };
  }, []);

  return (
    <Link href="/kenderaan" className="flex flex-col rounded-2xl bg-vehicle p-4 text-white active:opacity-90">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-white/70">Kenderaan</p>
        <ChevronRight className="size-4 text-white/70" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20 bg-white/20" />
      ) : (
        <>
          <p className="mt-1 text-xl font-extrabold leading-tight">{data?.count ?? 0}</p>
          <p className="text-xs text-white/70">kenderaan</p>
          {data && data.reminders.length > 0 ? (
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-accent">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="truncate">
                {data.reminders[0]!.vehicle}: {data.reminders[0]!.text}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-white/80">{data?.count ? "Tiada peringatan" : "Tambah kenderaan"}</p>
          )}
          {data && data.reminders.length > 1 ? <p className="text-xs text-white/70">+{data.reminders.length - 1} peringatan lagi</p> : null}
        </>
      )}
    </Link>
  );
}

import { AlertTriangle, Gauge } from "lucide-react";
import Link from "next/link";
import type { Reminder, Vehicle } from "@/lib/vehicles";

export function VehicleCard({ vehicle, reminders }: { vehicle: Vehicle; reminders: Reminder[] }) {
  return (
    <Link
      href={`/kenderaan/${vehicle.id}`}
      className="flex min-h-36 flex-col justify-between rounded-2xl p-4 text-white shadow-sm active:opacity-90"
      style={{ background: vehicle.color }}
    >
      <div>
        <p className="truncate text-lg font-extrabold leading-tight">{vehicle.name}</p>
        {vehicle.plate_number ? (
          <p className="mt-1 inline-block rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider">{vehicle.plate_number}</p>
        ) : null}
      </div>
      <div className="mt-3">
        {reminders.length > 0 ? (
          <p className={`mb-1.5 flex items-center gap-1 truncate rounded-lg px-1.5 py-1 text-[11px] font-semibold ${reminders.some((r) => r.severity === "critical") ? "bg-red-600" : "bg-black/25"}`}>
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate">{reminders[0]!.text}</span>
            {reminders.length > 1 ? <span className="shrink-0">+{reminders.length - 1}</span> : null}
          </p>
        ) : null}
        <p className="flex items-center gap-1 text-xs text-white/80">
          <Gauge className="size-3.5" />
          {vehicle.current_odometer != null ? `${vehicle.current_odometer.toLocaleString("en-MY")} km` : "Odometer belum direkod"}
        </p>
      </div>
    </Link>
  );
}

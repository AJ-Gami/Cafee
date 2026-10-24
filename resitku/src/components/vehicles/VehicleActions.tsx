"use client";

import { Car, Fuel, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Fab } from "@/components/ui/Fab";
import { useToast } from "@/components/ui/Toast";
import type { FuelLog, Vehicle, VehicleService } from "@/lib/vehicles";
import { FuelSheet } from "./FuelSheet";
import { ServiceSheet } from "./ServiceSheet";
import { VehicleSheet } from "./VehicleSheet";

export type VehicleSheetState =
  | { kind: "service"; service?: VehicleService | null }
  | { kind: "fuel"; log?: FuelLog | null }
  | { kind: "vehicle"; vehicle?: Vehicle | null }
  | null;

/** Butang + Kenderaan (Rekod servis / Isi minyak / Tambah kenderaan) dan borang berkaitan. */
export function VehicleActions({
  vehicles,
  vehicleId,
  sheet,
  setSheet,
  onSaved,
}: {
  vehicles: Vehicle[];
  vehicleId?: string;
  sheet: VehicleSheetState;
  setSheet: (s: VehicleSheetState) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const needVehicle = (fn: () => void) => () => {
    if (vehicles.length === 0) {
      toast("Tambah kenderaan dahulu.");
      setSheet({ kind: "vehicle" });
      return;
    }
    fn();
  };

  return (
    <>
      <Fab label="Tambah rekod kenderaan" onClick={() => setMenuOpen(true)} />
      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Kenderaan"
        items={[
          { icon: Wrench, label: "Rekod servis", description: "Kos, odometer, servis seterusnya", onSelect: needVehicle(() => setSheet({ kind: "service" })) },
          { icon: Fuel, label: "Isi minyak", description: "Jumlah, liter dan odometer", onSelect: needVehicle(() => setSheet({ kind: "fuel" })) },
          { icon: Car, label: "Tambah kenderaan", description: "Kereta, motosikal atau van", onSelect: () => setSheet({ kind: "vehicle" }) },
        ]}
      />
      {sheet?.kind === "service" ? (
        <ServiceSheet vehicles={vehicles} vehicleId={vehicleId} service={sheet.service} onClose={() => setSheet(null)} onSaved={onSaved} />
      ) : null}
      {sheet?.kind === "fuel" ? <FuelSheet vehicles={vehicles} vehicleId={vehicleId} log={sheet.log} onClose={() => setSheet(null)} onSaved={onSaved} /> : null}
      {sheet?.kind === "vehicle" ? (
        <VehicleSheet
          vehicle={sheet.vehicle}
          onClose={() => setSheet(null)}
          onSaved={(id) => {
            onSaved();
            if (!sheet.vehicle) router.push(`/kenderaan/${id}`);
          }}
        />
      ) : null}
    </>
  );
}

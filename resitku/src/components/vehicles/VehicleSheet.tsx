"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { getSupabase } from "@/lib/supabase/client";
import { VEHICLE_COLORS, type Vehicle } from "@/lib/vehicles";

export function VehicleSheet({ vehicle, onClose, onSaved }: { vehicle?: Vehicle | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { userId, plan } = useSession();
  const { success, error } = useToast();
  const [name, setName] = useState(vehicle?.name ?? "");
  const [plate, setPlate] = useState(vehicle?.plate_number ?? "");
  const [color, setColor] = useState(vehicle?.color ?? VEHICLE_COLORS[0]!);
  const [odometer, setOdometer] = useState(vehicle?.current_odometer != null ? String(vehicle.current_odometer) : "");
  const [roadTax, setRoadTax] = useState(vehicle?.road_tax_expiry ?? "");
  const [insurance, setInsurance] = useState(vehicle?.insurance_expiry ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return error("Masukkan nama kenderaan.");
    if (!vehicle && !(await canUse("add_vehicle", { plan }))) return error(LIMIT_MESSAGE);
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        name: name.trim(),
        plate_number: plate.trim().toUpperCase() || null,
        color,
        current_odometer: odometer ? Number(odometer) : null,
        road_tax_expiry: roadTax || null,
        insurance_expiry: insurance || null,
      };
      const res = vehicle
        ? await getSupabase().from("vehicles").update(payload).eq("id", vehicle.id).select("id").single()
        : await getSupabase().from("vehicles").insert(payload).select("id").single();
      if (res.error) throw res.error;
      success(vehicle ? "Kenderaan dikemas kini." : "Kenderaan ditambah.");
      onSaved(res.data.id as string);
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={vehicle ? "Edit kenderaan" : "Tambah kenderaan"} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama" htmlFor="veh-name">
            <Input id="veh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Myvi" autoFocus={!vehicle} />
          </Field>
          <Field label="No. plat" htmlFor="veh-plate">
            <Input id="veh-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="WXY 1234" />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Warna kad</p>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Warna ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className="grid size-10 place-items-center rounded-full ring-offset-2"
                style={{ background: c, boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
              >
                {color === c ? <Check className="size-4 text-white" /> : null}
              </button>
            ))}
          </div>
        </div>
        <Field label="Odometer semasa (km)" htmlFor="veh-odo">
          <Input id="veh-odo" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} placeholder="Pilihan" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cukai jalan tamat" htmlFor="veh-roadtax">
            <Input id="veh-roadtax" type="date" value={roadTax} onChange={(e) => setRoadTax(e.target.value)} />
          </Field>
          <Field label="Insurans tamat" htmlFor="veh-ins">
            <Input id="veh-ins" type="date" value={insurance} onChange={(e) => setInsurance(e.target.value)} />
          </Field>
        </div>
      </div>
    </BottomSheet>
  );
}

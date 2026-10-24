"use client";

import { daysUntil } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";

export type Vehicle = {
  id: string;
  name: string;
  plate_number: string | null;
  color: string;
  current_odometer: number | null;
  road_tax_expiry: string | null;
  insurance_expiry: string | null;
  created_at: string;
};

export type VehicleService = {
  id: string;
  vehicle_id: string;
  service_date: string;
  odometer: number | null;
  cost: number;
  work_done: string | null;
  workshop: string | null;
  receipt_id: string | null;
  next_service_km: number | null;
  next_service_date: string | null;
};

export type FuelLog = {
  id: string;
  vehicle_id: string;
  fill_date: string;
  liters: number | null;
  amount: number;
  odometer: number | null;
  station: string | null;
  receipt_id: string | null;
};

export const VEHICLE_COLORS = ["#15803d", "#1e3a5f", "#111111", "#2563eb", "#b91c1c", "#7c3aed", "#c2410c", "#0f766e"];

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await getSupabase().from("vehicles").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ ...(v as Vehicle), current_odometer: n(v.current_odometer) }));
}

export async function fetchServices(vehicleId?: string): Promise<VehicleService[]> {
  let q = getSupabase().from("vehicle_services").select("*");
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q.order("service_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    ...(s as VehicleService),
    cost: Number(s.cost),
    odometer: n(s.odometer),
    next_service_km: n(s.next_service_km),
  }));
}

export async function fetchFuelLogs(vehicleId?: string): Promise<FuelLog[]> {
  let q = getSupabase().from("fuel_logs").select("*");
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data, error } = await q.order("fill_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({ ...(f as FuelLog), amount: Number(f.amount), liters: n(f.liters), odometer: n(f.odometer) }));
}

export type Reminder = { key: string; text: string; severity: "warning" | "critical" };

function expiryReminder(key: string, label: string, date: string | null): Reminder | null {
  if (!date) return null;
  const days = daysUntil(date);
  if (days < 0) return { key, text: `${label} tamat ${-days} hari lalu`, severity: "critical" };
  if (days === 0) return { key, text: `${label} tamat hari ini`, severity: "critical" };
  if (days <= 30) return { key, text: `${label} tamat dalam ${days} hari`, severity: "warning" };
  return null;
}

/** Peringatan dalam app: cukai jalan / insurans (30 hari) dan servis seterusnya (tarikh atau km). */
export function vehicleReminders(vehicle: Vehicle, services: VehicleService[]): Reminder[] {
  const list: Reminder[] = [];
  const roadTax = expiryReminder("roadtax", "Cukai jalan", vehicle.road_tax_expiry);
  const insurance = expiryReminder("insurance", "Insurans", vehicle.insurance_expiry);
  if (roadTax) list.push(roadTax);
  if (insurance) list.push(insurance);

  const latest = services
    .filter((s) => s.vehicle_id === vehicle.id && (s.next_service_date || s.next_service_km))
    .sort((a, b) => b.service_date.localeCompare(a.service_date))[0];
  if (latest) {
    if (latest.next_service_date) {
      const days = daysUntil(latest.next_service_date);
      if (days < 0) list.push({ key: "service-date", text: `Servis lewat ${-days} hari`, severity: "critical" });
      else if (days <= 30) list.push({ key: "service-date", text: `Servis dalam ${days} hari`, severity: "warning" });
    }
    if (latest.next_service_km && vehicle.current_odometer !== null) {
      const left = latest.next_service_km - vehicle.current_odometer;
      if (left < 0) list.push({ key: "service-km", text: `Servis lewat ${(-left).toLocaleString("en-MY")} km`, severity: "critical" });
      else if (left <= 1000) list.push({ key: "service-km", text: `Servis dalam ${left.toLocaleString("en-MY")} km`, severity: "warning" });
    }
  }
  return list;
}

export type VehicleStats = {
  totalCost: number;
  serviceCost: number;
  fuelCost: number;
  /** Kos per km (minyak + servis) bagi jarak yang direkod. */
  costPerKm: number | null;
  /** Purata L/100km daripada log minyak berturutan. */
  litersPer100: number | null;
  distance: number | null;
};

/**
 * Kira statistik. Kaedah tangki penuh: minyak yang diisi pada log pertama digunakan sebelum julat yang direkod,
 * jadi liter/kos log pertama (ikut odometer) tidak dikira dalam L/100km dan kos per km.
 */
export function vehicleStats(services: VehicleService[], fuel: FuelLog[]): VehicleStats {
  const serviceCost = services.reduce((s, x) => s + x.cost, 0);
  const fuelCost = fuel.reduce((s, x) => s + x.amount, 0);
  const withOdo = fuel.filter((f) => f.odometer !== null).sort((a, b) => a.odometer! - b.odometer!);

  let litersPer100: number | null = null;
  let fuelDistance: number | null = null;
  if (withOdo.length >= 2) {
    fuelDistance = withOdo[withOdo.length - 1]!.odometer! - withOdo[0]!.odometer!;
    const liters = withOdo.slice(1).reduce((s, f) => s + (f.liters ?? 0), 0);
    const allHaveLiters = withOdo.slice(1).every((f) => f.liters !== null);
    if (fuelDistance > 0 && allHaveLiters && liters > 0) litersPer100 = (liters / fuelDistance) * 100;
  }

  const readings = [...services.map((s) => s.odometer), ...fuel.map((f) => f.odometer)].filter((v): v is number => v !== null);
  let costPerKm: number | null = null;
  let distance: number | null = null;
  if (readings.length >= 2) {
    distance = Math.max(...readings) - Math.min(...readings);
    const firstFuel = withOdo[0];
    const cost = serviceCost + fuelCost - (firstFuel && firstFuel.odometer === Math.min(...readings) ? firstFuel.amount : 0);
    if (distance > 0) costPerKm = cost / distance;
  }

  return { totalCost: serviceCost + fuelCost, serviceCost, fuelCost, costPerKm, litersPer100, distance };
}

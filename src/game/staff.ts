/** Staffing: hourly service capacity, staff slots and daily hiring candidates. */
import { BASE_STAFF_SLOTS, CANDIDATES_PER_DAY } from './constants';
import { STAFF_NAMES, STAFF_ROLES } from './data/staff';
import { UPGRADES } from './data/upgrades';
import { dayRng, RNG_PURPOSE } from './rng';
import type { GameState, StaffCandidate, StaffMember, StaffRole, UpgradeId } from './types';

export function staffSlots(upgrades: readonly UpgradeId[]): number {
  let slots = BASE_STAFF_SLOTS;
  for (const id of upgrades) slots = Math.max(slots, UPGRADES[id].effects.staffSlots ?? 0);
  return slots;
}

/** Orders per hour the current team can complete, before any event effects. */
export function hourlyCapacity(staff: readonly StaffMember[], upgrades: readonly UpgradeId[]): number {
  let baristaMultiplier = 1;
  let overallMultiplier = 1;
  for (const id of upgrades) {
    baristaMultiplier *= UPGRADES[id].effects.baristaCapacityMultiplier ?? 1;
    overallMultiplier *= UPGRADES[id].effects.capacityMultiplier ?? 1;
  }
  let barista = 0;
  let support = 0;
  for (const member of staff) {
    if (member.role === 'barista') barista += member.ordersPerHour;
    else support += member.ordersPerHour;
  }
  // Without a barista nobody can make drinks.
  if (barista === 0) return 0;
  return Math.floor((barista * baristaMultiplier + support) * overallMultiplier);
}

/** Today's candidates for a game state, using the start-of-day name snapshot when present. */
export function candidatesForState(state: GameState): StaffCandidate[] {
  return candidatesForDay(state.seed, state.day, state.staff, state.dayStart.staffNames);
}

export function baristaCount(staff: readonly StaffMember[]): number {
  return staff.filter((s) => s.role === 'barista').length;
}

/**
 * Deterministic candidates for a given day. Already-hired candidates are excluded.
 * `reservedNames` should be the team's names at the start of the day: the list then stays
 * identical however the player hires or fires during preparation.
 */
export function candidatesForDay(
  seed: number,
  day: number,
  staff: readonly StaffMember[],
  reservedNames?: readonly string[],
): StaffCandidate[] {
  const rng = dayRng(seed, day, RNG_PURPOSE.candidates);
  const todaysPrefix = `staff-d${day}-`;
  // Fallback for saves without a start-of-day snapshot: reserve names of staff hired before today.
  const takenNames = new Set(reservedNames ?? staff.filter((s) => !s.id.startsWith(todaysPrefix)).map((s) => s.name));
  const takenIds = new Set(staff.map((s) => s.id));
  const roles: StaffRole[] = ['barista', 'cashier', rng.chance(0.5) ? 'barista' : 'cashier'];
  const result: StaffCandidate[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < CANDIDATES_PER_DAY; i++) {
    const role = roles[i] ?? 'barista';
    const def = STAFF_ROLES[role];
    const id = `staff-d${day}-${i}`;
    const available = STAFF_NAMES.filter((n) => !takenNames.has(n) && !usedNames.has(n));
    let name = available.length > 0 ? (available[rng.int(0, available.length - 1)] as string) : `Calon ${i + 1}`;
    // Never offer a name someone else on the team already has (only reachable without a snapshot).
    const clashes = (n: string) => staff.some((m) => m.name === n && m.id !== id);
    if (clashes(name)) name = available.find((n) => !clashes(n)) ?? `Calon ${i + 1}`;
    usedNames.add(name);
    const ordersPerHour = rng.int(def.ordersPerHourRange[0], def.ordersPerHourRange[1]);
    // Better staff ask for more: wage scales with skill, rounded to RM1.
    const span = def.ordersPerHourRange[1] - def.ordersPerHourRange[0];
    const skill = span === 0 ? 0.5 : (ordersPerHour - def.ordersPerHourRange[0]) / span;
    const rawWage = def.wageRangeSen[0] + (def.wageRangeSen[1] - def.wageRangeSen[0]) * (0.7 * skill + 0.3 * rng.next());
    const wageSen = Math.round(rawWage / 100) * 100;
    if (takenIds.has(id)) continue;
    result.push({ id, name, role, wageSen, ordersPerHour, hiredDay: day, hireFeeSen: def.hireFeeSen });
  }
  return result;
}

/**
 * Sales goals for Saturdays, Sundays and public holidays. A goal is fixed when its day starts,
 * from the revenue of the days just before, so it never changes while the player prepares: the
 * main café's average raised by a margin, plus what each open branch usually sells on that kind
 * of day (a campus or office branch sells little at weekends, a mall branch a lot).
 */
import {
  GOAL_BASE_DAYS,
  GOAL_MIN_BASE_DAYS,
  GOAL_MIN_TARGET_SEN,
  GOAL_ROUNDING_SEN,
  HOLIDAY_GOAL_BPS,
  WEEKEND_GOAL_BPS,
} from './constants';
import { BRANCH_LOCATIONS } from './data/branches';
import { weekdayIndex } from './demand';
import { applyBps, sumSen } from './money';
import type { BranchLocationId, DayGoal, DayGoalResult, DayReport, EventId, GoalKind } from './types';

export const GOAL_TITLE: Record<GoalKind, string> = {
  weekend: 'Sasaran hujung minggu',
  holiday: 'Sasaran cuti umum',
};

const SATURDAY = 5;
const SUNDAY = 6;

/** Public holidays are always forecast, so the goal never reveals a surprise. */
export function goalKindFor(day: number, eventId: EventId | null): GoalKind | null {
  if (eventId === 'public_holiday') return 'holiday';
  const weekday = weekdayIndex(day);
  return weekday === SATURDAY || weekday === SUNDAY ? 'weekend' : null;
}

export function isSunday(day: number): boolean {
  return weekdayIndex(day) === SUNDAY;
}

/** A branch's footfall factor on `day` (its weekday pattern, and a public holiday's effect). */
function branchDayFactor(location: BranchLocationId, day: number, holiday: boolean): number {
  const loc = BRANCH_LOCATIONS[location];
  return (loc.weekdayFactors[weekdayIndex(day)] ?? 1) * (holiday ? loc.holidayFactor : 1);
}

/**
 * What a branch usually sells on `day`: the average of its recent days' revenue, each scaled
 * from that day's footfall factor to this one's (0 if it has not traded yet).
 */
function usualBranchRevenue(location: BranchLocationId, day: number, holiday: boolean, base: readonly DayReport[]): number {
  const target = branchDayFactor(location, day, holiday);
  const scaled = base.flatMap((r) =>
    (r.branches ?? [])
      .filter((b) => b.location === location)
      .map((b) => (b.revenueSen * target) / branchDayFactor(location, r.day, r.eventId === 'public_holiday')),
  );
  return scaled.length === 0 ? 0 : Math.floor(scaled.reduce((a, b) => a + b, 0) / scaled.length);
}

/**
 * The goal for `day`, from the reports of the GOAL_BASE_DAYS days before it (null if none is
 * due): the main café's average revenue, raised, plus each open branch's usual revenue that day.
 */
export function dayGoalFor(
  day: number,
  eventId: EventId | null,
  history: readonly DayReport[],
  branches: readonly BranchLocationId[] = [],
): DayGoal | null {
  const kind = goalKindFor(day, eventId);
  if (!kind) return null;
  const base = history.filter((r) => r.day < day && r.day >= day - GOAL_BASE_DAYS);
  if (base.length < GOAL_MIN_BASE_DAYS) return null;
  // Reports from before branches existed have no branch list.
  const mainRevenue = (r: DayReport) => r.revenueSen - sumSen((r.branches ?? []).map((b) => b.revenueSen));
  const baseSen = Math.floor(sumSen(base.map(mainRevenue)) / base.length);
  const branchSen = sumSen(branches.map((location) => usualBranchRevenue(location, day, kind === 'holiday', base)));
  const raised = applyBps(baseSen, kind === 'holiday' ? HOLIDAY_GOAL_BPS : WEEKEND_GOAL_BPS) + branchSen;
  const targetSen = Math.max(GOAL_MIN_TARGET_SEN, Math.ceil(raised / GOAL_ROUNDING_SEN) * GOAL_ROUNDING_SEN);
  return { kind, targetSen, baseSen, baseDays: base.length };
}

export function goalResult(goal: DayGoal, revenueSen: number): DayGoalResult {
  return { ...goal, achieved: revenueSen >= goal.targetSen };
}

/** How much revenue a missed goal fell short by (0 once met). */
export function goalShortfallSen(goal: DayGoal, revenueSen: number): number {
  return Math.max(0, goal.targetSen - revenueSen);
}

/** Raise above the base average, in whole percent (for display). */
export function goalRaisePercent(kind: GoalKind): number {
  return Math.round(((kind === 'holiday' ? HOLIDAY_GOAL_BPS : WEEKEND_GOAL_BPS) - 10_000) / 100);
}

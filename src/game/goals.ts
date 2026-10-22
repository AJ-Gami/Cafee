/**
 * Sales goals for Saturdays, Sundays and public holidays. A goal is fixed when its day starts,
 * from the revenue of the days just before, so it never changes while the player prepares.
 */
import {
  GOAL_BASE_DAYS,
  GOAL_MIN_BASE_DAYS,
  GOAL_MIN_TARGET_SEN,
  GOAL_ROUNDING_SEN,
  HOLIDAY_GOAL_BPS,
  WEEKEND_GOAL_BPS,
} from './constants';
import { weekdayIndex } from './demand';
import { applyBps, sumSen } from './money';
import type { DayGoal, DayGoalResult, DayReport, EventId, GoalKind } from './types';

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

/** The goal for `day`, from the reports of the GOAL_BASE_DAYS days before it (null if none is due). */
export function dayGoalFor(day: number, eventId: EventId | null, history: readonly DayReport[]): DayGoal | null {
  const kind = goalKindFor(day, eventId);
  if (!kind) return null;
  const base = history.filter((r) => r.day < day && r.day >= day - GOAL_BASE_DAYS);
  if (base.length < GOAL_MIN_BASE_DAYS) return null;
  const baseSen = Math.floor(sumSen(base.map((r) => r.revenueSen)) / base.length);
  const raised = applyBps(baseSen, kind === 'holiday' ? HOLIDAY_GOAL_BPS : WEEKEND_GOAL_BPS);
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

import { describe, expect, it } from 'vitest';
import { GOAL_MIN_TARGET_SEN, SAVE_SCHEMA_VERSION } from '../constants';
import { EVENTS } from '../data/events';
import { weekdayIndex } from '../demand';
import { startNextDay } from '../engine';
import { rollEventForDay } from '../events';
import { dayGoalFor, GOAL_TITLE, goalKindFor, goalResult, goalShortfallSen } from '../goals';
import { isObjectiveComplete } from '../objectives';
import { shareText, weeklySummaries, weekShareText } from '../reports';
import { migrateSave } from '../save';
import { todayGoalView, weekendGoalsTomorrow } from '../selectors';
import type { DayReport, GameState } from '../types';
import { validateGameState } from '../validate';
import { expectOk, newGame, playDays, settle, stockAll, withProductStock } from './helpers';

const rm = (sen: number): string => `RM${(sen / 100).toFixed(2)}`;

/** Minimal reports with the given revenue for days 1..n. */
function revenues(...sen: number[]): DayReport[] {
  return sen.map((revenueSen, i) => ({ day: i + 1, revenueSen }) as DayReport);
}

/** Play until `day` is being prepared, with every product stocked. */
function prepareDay(day: number, seed?: number): GameState {
  let s = newGame(seed);
  while (s.day < day) {
    const played = playDays(s, 1, 60);
    s = played.state;
  }
  return stockAll(s, 90);
}

function withTarget(s: GameState, targetSen: number): GameState {
  if (!s.goal) throw new Error(`no goal on day ${s.day}`);
  return { ...s, goal: { ...s.goal, targetSen } };
}

function nextDay(s: GameState): GameState {
  return expectOk(startNextDay(s, s.day)).state;
}

describe('which days have a goal', () => {
  it('Saturdays and Sundays, and any day that is a public holiday', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 13, 14].map((d) => goalKindFor(d, null))).toEqual([
      null,
      null,
      null,
      null,
      null,
      'weekend',
      'weekend',
      'weekend',
      'weekend',
    ]);
    expect(goalKindFor(3, 'public_holiday')).toBe('holiday');
    expect(goalKindFor(6, 'public_holiday')).toBe('holiday');
    expect(goalKindFor(6, 'food_festival')).toBe('weekend');
    expect(goalKindFor(3, 'food_festival')).toBeNull();
  });

  it('only uses events the player already sees while preparing, so a goal never gives away a surprise', () => {
    expect(EVENTS.public_holiday.visibility).toBe('forecast');
  });
});

describe('setting a goal', () => {
  it('is the average of up to seven days before, +20% (weekend) or +35% (holiday), rounded up to RM10', () => {
    const history = revenues(40_000, 50_000, 45_000, 52_000, 48_000, 61_000, 39_000, 50_000, 47_000, 55_000, 51_000, 49_000);
    // Day 13: days 6–12.
    const base = Math.floor((61_000 + 39_000 + 50_000 + 47_000 + 55_000 + 51_000 + 49_000) / 7); // 50,285
    expect(dayGoalFor(13, null, history)).toEqual({ kind: 'weekend', baseSen: base, baseDays: 7, targetSen: 61_000 }); // 60,342 → RM610
    expect(dayGoalFor(10, 'public_holiday', history)).toEqual({
      kind: 'holiday',
      baseSen: Math.floor((45_000 + 52_000 + 48_000 + 61_000 + 39_000 + 50_000 + 47_000) / 7), // days 3–9: 48,857
      baseDays: 7,
      targetSen: 66_000, // 65,957 → RM660
    });
    // Day 6 in a new game: the five days so far.
    expect(dayGoalFor(6, null, history.slice(0, 5))).toMatchObject({ baseDays: 5, baseSen: 47_000, targetSen: 57_000 });
  });

  it('adds what each open branch usually sells on that kind of day, and leaves closed branches out', () => {
    // Monday to Friday: the main café sold RM400 a day, a campus branch RM300 and a mall branch RM200.
    const history = [1, 2, 3, 4, 5].map(
      (day) =>
        ({
          day,
          eventId: null,
          revenueSen: 40_000 + 30_000 + 20_000,
          branches: [
            { location: 'kampus', revenueSen: 30_000 },
            { location: 'mall', revenueSen: 20_000 },
          ],
        }) as unknown as DayReport,
    );
    // Saturday: the campus sells 0.55 of a Saturday's footfall against 1.0–1.25 on weekdays, so
    // about RM140 (14,080); the mall 1.65 against 0.8–1.1, about RM376 (37,598).
    expect(dayGoalFor(6, null, history, ['kampus', 'mall'])).toEqual({ kind: 'weekend', baseSen: 40_000, baseDays: 5, targetSen: 100_000 }); // 48,000 + 14,080 + 37,598
    expect(dayGoalFor(6, null, history, ['mall'])?.targetSen).toBe(86_000); // the campus branch has closed
    expect(dayGoalFor(6, null, history)?.targetSen).toBe(48_000);
    // A branch with no days yet adds nothing.
    expect(dayGoalFor(6, null, history, ['pejabat'])?.targetSen).toBe(48_000);
  });

  it('needs at least three recent days, and never asks for less than the minimum', () => {
    expect(dayGoalFor(6, null, revenues(40_000, 40_000, 40_000, 40_000, 40_000).slice(3))).toBeNull();
    expect(dayGoalFor(13, null, revenues(40_000, 40_000, 40_000))).toBeNull(); // days 1–3 are too long ago
    expect(dayGoalFor(6, null, revenues(0, 0, 0, 0, 0))).toMatchObject({ baseSen: 0, targetSen: GOAL_MIN_TARGET_SEN });
    expect(dayGoalFor(4, null, revenues(50_000, 50_000, 50_000))).toBeNull(); // Thursday
  });

  it('is met when revenue reaches the target exactly', () => {
    const goal = { kind: 'weekend' as const, targetSen: 50_000, baseSen: 41_000, baseDays: 7 };
    expect(goalResult(goal, 50_000).achieved).toBe(true);
    expect(goalResult(goal, 49_999).achieved).toBe(false);
    expect(goalShortfallSen(goal, 49_000)).toBe(1_000);
    expect(goalShortfallSen(goal, 52_000)).toBe(0);
  });
});

describe('goals in play', () => {
  it('fixes each day’s goal when the day starts, from the days before it', () => {
    for (const seed of [1, 7, 42]) {
      let s = newGame(seed);
      expect(s.goal).toBeNull();
      for (let i = 0; i < 30; i++) {
        expect(s.goal).toEqual(dayGoalFor(s.day, s.todayEventId, s.history));
        if (weekdayIndex(s.day) >= 5 && s.day > 5) expect(s.goal).not.toBeNull();
        const played = playDays(s, 1, 50);
        const report = played.reports[0]!;
        expect(report.goal).toEqual(s.goal ? goalResult(s.goal, report.revenueSen) : null);
        if (played.state.status !== 'active') break;
        s = played.state;
      }
    }
  });

  it('shows the goal while preparing and warns on Friday that the weekend goals start tomorrow', () => {
    const friday = prepareDay(5);
    expect(todayGoalView(friday)).toBeNull();
    expect(weekendGoalsTomorrow(friday)).toBe(true);
    const saturday = prepareDay(6);
    expect(saturday.goal?.kind).toBe('weekend');
    expect(todayGoalView(saturday)).toMatchObject({ title: 'Sasaran hujung minggu', raisePercent: 20, goal: saturday.goal });
    expect(weekendGoalsTomorrow(saturday)).toBe(false);
    expect(todayGoalView(settle(saturday).state)).toBeNull();
    expect(expectOk(startNextDay(settle(friday).state, 5)).message).toMatch(/Sasaran (hujung minggu|cuti umum): jualan RM/);
  });

  it('counts goals met, a weekend with both goals met, and completes the goal objectives', () => {
    let s = withTarget(prepareDay(6), GOAL_MIN_TARGET_SEN);
    let day = settle(s);
    expect(day.report.goal?.achieved).toBe(true);
    expect(day.state.stats).toMatchObject({ goalsMet: 1, holidayGoalsMet: 0, perfectWeekends: 0 });
    expect(day.report.objectivesCompleted).toContain('weekend_goal');

    s = withTarget(stockAll(nextDay(day.state), 90), GOAL_MIN_TARGET_SEN);
    day = settle(s);
    expect(day.state.stats).toMatchObject({ goalsMet: 2, perfectWeekends: 1 });
    expect(isObjectiveComplete(day.state, 'perfect_weekend')).toBe(true);
    expect(validateGameState(structuredClone(day.state)).ok).toBe(true);
  });

  it('a missed Saturday means no perfect weekend', () => {
    let day = settle(withTarget(prepareDay(6), 10_000_000));
    expect(day.report.goal).toMatchObject({ achieved: false, targetSen: 10_000_000 });
    expect(day.state.stats.goalsMet).toBe(0);
    day = settle(withTarget(stockAll(nextDay(day.state), 90), GOAL_MIN_TARGET_SEN));
    expect(day.state.stats).toMatchObject({ goalsMet: 1, perfectWeekends: 0 });
    expect(isObjectiveComplete(day.state, 'perfect_weekend')).toBe(false);
  });

  it('counts a goal met on a public holiday', () => {
    let found: { seed: number; day: number } | null = null;
    for (let seed = 1; seed < 500 && !found; seed++) {
      for (let d = 6; d <= 20; d++) {
        if (rollEventForDay(seed, d) === 'public_holiday' && weekdayIndex(d) < 5) {
          found = { seed, day: d };
          break;
        }
      }
    }
    if (!found) throw new Error('no weekday holiday found');
    const s = prepareDay(found.day, found.seed);
    expect(s.goal?.kind).toBe('holiday');
    expect(todayGoalView(s)).toMatchObject({ title: 'Sasaran cuti umum', raisePercent: 35 });
    const day = settle(withTarget(s, GOAL_MIN_TARGET_SEN));
    expect(day.state.stats).toMatchObject({ goalsMet: s.stats.goalsMet + 1, holidayGoalsMet: 1 });
    expect(day.report.objectivesCompleted).toContain('holiday_goal');
  });
});

describe('goals in summaries and shares', () => {
  it('weekly summaries count the goals set and met', () => {
    const { reports } = playDays(newGame(), 14, 60);
    const weeks = weeklySummaries(reports);
    for (const w of weeks) {
      const days = reports.filter((r) => r.day >= w.firstDay && r.day <= w.lastDay);
      expect(w.goalsSet).toBe(days.filter((r) => r.goal).length);
      expect(w.goalsMet).toBe(days.filter((r) => r.goal?.achieved).length);
      expect(w.cafeName).toBe(days.at(-1)?.cafeName);
    }
    expect(weeks.every((w) => w.goalsSet >= 2)).toBe(true);
  });

  it('share texts include the goal and the week’s totals', () => {
    const { reports } = playDays(newGame(), 14, 60);
    const saturday = reports[5]!;
    const g = saturday.goal!;
    expect(shareText(saturday, rm)).toContain(`${GOAL_TITLE[g.kind]} ${rm(g.targetSen)}: ${g.achieved ? 'dicapai' : 'tidak dicapai'}`);
    expect(shareText(reports[0]!, rm)).not.toContain('Sasaran');
    const [w1, w2] = weeklySummaries(reports);
    const text = weekShareText(w2!, rm);
    expect(text).toContain('Kopi Kita — Minggu 2 (Hari 8–14)');
    expect(text).toContain(`Jualan: ${rm(w2!.revenueSen)}`);
    expect(text).toContain(`Sasaran jualan dicapai: ${w2!.goalsMet}/${w2!.goalsSet}`);
    expect(text).toContain('Jualan berbanding minggu lalu:');
    expect(text).toContain('data simulasi permainan');
    expect(weekShareText(w1!, rm)).not.toContain('berbanding');
    const partial = weeklySummaries(reports.slice(0, 10))[1]!;
    expect(weekShareText(partial, rm)).toContain('Data 3/7 hari (Hari 8–10)');
  });
});

describe('saves with goals', () => {
  /** Remove every field schema v4 added, giving the shape a v3 build wrote. */
  function asV3Save(game: GameState): unknown {
    const g = withProductStock(game) as Record<string, unknown> & {
      stats: Record<string, unknown>;
      history: Record<string, unknown>[];
    };
    g.schemaVersion = 3;
    delete g.goal;
    delete g.stats.goalsMet;
    delete g.stats.holidayGoalsMet;
    delete g.stats.perfectWeekends;
    for (const r of g.history) delete r.goal;
    return { schemaVersion: 3, savedAt: '2026-01-01T00:00:00.000Z', game: g };
  }

  it('migrates a v3 save: no past goals, and the goal of a weekend being prepared', () => {
    const saturday = prepareDay(6);
    expect(saturday.goal).not.toBeNull();
    const migrated = migrateSave(asV3Save(saturday));
    expect(migrated).toMatchObject({ ok: true, fromVersion: 3 });
    if (!migrated.ok) return;
    const validated = validateGameState(migrated.game);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(validated.state.goal).toEqual(saturday.goal);
    expect(validated.state.stats).toMatchObject({ goalsMet: 0, holidayGoalsMet: 0, perfectWeekends: 0 });
  });

  it('a migrated closed day keeps no goal, and later weekends get one', () => {
    const { state } = playDays(newGame(), 8, 60); // preparing day 9
    const closed = settle(state).state;
    const migrated = migrateSave(asV3Save(closed));
    if (!migrated.ok) throw new Error(migrated.error);
    const validated = validateGameState(migrated.game);
    if (!validated.ok) throw new Error(validated.errors.join('\n'));
    const s = validated.state;
    expect(s.goal).toBeNull();
    expect(s.history.every((r) => r.goal === null)).toBe(true);
    const later = playDays(nextDay(s), 4, 60).state; // preparing day 14 (Sunday)
    expect(later.day).toBe(14);
    expect(later.goal).toEqual(dayGoalFor(14, later.todayEventId, later.history));
    expect(later.history.find((r) => r.day === 13)?.goal).not.toBeNull();
  });

  it('a v3 save without the goal fields does not validate as v4', () => {
    const v3 = asV3Save(prepareDay(6)) as { game: Record<string, unknown> };
    expect(validateGameState({ ...v3.game, schemaVersion: SAVE_SCHEMA_VERSION }).ok).toBe(false);
  });

  it('rejects goals that do not fit the day or the report', () => {
    const { state } = playDays(newGame(), 7, 60); // preparing day 8 (Monday)
    const sunday = state.history.at(-1)!;
    const clean = structuredClone(state);
    expect(validateGameState(clean).ok).toBe(true);
    const sundayGoal = sunday.goal!;
    const bad: GameState[] = [
      { ...clean, goal: { kind: 'weekend', targetSen: 50_000, baseSen: 40_000, baseDays: 7 } }, // Monday
      { ...clean, goal: { kind: 'holiday', targetSen: 50_000, baseSen: 40_000, baseDays: 7 } }, // not a holiday
      { ...clean, history: clean.history.map((r) => (r.day === 7 ? { ...r, goal: { ...sundayGoal, achieved: !sundayGoal.achieved } } : r)) },
      { ...clean, history: clean.history.map((r) => (r.day === 7 ? { ...r, goal: { ...sundayGoal, baseDays: 0 } } : r)) },
      { ...clean, history: clean.history.map((r) => (r.day === 7 ? { ...r, goal: { ...sundayGoal, targetSen: 100 } } : r)) },
      { ...clean, stats: { ...clean.stats, perfectWeekends: -1 } },
    ];
    for (const b of bad) expect(validateGameState(b).ok).toBe(false);
  });
});

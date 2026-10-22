import { describe, expect, it } from 'vitest';
import { bookValue } from '../assets';
import { branchModifiers, branchStaff } from '../branch';
import { BRANCH_BARISTA_WAGE_SEN, BRANCH_LIFE_DAYS, SAVE_SCHEMA_VERSION } from '../constants';
import { BRANCH_LOCATIONS } from '../data/branches';
import { PROMOTIONS } from '../data/promotions';
import { estimateDemand, weekdayIndex } from '../demand';
import { projectedFixedCosts } from '../economy';
import { closeBranch, openBranch, setBranchBaristas, startNextDay } from '../engine';
import { isObjectiveComplete } from '../objectives';
import { reconcileReport, weeklySummaries } from '../reports';
import { migrateSave } from '../save';
import { branchLocationViews, branchView, ingredientViews, prepChecklist } from '../selectors';
import type { GameState } from '../types';
import { validateGameState } from '../validate';
import { expectFail, expectOk, newGame, playDays, settle, stockAll } from './helpers';

/** A level-3 café with RM50,000 in cash. */
function levelThree(seed?: number): GameState {
  const g = newGame(seed);
  return {
    ...g,
    cashSen: 5_000_000,
    dayStart: { ...g.dayStart, cashSen: 5_000_000 },
    completedObjectives: [
      { id: 'cash_25000', day: 1 },
      { id: 'revenue_1200', day: 1 },
      { id: 'rep_90', day: 1 },
    ],
  };
}

function nextDay(s: GameState): GameState {
  return expectOk(startNextDay(s, s.day)).state;
}

function noFailedChecks(s: GameState): void {
  for (const r of s.history) expect(reconcileReport(r).checks.filter((c) => !c.ok)).toEqual([]);
}

describe('opening a branch', () => {
  it('needs level 3, the cash for its fit-out, preparation and no branch already', () => {
    expect(expectFail(openBranch(newGame(), 'kampus')).error).toBe('LOCKED');
    const poor = { ...levelThree(), cashSen: 100_000 };
    expect(expectFail(openBranch(poor, 'mall')).error).toBe('INSUFFICIENT_FUNDS');
    const opened = expectOk(openBranch(levelThree(), 'kampus')).state;
    expect(expectFail(openBranch(opened, 'pejabat')).error).toBe('BRANCH_EXISTS');
    expect(expectFail(openBranch(settle(opened).state, 'pejabat')).error).toBe('WRONG_PHASE');
    expect(expectFail(openBranch(levelThree(), 'kutub' as 'kampus')).error).toBe('UNKNOWN_ITEM');
  });

  it('pays the fit-out as capital spending and records it as an asset', () => {
    const r = expectOk(openBranch(levelThree(), 'kampus'));
    expect(r.state.cashSen).toBe(5_000_000 - 600_000);
    expect(r.state.branch).toEqual({
      location: 'kampus',
      openedDay: 1,
      reputation: 40,
      baristas: 1,
      fitOut: { costSen: 600_000, lifeDays: BRANCH_LIFE_DAYS, acquiredDay: 1, chargedDays: 0 },
    });
    expect(r.state.dayTransactions.at(-1)).toMatchObject({ type: 'branch_setup', amountSen: -600_000, label: 'Buka cawangan: Kawasan universiti' });
    expect(r.state.stats.branchesOpened).toBe(0); // counted once it has traded a day
    expect(validateGameState(structuredClone(r.state)).ok).toBe(true);
  });
});

describe('a day with a branch', () => {
  it('adds the branch to the report’s totals and reconciles them', () => {
    const s = stockAll(expectOk(openBranch(levelThree(), 'kampus')).state, 120);
    const { report, state } = settle(s);
    const b = report.branch!;
    expect(b.location).toBe('kampus');
    expect(b.customers.served).toBeGreaterThan(0);
    expect(b.revenueSen).toBeGreaterThan(0);
    expect(b.wagesSen).toBe(BRANCH_BARISTA_WAGE_SEN);
    expect(b.rentSen).toBe(9_000);
    expect(b.contributionSen).toBe(b.revenueSen - b.cogsSen - b.wagesSen - b.rentSen - b.utilitiesSen);
    // Branch sales are in the totals, labelled as the branch's.
    const branchSales = report.transactions.filter((t) => t.type === 'sale' && t.label.startsWith('Cawangan Kampus: '));
    expect(branchSales.reduce((n, t) => n + t.amountSen, 0)).toBe(b.revenueSen);
    expect(report.expenses.wagesSen).toBe(9_000 + BRANCH_BARISTA_WAGE_SEN);
    expect(report.expenses.rentSen).toBe(12_000 + 9_000);
    expect(report.capexSen).toBe(600_000);
    // Its fit-out is depreciated from today's close.
    expect(report.expenses.depreciationSen).toBe(Math.floor(600_000 / BRANCH_LIFE_DAYS));
    expect(report.closingAssetsSen).toBe(600_000 - Math.floor(600_000 / BRANCH_LIFE_DAYS));
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
    expect(b.hourlyRevenueSen.reduce((a, c) => a + c, 0)).toBe(b.revenueSen);
    expect(state.branch?.reputation).toBe(b.reputationAfter);
    expect(state.stats.totalServed).toBe(report.customers.served + b.customers.served);
    expect(state.stats.branchesOpened).toBe(1);
    expect(report.objectivesCompleted).toContain('open_branch');
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
    expect(settle(stockAll(nextDay(state), 100)).state.stats.branchesOpened).toBe(1); // not again the next day
  });

  it('serves the main café first: the branch gets what is left', () => {
    const opened = expectOk(openBranch(levelThree(), 'pejabat')).state;
    const tight = stockAll(opened, 30); // about one location's worth
    const { report } = settle(tight);
    expect(report.customers.lostStock).toBeLessThan(report.branch!.customers.lostStock);
    expect(report.branch!.customers.lostStock).toBeGreaterThan(0);
    expect(report.timeline.some((t) => t.text.includes('kafe utama didahulukan'))).toBe(true);
  });

  it('reconciles every report over weeks of play, and stays valid', () => {
    for (const location of ['kampus', 'pejabat', 'mall'] as const) {
      const s = expectOk(openBranch(levelThree(7), location)).state;
      const { state, reports } = playDays(s, 16, 160);
      expect(reports).toHaveLength(16);
      noFailedChecks(state);
      expect(reports.every((r) => r.branch?.location === location)).toBe(true);
      expect(state.branch?.fitOut.chargedDays).toBe(16);
      expect(state.dayStart.assetsSen).toBe(bookValue(state.branch!.fitOut));
      expect(validateGameState(structuredClone(state)).ok).toBe(true);
      // Weekly totals include the branch's customers.
      const week = weeklySummaries(reports)[0]!;
      const days = reports.filter((r) => r.day <= 7);
      expect(week.served).toBe(days.reduce((n, r) => n + r.customers.served + (r.branch?.customers.served ?? 0), 0));
    }
  });
});

describe('locations', () => {
  const footfall = (location: 'kampus' | 'pejabat' | 'mall', day: number, eventId: 'public_holiday' | null = null): number => {
    const branch = expectOk(openBranch(levelThree(), location)).state.branch!;
    const mods = branchModifiers(branch, day, PROMOTIONS.none, eventId);
    return estimateDemand(day, 40, newGame().products, branchStaff(branch), [], mods).footfall;
  };

  it('follow their own week: campus and offices are quiet at weekends, the mall is busiest then', () => {
    expect(weekdayIndex(6)).toBe(5);
    expect(footfall('kampus', 2)).toBeGreaterThan(footfall('kampus', 6) * 2);
    expect(footfall('pejabat', 2)).toBeGreaterThan(footfall('pejabat', 7) * 4);
    expect(footfall('mall', 6)).toBeGreaterThan(footfall('mall', 2) * 1.8);
    expect(footfall('mall', 2, 'public_holiday')).toBeGreaterThan(footfall('mall', 2));
    expect(footfall('pejabat', 2, 'public_holiday')).toBeLessThan(footfall('pejabat', 2) / 2);
  });

  it('are offered with their costs, locked until level 3', () => {
    const locked = branchLocationViews(newGame());
    expect(locked.every((v) => v.locked)).toBe(true);
    const views = branchLocationViews(levelThree());
    expect(views.map((v) => [v.id, v.setupCostSen, v.dailyFixedSen, v.locked])).toEqual([
      ['kampus', 600_000, 9_000 + 9_000 + 2_000, false],
      ['pejabat', 800_000, 9_000 + 15_000 + 2_500, false],
      ['mall', 1_000_000, 9_000 + 20_000 + 3_000, false],
    ]);
    expect(views[0]?.dailyDepreciationSen).toBe(Math.floor(600_000 / BRANCH_LIFE_DAYS));
    expect(Object.keys(BRANCH_LOCATIONS)).toHaveLength(3);
  });
});

describe('running the branch', () => {
  it('staffs it with 1 to 3 baristas, which sets its capacity and wages', () => {
    let s = expectOk(openBranch(levelThree(), 'mall')).state;
    expect(branchView(s)?.capacityPerHour).toBe(8);
    s = expectOk(setBranchBaristas(s, 3)).state;
    expect(branchView(s)?.capacityPerHour).toBe(24);
    expect(projectedFixedCosts(s).branchSen).toBe(3 * BRANCH_BARISTA_WAGE_SEN + 20_000 + 3_000);
    expect(expectFail(setBranchBaristas(s, 4)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(setBranchBaristas(s, 0)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(setBranchBaristas(s, 3)).error).toBe('NO_CHANGE');
    expect(expectFail(setBranchBaristas(newGame(), 2)).error).toBe('NO_BRANCH');
    const { report } = settle(stockAll(s, 100));
    expect(report.branch).toMatchObject({ baristas: 3, wagesSen: 3 * BRANCH_BARISTA_WAGE_SEN });
  });

  it('plans stock for both locations and checks the branch before opening', () => {
    const base = levelThree();
    const s = expectOk(openBranch(base, 'kampus')).state;
    const need = (g: GameState) => ingredientViews(g).find((v) => v.id === 'kopi')!.estimatedNeed;
    expect(need(s)).toBeGreaterThan(need(base) * 1.5);
    expect(prepChecklist(s).find((c) => c.id === 'branch')).toMatchObject({ label: 'Cawangan Kampus: 1 barista' });
    expect(prepChecklist(base).find((c) => c.id === 'branch')).toBeUndefined();
  });
});

describe('closing a branch', () => {
  it('on the day it opened, cancels the opening with a full refund', () => {
    const opened = expectOk(openBranch(levelThree(), 'kampus')).state;
    const cancelled = expectOk(closeBranch(opened)).state;
    expect(cancelled.branch).toBeNull();
    expect(cancelled.cashSen).toBe(5_000_000);
    expect(cancelled.pendingWriteOffSen).toBe(0);
    expect(cancelled.stats.branchesOpened).toBe(0);
    expect(isObjectiveComplete(cancelled, 'open_branch')).toBe(false);
    const { report, state } = settle(stockAll(cancelled, 40));
    expect(report.capexSen).toBe(0);
    expect(report.branch).toBeNull();
    expect(isObjectiveComplete(state, 'open_branch')).toBe(false);
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('later, writes off its book value at that day’s close', () => {
    let s = expectOk(openBranch(levelThree(), 'kampus')).state;
    s = nextDay(settle(stockAll(s, 100)).state);
    s = nextDay(settle(stockAll(s, 100)).state);
    const value = bookValue(s.branch!.fitOut);
    expect(value).toBe(600_000 - 2 * Math.floor(600_000 / BRANCH_LIFE_DAYS));
    const closed = expectOk(closeBranch(s)).state;
    expect(closed.branch).toBeNull();
    expect(closed.pendingWriteOffSen).toBe(value);
    expect(closed.cashSen).toBe(s.cashSen);
    expect(validateGameState(structuredClone(closed)).ok).toBe(true);
    expect(expectFail(closeBranch(closed)).error).toBe('NO_BRANCH');
    const { report, state } = settle(stockAll(closed, 40));
    expect(report.branch).toBeNull();
    expect(report.expenses.writeOffSen).toBe(value);
    expect(report.expenses.depreciationSen).toBe(0);
    expect(report).toMatchObject({ openingAssetsSen: value, closingAssetsSen: 0 });
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
    expect(state.pendingWriteOffSen).toBe(0);
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
  });

  it('rejects a write-off or branch that does not add up', () => {
    let s = expectOk(openBranch(levelThree(), 'kampus')).state;
    s = nextDay(settle(stockAll(s, 100)).state);
    const clean = structuredClone(s);
    expect(validateGameState(clean).ok).toBe(true);
    const branch = clean.branch!;
    const bad: GameState[] = [
      { ...clean, pendingWriteOffSen: 500 }, // no branch was closed today
      { ...clean, branch: { ...branch, baristas: 4 } },
      { ...clean, branch: { ...branch, location: 'pulau' as 'kampus' } },
      { ...clean, branch: { ...branch, fitOut: { ...branch.fitOut, acquiredDay: 0 } } }, // not the day it opened
      { ...clean, branch: null }, // the day opened with its fit-out on the books
      { ...settle(clean).state, pendingWriteOffSen: 1 },
    ];
    for (const b of bad) expect(validateGameState(b).ok).toBe(false);
  });
});

describe('saves with a branch', () => {
  it('migrate from v6 with no branch, nothing written off and none opened', () => {
    const played = playDays(newGame(), 3, 40).state;
    const g = structuredClone(played) as unknown as Record<string, unknown> & {
      stats: Record<string, unknown>;
      history: (Record<string, unknown> & { expenses: Record<string, unknown> })[];
    };
    g.schemaVersion = 6;
    delete g.branch;
    delete g.pendingWriteOffSen;
    delete g.stats.branchesOpened;
    for (const r of g.history) {
      delete r.branch;
      delete r.expenses.writeOffSen;
    }
    const migrated = migrateSave({ schemaVersion: 6, savedAt: 'x', game: g });
    if (!migrated.ok) throw new Error(migrated.error);
    const validated = validateGameState(migrated.game);
    if (!validated.ok) throw new Error(validated.errors.join('\n'));
    expect(validated.state).toEqual(played);
    expect(validated.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});

import { describe, expect, it } from 'vitest';
import { bookValue } from '../assets';
import { branchEstimate, branchModifiers, branchSpoilageRate, branchStaff, branchSupplyNeeds, emptyStock, newBranch, planMorningTransfers } from '../branch';
import { ASSET_LIFE_DAYS, BRANCH_BARISTA_WAGE_SEN, BRANCH_LIFE_DAYS, SAVE_SCHEMA_VERSION } from '../constants';
import { BRANCH_LOCATIONS } from '../data/branches';
import { INGREDIENTS } from '../data/ingredients';
import { PROMOTIONS } from '../data/promotions';
import { estimateDemand, weekdayIndex } from '../demand';
import { projectedFixedCosts, totalInventoryValue } from '../economy';
import { buyBranchUpgrade, closeBranch, openBranch, setBranchBaristas, startNextDay } from '../engine';
import { isObjectiveComplete } from '../objectives';
import { reconcileReport, weeklySummaries } from '../reports';
import { migrateSave } from '../save';
import { branchLocationViews, branchViews, fixedAssetsValue, ingredientViews, prepChecklist } from '../selectors';
import type { BranchLocationId, GameState } from '../types';
import { INGREDIENT_IDS } from '../types';
import { validateGameState } from '../validate';
import { expectFail, expectOk, newGame, playDays, settle, stockAll } from './helpers';

/** A level-3 café with RM50,000 in cash: enough for its first branch. */
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

/** A level-4 café: enough for every branch. */
function levelFour(seed?: number): GameState {
  const g = levelThree(seed);
  return {
    ...g,
    completedObjectives: [
      ...g.completedObjectives,
      { id: 'serve_1000', day: 1 },
      { id: 'profit_streak_5', day: 1 },
      { id: 'cash_8000', day: 1 },
      { id: 'rep_70', day: 1 },
    ],
  };
}

function withBranches(state: GameState, ...locations: BranchLocationId[]): GameState {
  return locations.reduce((s, location) => expectOk(openBranch(s, location)).state, state);
}

function nextDay(s: GameState): GameState {
  return expectOk(startNextDay(s, s.day)).state;
}

function noFailedChecks(s: GameState): void {
  for (const r of s.history) expect(reconcileReport(r).checks.filter((c) => !c.ok)).toEqual([]);
}

describe('opening branches', () => {
  it('needs the café level for each branch in turn, the cash for its fit-out and a free location', () => {
    expect(expectFail(openBranch(newGame(), 'kampus')).error).toBe('LOCKED');
    expect(expectFail(openBranch({ ...levelThree(), cashSen: 100_000 }, 'mall')).error).toBe('INSUFFICIENT_FUNDS');
    const one = withBranches(levelThree(), 'kampus');
    expect(expectFail(openBranch(one, 'kampus')).error).toBe('BRANCH_EXISTS');
    expect(expectFail(openBranch(one, 'pejabat')).error).toBe('LOCKED'); // the second needs level 4
    const three = withBranches(levelFour(), 'kampus', 'pejabat', 'mall');
    expect(three.branches.map((b) => b.location)).toEqual(['kampus', 'pejabat', 'mall']);
    expect(three.cashSen).toBe(5_000_000 - 600_000 - 800_000 - 1_000_000);
    expect(expectFail(openBranch(three, 'kampus')).error).toBe('BRANCH_EXISTS');
    expect(expectFail(openBranch(settle(levelThree()).state, 'kampus')).error).toBe('WRONG_PHASE');
    expect(expectFail(openBranch(levelThree(), 'kutub' as 'kampus')).error).toBe('UNKNOWN_ITEM');
  });

  it('pays the fit-out as capital spending and records it as an asset', () => {
    const r = expectOk(openBranch(levelThree(), 'kampus'));
    expect(r.state.cashSen).toBe(5_000_000 - 600_000);
    expect(r.state.branches).toEqual([
      {
        location: 'kampus',
        openedDay: 1,
        reputation: 40,
        baristas: 1,
        fitOut: { costSen: 600_000, lifeDays: BRANCH_LIFE_DAYS, acquiredDay: 1, chargedDays: 0 },
        upgrades: [],
        ingredients: emptyStock(),
      },
    ]);
    expect(r.state.dayTransactions.at(-1)).toMatchObject({ type: 'branch_setup', amountSen: -600_000, label: 'Buka cawangan: Kawasan universiti' });
    expect(r.state.stats.branchesOpened).toBe(0); // counted once it has traded a day
    expect(validateGameState(structuredClone(r.state)).ok).toBe(true);
  });
});

describe('a day with a branch', () => {
  it('adds the branch to the report’s totals and reconciles them', () => {
    const s = stockAll(withBranches(levelThree(), 'kampus'), 120);
    const { report, state } = settle(s);
    expect(report.branches).toHaveLength(1);
    const b = report.branches[0]!;
    expect(b.location).toBe('kampus');
    expect(b.customers.served).toBeGreaterThan(0);
    expect(b.revenueSen).toBeGreaterThan(0);
    expect(b.wagesSen).toBe(BRANCH_BARISTA_WAGE_SEN);
    expect(b.rentSen).toBe(9_000);
    expect(b.contributionSen).toBe(b.revenueSen - b.cogsSen - b.wagesSen - b.rentSen - b.utilitiesSen - b.spoilageSen);
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
    expect(state.branches[0]?.reputation).toBe(b.reputationAfter);
    expect(state.stats.totalServed).toBe(report.customers.served + b.customers.served);
    expect(state.stats.branchesOpened).toBe(1);
    expect(report.objectivesCompleted).toContain('open_branch');
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
    expect(settle(stockAll(nextDay(state), 100)).state.stats.branchesOpened).toBe(1); // not again the next day
  });

  it('sends each branch its shortfall from the central store, and it keeps what is left', () => {
    const s = stockAll(withBranches(levelThree(), 'kampus'), 120);
    const needs = branchSupplyNeeds(s, s.branches[0]!);
    const { transfers, centralLeft } = planMorningTransfers(s);
    for (const id of INGREDIENT_IDS) {
      expect(needs[id].shortfall).toBeGreaterThanOrEqual(needs[id].need); // nothing held yet
      expect(transfers[0]?.units[id]).toBe(needs[id].shortfall);
      expect(centralLeft[id]).toBe(s.ingredients[id].stock - needs[id].shortfall);
    }
    const { report, state } = settle(s);
    // The stock on the books at the close is the central store's and the branch's.
    const held = state.branches[0]!.ingredients;
    expect(held.kopi.stock).toBeGreaterThan(0); // the safety margin, which keeps
    for (const line of report.ingredients ?? []) {
      expect(line.closingStock).toBe(state.ingredients[line.ingredientId].stock + held[line.ingredientId].stock);
    }
    expect(report.closingInventorySen).toBe(totalInventoryValue(state));
    // The next morning it only needs topping up.
    const next = nextDay(state);
    const tomorrow = branchSupplyNeeds(next, next.branches[0]!);
    expect(tomorrow.kopi.shortfall + held.kopi.stock).toBeGreaterThanOrEqual(tomorrow.kopi.need);
    expect(tomorrow.kopi.shortfall).toBeLessThan(Math.ceil((tomorrow.kopi.need * 1.15) / 5) * 5);
    expect(next.dayStart.inventorySen).toBe(totalInventoryValue(next));
    expect(validateGameState(structuredClone(next)).ok).toBe(true);
  });

  it('supplies the branches first: the main café sells what is left', () => {
    const tight = stockAll(withBranches(levelThree(), 'pejabat'), 20);
    const { transfers } = planMorningTransfers(tight);
    expect(transfers[0]?.units.kopi).toBe(tight.ingredients.kopi.stock); // every bean it holds
    const { report } = settle(tight);
    expect(report.customers.lostStock).toBeGreaterThan(report.branches[0]!.customers.lostStock);
    expect(report.timeline.some((t) => t.text.startsWith('Stor pusat tidak cukup untuk dihantar ke cawangan Pejabat'))).toBe(true);
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
    // With enough stock, no warning.
    const plenty = settle(stockAll(withBranches(levelThree(), 'pejabat'), 60)).report;
    expect(plenty.timeline.some((t) => t.text.startsWith('Stor pusat tidak cukup'))).toBe(false);
  });

  it('reconciles every report over weeks of play with every branch open, and stays valid', () => {
    const s = withBranches(levelFour(7), 'kampus', 'pejabat', 'mall');
    const { state, reports } = playDays(s, 16, 250);
    expect(reports).toHaveLength(16);
    noFailedChecks(state);
    expect(reports.every((r) => r.branches.map((b) => b.location).join() === 'kampus,pejabat,mall')).toBe(true);
    expect(state.branches.every((b) => b.fitOut.chargedDays === 16)).toBe(true);
    expect(state.dayStart.assetsSen).toBe(fixedAssetsValue(state));
    expect(state.stats.branchesOpened).toBe(3);
    expect(reports.some((r) => r.branches.some((b) => b.spoilageSen > 0))).toBe(true); // its own milk and pastries
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
    // Weekly totals include every branch's customers.
    const week = weeklySummaries(reports)[0]!;
    const days = reports.filter((r) => r.day <= 7);
    const served = days.reduce((n, r) => n + r.customers.served + r.branches.reduce((m, b) => m + b.customers.served, 0), 0);
    expect(week.served).toBe(served);
  });
});

describe('locations', () => {
  const footfall = (location: BranchLocationId, day: number, eventId: 'public_holiday' | null = null): number => {
    const branch = newBranch(location, 1);
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

  it('are offered with their costs, each next branch locked until its level', () => {
    expect(branchLocationViews(newGame()).every((v) => v.locked)).toBe(true);
    const views = branchLocationViews(levelThree());
    expect(views.map((v) => [v.id, v.setupCostSen, v.dailyFixedSen, v.locked, v.requiredLevel])).toEqual([
      ['kampus', 600_000, 9_000 + 9_000 + 2_000, false, 3],
      ['pejabat', 800_000, 9_000 + 12_000 + 2_500, false, 3],
      ['mall', 1_000_000, 9_000 + 16_000 + 3_000, false, 3],
    ]);
    expect(views[0]?.dailyDepreciationSen).toBe(Math.floor(600_000 / BRANCH_LIFE_DAYS));
    const afterOne = branchLocationViews(withBranches(levelThree(), 'kampus'));
    expect(afterOne.map((v) => [v.id, v.open, v.locked, v.requiredLevel])).toEqual([
      ['kampus', true, true, 4],
      ['pejabat', false, true, 4],
      ['mall', false, true, 4],
    ]);
    expect(branchLocationViews(withBranches(levelFour(), 'kampus', 'pejabat', 'mall')).every((v) => v.open && v.requiredLevel === null)).toBe(true);
    expect(Object.keys(BRANCH_LOCATIONS)).toHaveLength(3);
  });
});

describe('running a branch', () => {
  it('staffs it with 1 to 3 baristas, which sets its capacity and wages', () => {
    let s = withBranches(levelThree(), 'mall');
    expect(branchViews(s)[0]?.capacityPerHour).toBe(8);
    s = expectOk(setBranchBaristas(s, 'mall', 3)).state;
    expect(branchViews(s)[0]?.capacityPerHour).toBe(24);
    expect(projectedFixedCosts(s).branchSen).toBe(3 * BRANCH_BARISTA_WAGE_SEN + 16_000 + 3_000);
    expect(expectFail(setBranchBaristas(s, 'mall', 4)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(setBranchBaristas(s, 'mall', 0)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(setBranchBaristas(s, 'mall', 3)).error).toBe('NO_CHANGE');
    expect(expectFail(setBranchBaristas(s, 'kampus', 2)).error).toBe('NO_BRANCH');
    const { report } = settle(stockAll(s, 100));
    expect(report.branches[0]).toMatchObject({ baristas: 3, wagesSen: 3 * BRANCH_BARISTA_WAGE_SEN });
  });

  it('plans stock for every location and checks each branch before opening', () => {
    const base = levelFour();
    const one = withBranches(base, 'kampus');
    const two = withBranches(one, 'pejabat');
    const target = (g: GameState) => ingredientViews(g).find((v) => v.id === 'kopi')!.estimatedNeed;
    expect(target(one)).toBeGreaterThan(target(base) * 1.5);
    expect(target(two)).toBeGreaterThan(target(one));
    const checklist = prepChecklist(two);
    expect(checklist.find((c) => c.id === 'branch-kampus')).toMatchObject({ label: 'Cawangan Kampus: 1 barista', status: 'warn' }); // no stock yet
    expect(checklist.find((c) => c.id === 'branch-pejabat')?.detail).toContain('Stor pusat tidak cukup untuk dihantar');
    expect(prepChecklist(stockAll(two, 120)).find((c) => c.id === 'branch-kampus')?.detail).toContain('dihantar daripada stor pusat');
    expect(prepChecklist(base).some((c) => c.id.startsWith('branch'))).toBe(false);
  });

  it('can buy its own upgrades, depreciated like the café’s', () => {
    let s = withBranches(levelThree(), 'mall');
    s = expectOk(buyBranchUpgrade(s, 'mall', 'mesin')).state;
    expect(s.branches[0]?.upgrades).toEqual([{ id: 'mesin', costSen: 150_000, lifeDays: ASSET_LIFE_DAYS, acquiredDay: 1, chargedDays: 0 }]);
    expect(s.dayTransactions.at(-1)).toMatchObject({
      type: 'upgrade',
      amountSen: -150_000,
      label: 'Naik taraf cawangan Pusat beli-belah: Mesin espreso cawangan',
    });
    expect(branchViews(s)[0]?.capacityPerHour).toBe(10); // 8 orders an hour, +25%
    expect(expectFail(buyBranchUpgrade(s, 'mall', 'mesin')).error).toBe('ALREADY_OWNED');
    expect(expectFail(buyBranchUpgrade(s, 'kampus', 'papan')).error).toBe('NO_BRANCH');
    expect(expectFail(buyBranchUpgrade(s, 'mall', 'roket' as 'papan')).error).toBe('UNKNOWN_ITEM');
    expect(expectFail(buyBranchUpgrade({ ...s, cashSen: 100 }, 'mall', 'papan')).error).toBe('INSUFFICIENT_FUNDS');
    expect(expectFail(buyBranchUpgrade(settle(s).state, 'mall', 'papan')).error).toBe('WRONG_PHASE');
    const { report, state } = settle(stockAll(s, 150));
    expect(report.capexSen).toBe(1_000_000 + 150_000);
    expect(report.expenses.depreciationSen).toBe(Math.floor(1_000_000 / BRANCH_LIFE_DAYS) + Math.floor(150_000 / ASSET_LIFE_DAYS));
    expect(report.closingAssetsSen).toBe(fixedAssetsValue(state));
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
  });

  it('draws more customers with a sign and spoils less with a fridge', () => {
    const s = withBranches(levelThree(), 'pejabat');
    const signed = expectOk(buyBranchUpgrade(s, 'pejabat', 'papan')).state;
    const before = branchEstimate(s, s.branches[0]!).footfall;
    expect(branchEstimate(signed, signed.branches[0]!).footfall).toBeGreaterThan(before * 1.05);
    const cooled = expectOk(buyBranchUpgrade(s, 'pejabat', 'peti')).state.branches[0]!;
    expect(branchSpoilageRate(cooled, 'susu')).toBeCloseTo(INGREDIENTS.susu.spoilageRate * 0.4);
    expect(branchSpoilageRate(cooled, 'pastri')).toBeCloseTo(INGREDIENTS.pastri.spoilageRate * 0.4);
    expect(branchSpoilageRate(cooled, 'kopi')).toBe(INGREDIENTS.kopi.spoilageRate);
    expect(branchSpoilageRate(s.branches[0]!, 'susu')).toBe(INGREDIENTS.susu.spoilageRate);
  });
});

describe('closing a branch', () => {
  it('on the day it opened, cancels the opening and today’s upgrades with a full refund', () => {
    const opened = expectOk(buyBranchUpgrade(withBranches(levelThree(), 'kampus'), 'kampus', 'papan')).state;
    const cancelled = expectOk(closeBranch(opened, 'kampus')).state;
    expect(cancelled.branches).toEqual([]);
    expect(cancelled.cashSen).toBe(5_000_000);
    expect(cancelled.pendingWriteOffSen).toBe(0);
    expect(cancelled.stats.branchesOpened).toBe(0);
    expect(isObjectiveComplete(cancelled, 'open_branch')).toBe(false);
    const { report, state } = settle(stockAll(cancelled, 40));
    expect(report.capexSen).toBe(0);
    expect(report.branches).toEqual([]);
    expect(isObjectiveComplete(state, 'open_branch')).toBe(false);
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('later, returns its stock and writes off its book value at that day’s close', () => {
    let s = withBranches(levelFour(), 'kampus', 'mall');
    s = nextDay(settle(stockAll(s, 200)).state);
    s = nextDay(settle(stockAll(s, 100)).state);
    s = expectOk(buyBranchUpgrade(s, 'kampus', 'peti')).state; // bought today: refunded
    const branch = s.branches[0]!;
    const value = bookValue(branch.fitOut);
    expect(value).toBe(600_000 - 2 * Math.floor(600_000 / BRANCH_LIFE_DAYS));
    expect(branch.ingredients.kopi.stock).toBeGreaterThan(0);
    const closed = expectOk(closeBranch(s, 'kampus')).state;
    expect(closed.branches.map((b) => b.location)).toEqual(['mall']);
    expect(closed.pendingWriteOffSen).toBe(value);
    expect(closed.cashSen).toBe(s.cashSen + 70_000);
    for (const id of INGREDIENT_IDS) {
      expect(closed.ingredients[id].stock).toBe(s.ingredients[id].stock + branch.ingredients[id].stock);
      expect(closed.ingredients[id].stockValueSen).toBe(s.ingredients[id].stockValueSen + branch.ingredients[id].stockValueSen);
    }
    expect(validateGameState(structuredClone(closed)).ok).toBe(true);
    expect(expectFail(closeBranch(closed, 'kampus')).error).toBe('NO_BRANCH');
    const { report, state } = settle(stockAll(closed, 100));
    expect(report.branches.map((b) => b.location)).toEqual(['mall']);
    expect(report.expenses.writeOffSen).toBe(value);
    expect(report.capexSen).toBe(0);
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
    expect(state.pendingWriteOffSen).toBe(0);
    expect(validateGameState(structuredClone(state)).ok).toBe(true);
  });

  it('rejects branches or a write-off that do not add up', () => {
    let s = withBranches(levelFour(), 'kampus', 'pejabat');
    s = expectOk(buyBranchUpgrade(s, 'kampus', 'papan')).state;
    s = nextDay(settle(stockAll(s, 150)).state);
    const clean = structuredClone(s);
    expect(validateGameState(clean).ok).toBe(true);
    const [kampus, pejabat] = clean.branches as [GameState['branches'][number], GameState['branches'][number]];
    const papan = kampus.upgrades[0]!;
    const report = clean.history[0]!;
    const withKampus = (b: Partial<typeof kampus>): GameState => ({ ...clean, branches: [{ ...kampus, ...b }, pejabat] });
    const bad: GameState[] = [
      { ...clean, pendingWriteOffSen: 500 }, // no branch was closed today
      withKampus({ baristas: 4 }),
      withKampus({ location: 'pulau' as 'kampus' }),
      withKampus({ fitOut: { ...kampus.fitOut, acquiredDay: 0 } }), // not the day it opened
      withKampus({ upgrades: [papan, papan] }),
      withKampus({ upgrades: [{ ...papan, id: 'roket' as 'papan' }] }),
      withKampus({ upgrades: [{ ...papan, chargedDays: 2 }] }), // more closes than it has seen
      withKampus({ ingredients: { ...kampus.ingredients, kopi: { stock: -1, stockValueSen: 0 } } }),
      withKampus({ ingredients: { ...kampus.ingredients, teh: { stock: 0, stockValueSen: 50 } } }),
      { ...clean, branches: [kampus, { ...pejabat, location: 'kampus' }] },
      { ...clean, branches: [pejabat] }, // the day opened with the Kampus fit-out on the books
      { ...clean, history: [{ ...report, branches: [{ ...report.branches[0]!, contributionSen: report.branches[0]!.contributionSen + 1 }, report.branches[1]!] }] },
      { ...clean, history: [{ ...report, branches: [report.branches[0]!, report.branches[0]!] }] },
      { ...settle(clean).state, pendingWriteOffSen: 1 },
    ];
    for (const b of bad) expect(validateGameState(b).ok).toBe(false);
  });
});

type Loose = Record<string, any>;

describe('saves with branches', () => {
  it('migrate from v6 with no branch, nothing written off and none opened', () => {
    const played = playDays(newGame(), 3, 40).state;
    const g = structuredClone(played) as unknown as Loose;
    g.schemaVersion = 6;
    delete g.branches;
    delete g.pendingWriteOffSen;
    delete g.stats.branchesOpened;
    for (const r of g.history) {
      delete r.branches;
      delete r.expenses.writeOffSen;
    }
    const migrated = migrateSave({ schemaVersion: 6, savedAt: 'x', game: g });
    if (!migrated.ok) throw new Error(migrated.error);
    const validated = validateGameState(migrated.game);
    if (!validated.ok) throw new Error(validated.errors.join('\n'));
    expect(validated.state).toEqual(played);
    expect(validated.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('migrate from v7: its one branch becomes the first, with no stock or upgrades of its own', () => {
    // A v7 branch sold from the central store, so the whole stock is there.
    const played = settle(stockAll(withBranches(levelThree(), 'kampus'), 120)).state;
    const v8 = nextDay(played);
    const g = structuredClone(v8) as unknown as Loose;
    const held = v8.branches[0]!.ingredients;
    for (const id of INGREDIENT_IDS) {
      g.ingredients[id].stock += held[id].stock;
      g.ingredients[id].stockValueSen += held[id].stockValueSen;
    }
    const { upgrades: _u, ingredients: _i, ...branch } = g.branches[0];
    g.branch = branch;
    delete g.branches;
    for (const r of g.history) {
      const { spoilageSen, ...day } = r.branches[0];
      r.branch = { ...day, contributionSen: day.contributionSen + spoilageSen }; // v7 had no branch spoilage
      delete r.branches;
    }
    g.schemaVersion = 7;
    const migrated = migrateSave({ schemaVersion: 7, savedAt: 'x', game: g });
    if (!migrated.ok) throw new Error(migrated.error);
    const validated = validateGameState(migrated.game);
    if (!validated.ok) throw new Error(validated.errors.join('\n'));
    const state = validated.state;
    expect(state.branches).toEqual([{ ...v8.branches[0], ingredients: emptyStock() }]);
    expect(totalInventoryValue(state)).toBe(totalInventoryValue(v8));
    expect(state.history[0]?.branches).toEqual([{ ...g.history[0].branch, spoilageSen: 0 }]);
    expect('branch' in state).toBe(false);
    // It plays on: the branch is supplied from the central store the next morning.
    const { report } = settle(state);
    expect(reconcileReport(report).checks.filter((c) => !c.ok)).toEqual([]);
  });
});

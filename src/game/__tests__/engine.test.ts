import { describe, expect, it } from 'vitest';
import { RENT_SEN_PER_DAY, STARTING_CASH_SEN, UTILITIES_BASE_SEN, UTILITIES_PER_CUSTOMER_SEN } from '../constants';
import {
  buyUpgrade,
  createNewGame,
  fireStaff,
  hireStaff,
  openCafe,
  purchaseStock,
  purchaseStockBatch,
  setPrice,
  setProductEnabled,
  setPromotion,
  startNextDay,
} from '../engine';
import { reconcileReport } from '../reports';
import { hiringCandidates } from '../selectors';
import { sumSen } from '../money';
import { PRODUCT_IDS, type GameState } from '../types';
import { expectFail, expectOk, newGame, playDays, settle, soldOf, stockAll, TEST_SEED, withEvent } from './helpers';

describe('new game', () => {
  it('starts with RM5,000, reputation 50, one barista and five products', () => {
    const s = newGame();
    expect(s.cashSen).toBe(STARTING_CASH_SEN);
    expect(s.reputation).toBe(50);
    expect(s.staff).toHaveLength(1);
    expect(s.staff[0]?.role).toBe('barista');
    expect(Object.keys(s.products)).toHaveLength(5);
    expect(s.products.kopi_o).toMatchObject({ priceSen: 350, unitCostSen: 100, enabled: true, stock: 0 });
    expect(s.products.americano).toMatchObject({ priceSen: 500, unitCostSen: 150 });
    expect(s.products.latte).toMatchObject({ priceSen: 700, unitCostSen: 220 });
    expect(s.products.teh_ais).toMatchObject({ priceSen: 350, unitCostSen: 120 });
    expect(s.products.croissant).toMatchObject({ priceSen: 550, unitCostSen: 200 });
    expect(s.day).toBe(1);
    expect(s.phase).toBe('prep');
  });
});

describe('stock purchasing', () => {
  it('reduces cash immediately and records a transaction', () => {
    const r = expectOk(purchaseStock(newGame(), 'latte', 20));
    expect(r.state.cashSen).toBe(STARTING_CASH_SEN - 4_400);
    expect(r.state.products.latte.stock).toBe(20);
    expect(r.state.products.latte.stockValueSen).toBe(4_400);
    expect(r.state.dayTransactions).toEqual([
      expect.objectContaining({ type: 'stock_purchase', amountSen: -4_400, productId: 'latte', quantity: 20 }),
    ]);
  });

  it('rejects purchases the café cannot afford and leaves state unchanged', () => {
    const poor = { ...newGame(), cashSen: 1_000 };
    const r = expectFail(purchaseStock(poor, 'latte', 10)); // RM22 needed
    expect(r.error).toBe('INSUFFICIENT_FUNDS');
    expect(r.message).toContain('Tunai tidak mencukupi');
    expect(poor.products.latte.stock).toBe(0);
  });

  it('allows spending exactly all cash', () => {
    const s = { ...newGame(), cashSen: 2_200 };
    const r = expectOk(purchaseStock(s, 'latte', 10));
    expect(r.state.cashSen).toBe(0);
  });

  it('is atomic for batch purchases', () => {
    const s = { ...newGame(), cashSen: 3_000 };
    const r = expectFail(
      purchaseStockBatch(s, [
        { productId: 'kopi_o', quantity: 10 }, // RM10
        { productId: 'latte', quantity: 10 }, // RM22 -> total RM32 > RM30
      ]),
    );
    expect(r.error).toBe('INSUFFICIENT_FUNDS');
    expect(s.products.kopi_o.stock).toBe(0);
  });

  it('rejects invalid quantities', () => {
    const s = newGame();
    expect(expectFail(purchaseStock(s, 'latte', 0)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'latte', -5)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'latte', 2.5)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'latte', 501)).error).toBe('INVALID_QUANTITY');
  });

  it('enforces storage capacity', () => {
    let s = expectOk(purchaseStock(newGame(), 'kopi_o', 500)).state;
    s = expectOk(purchaseStock(s, 'kopi_o', 499)).state;
    expect(expectFail(purchaseStock(s, 'kopi_o', 1)).error).toBe('STORAGE_FULL');
  });
});

describe('menu management', () => {
  it('updates prices within bounds', () => {
    const r = expectOk(setPrice(newGame(), 'latte', 780));
    expect(r.state.products.latte.priceSen).toBe(780);
    expect(expectFail(setPrice(newGame(), 'latte', 10)).error).toBe('INVALID_PRICE');
    expect(expectFail(setPrice(newGame(), 'latte', 7.5)).error).toBe('INVALID_PRICE');
    expect(expectFail(setPrice(newGame(), 'latte', 700)).error).toBe('NO_CHANGE');
  });

  it('never sells disabled products', () => {
    let s = stockAll(newGame());
    s = expectOk(setProductEnabled(s, 'latte', false)).state;
    s = expectOk(setProductEnabled(s, 'croissant', false)).state;
    const { report, state } = settle(s);
    expect(soldOf(report, 'latte')).toBe(0);
    expect(soldOf(report, 'croissant')).toBe(0);
    // Disabled stock is kept (perishables still spoil overnight).
    const latte = report.products.find((l) => l.productId === 'latte');
    expect(state.products.latte.stock).toBe(60 - (latte?.spoiledUnits ?? 0));
    expect(report.customers.served).toBeGreaterThan(0);
  });

  it('serves nobody when every product is disabled, and reputation drops', () => {
    let s = stockAll(newGame());
    for (const id of PRODUCT_IDS) s = expectOk(setProductEnabled(s, id, false)).state;
    const { report } = settle(s);
    expect(report.revenueSen).toBe(0);
    expect(report.customers.served).toBe(0);
    expect(report.reputationAfter).toBeLessThan(report.reputationBefore);
  });
});

describe('daily settlement accounting', () => {
  it('computes revenue, COGS and net profit from actual sales', () => {
    const s = stockAll(newGame(), 45); // below the bulk-discount threshold
    const { report, state } = settle(s);
    const revenue = sumSen(report.products.map((l) => l.sold * l.salePriceSen));
    expect(report.revenueSen).toBe(revenue);
    expect(report.revenueSen).toBeGreaterThan(0);
    // All stock bought at the same unit cost, so COGS = sold * unit cost.
    const cogs = sumSen(report.products.map((l) => l.sold * s.products[l.productId].unitCostSen));
    expect(report.cogsSen).toBe(cogs);
    expect(report.grossProfitSen).toBe(report.revenueSen - report.cogsSen);
    expect(report.expenses.rentSen).toBe(RENT_SEN_PER_DAY);
    expect(report.expenses.wagesSen).toBe(9_000);
    expect(report.expenses.utilitiesSen).toBe(UTILITIES_BASE_SEN + UTILITIES_PER_CUSTOMER_SEN * report.customers.served);
    expect(report.netProfitSen).toBe(
      report.revenueSen + report.otherIncomeSen - report.cogsSen - report.totalExpensesSen,
    );
    expect(state.cashSen).toBe(report.closingCashSen);
  });

  it('does not count unsold stock as cost of goods sold', () => {
    const s = expectOk(purchaseStock(newGame(), 'kopi_o', 300)).state;
    const { report, state } = settle(s);
    const sold = soldOf(report, 'kopi_o');
    expect(sold).toBeLessThan(300);
    // 8% bulk discount: RM276 for 300 units = 92 sen each.
    expect(report.stockPurchasesSen).toBe(27_600);
    expect(report.cogsSen).toBe(sold * 92);
    expect(state.products.kopi_o.stock).toBe(300 - sold);
    expect(report.closingInventorySen).toBe(state.products.kopi_o.stockValueSen);
  });

  it('keeps cash balance equal to opening cash plus every transaction', () => {
    const s = stockAll(newGame());
    const { report } = settle(s);
    expect(report.openingCashSen).toBe(STARTING_CASH_SEN);
    expect(report.closingCashSen).toBe(STARTING_CASH_SEN + sumSen(report.transactions.map((t) => t.amountSen)));
  });

  it('writes off spoiled perishables as an expense, not COGS', () => {
    const s = expectOk(purchaseStock(newGame(), 'croissant', 200)).state;
    const { report, state } = settle(s);
    const line = report.products.find((l) => l.productId === 'croissant');
    expect(line?.spoiledUnits).toBeGreaterThan(0);
    expect(report.expenses.spoilageSen).toBe(line?.spoiledValueSen);
    expect(state.products.croissant.stock).toBe(200 - (line?.sold ?? 0) - (line?.spoiledUnits ?? 0));
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('reconciles every report over a long multi-seed run', () => {
    for (const seed of [1, 7, 42, 2024, 99_999]) {
      let s = createNewGame(seed);
      s = expectOk(setPromotion(s, 'social')).state;
      const { reports, state } = playDays(s, 25);
      expect(reports.length).toBeGreaterThan(0);
      for (const report of reports) {
        const rec = reconcileReport(report);
        expect(rec.checks.filter((c) => !c.ok)).toEqual([]);
      }
      // Cash continuity between days.
      for (let i = 1; i < reports.length; i++) {
        expect(reports[i]?.openingCashSen).toBe(reports[i - 1]?.closingCashSen);
        expect(reports[i]?.openingInventorySen).toBe(reports[i - 1]?.closingInventorySen);
      }
      for (const id of PRODUCT_IDS) {
        expect(state.products[id].stock).toBeGreaterThanOrEqual(0);
        expect(state.products[id].stockValueSen).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(state.products[id].stockValueSen)).toBe(true);
      }
      expect(Number.isInteger(state.cashSen)).toBe(true);
    }
  });

  it('never sells more than is in stock (no negative inventory)', () => {
    let s = newGame();
    s = expectOk(purchaseStock(s, 'kopi_o', 3)).state;
    s = expectOk(purchaseStock(s, 'latte', 2)).state;
    const { report, state } = settle(s);
    expect(soldOf(report, 'kopi_o')).toBeLessThanOrEqual(3);
    expect(soldOf(report, 'latte')).toBeLessThanOrEqual(2);
    expect(soldOf(report, 'americano')).toBe(0);
    for (const id of PRODUCT_IDS) expect(state.products[id].stock).toBeGreaterThanOrEqual(0);
    expect(report.customers.lostStock).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const a = settle(stockAll(newGame(777))).report;
    const b = settle(stockAll(newGame(777))).report;
    expect(a).toEqual(b);
  });
});

describe('service capacity', () => {
  it('never serves more customers per hour than capacity', () => {
    const s = withEvent(stockAll(newGame(), 150), 'food_festival');
    const { report } = settle(s);
    for (const h of report.hourly) {
      expect(h.served).toBeLessThanOrEqual(h.capacity);
    }
    expect(report.customers.lostCapacity).toBeGreaterThan(0);
  });

  it('serves more customers with a second staff member', () => {
    const busy = withEvent(stockAll(newGame(), 150), 'food_festival');
    const solo = settle(busy).report;
    const candidate = hiringCandidates(busy).find((c) => c.role === 'barista');
    if (!candidate) throw new Error('expected a barista candidate');
    const team = settle(expectOk(hireStaff(busy, candidate.id)).state).report;
    expect(team.hourly[0]?.capacity).toBeGreaterThan(solo.hourly[0]?.capacity ?? 0);
    expect(team.customers.lostCapacity).toBeLessThan(solo.customers.lostCapacity);
  });
});

describe('price effects on demand', () => {
  it('sells fewer units at a much higher price', () => {
    const s = stockAll(newGame(), 200);
    const normal = settle(s).report;
    const pricey = settle(expectOk(setPrice(s, 'latte', 1_400)).state).report;
    expect(soldOf(pricey, 'latte')).toBeLessThan(soldOf(normal, 'latte'));
    expect(pricey.customers.lostPrice).toBeGreaterThan(normal.customers.lostPrice);
  });
});

describe('one settlement per day', () => {
  it('rejects a second openCafe for the same day', () => {
    const s = stockAll(newGame());
    const first = settle(s);
    const again = expectFail(openCafe(first.state, 1));
    expect(again.error).toBe('ALREADY_SETTLED');
    expect(first.state.history).toHaveLength(1);
  });

  it('rejects settlement requests for the wrong day', () => {
    const s = stockAll(newGame());
    expect(expectFail(openCafe(s, 2)).error).toBe('STALE_DAY');
    expect(expectFail(openCafe(s, 0)).error).toBe('STALE_DAY');
  });

  it('blocks preparation actions after closing until the next day starts', () => {
    const { state } = settle(stockAll(newGame()));
    expect(expectFail(purchaseStock(state, 'latte', 1)).error).toBe('WRONG_PHASE');
    expect(expectFail(setPrice(state, 'latte', 800)).error).toBe('WRONG_PHASE');
    const next = expectOk(startNextDay(state, 1)).state;
    expect(next.day).toBe(2);
    expect(next.phase).toBe('prep');
    expect(next.dayStart.cashSen).toBe(state.cashSen);
    expect(expectFail(startNextDay(next, 1)).error).toBe('STALE_DAY');
    expect(expectOk(purchaseStock(next, 'latte', 1)).state.products.latte.stock).toBeGreaterThan(0);
  });

  it('cannot advance before the day is processed', () => {
    expect(expectFail(startNextDay(newGame(), 1)).error).toBe('WRONG_PHASE');
  });
});

describe('promotions', () => {
  it('charges marketing at opening and increases footfall', () => {
    const s = stockAll(newGame(), 150);
    const plain = settle(s).report;
    const promoted = settle(expectOk(setPromotion(s, 'flyers')).state).report;
    expect(promoted.expenses.marketingSen).toBe(6_000);
    expect(promoted.customers.arrivals).toBeGreaterThan(plain.customers.arrivals);
  });

  it('cancels a promotion that is no longer affordable at opening', () => {
    let s = expectOk(setPromotion(newGame(), 'flyers')).state;
    s = { ...s, cashSen: 100, dayStart: { ...s.dayStart, cashSen: 100 } };
    const { report } = settle(s);
    expect(report.promotionSkipped).toBe(true);
    expect(report.expenses.marketingSen).toBe(0);
    expect(reconcileReport(report).ok).toBe(true);
  });

  it('applies the discount to sale prices', () => {
    const s = expectOk(setPromotion(stockAll(newGame()), 'discount10')).state;
    const { report } = settle(s);
    expect(report.products.find((l) => l.productId === 'latte')?.salePriceSen).toBe(630);
  });

  it('keeps free promotions available when cash is negative', () => {
    const broke = { ...newGame(), cashSen: -5_000, dayStart: { cashSen: -5_000, inventorySen: 0 } };
    const discounted = expectOk(setPromotion(broke, 'discount10')).state;
    expect(expectFail(setPromotion(broke, 'social')).error).toBe('INSUFFICIENT_FUNDS');
    const plain = settle(stockAll({ ...broke, cashSen: 50_000, dayStart: { cashSen: 50_000, inventorySen: 0 } }, 10));
    expect(plain.report.promotionSkipped).toBe(false);
    const noPromo = settle(broke).report;
    expect(noPromo.promotionSkipped).toBe(false);
    expect(noPromo.timeline.some((t) => t.text.includes('dibatalkan'))).toBe(false);
    const free = settle(discounted).report;
    expect(free.promotionSkipped).toBe(false);
    expect(free.promotionId).toBe('discount10');
  });

  it('locks higher-level promotions', () => {
    expect(expectFail(setPromotion(newGame(), 'influencer')).error).toBe('LOCKED');
  });
});

describe('staff', () => {
  it('hires a candidate, charging the hiring fee and adding wages', () => {
    const s = newGame();
    const candidate = hiringCandidates(s)[0];
    if (!candidate) throw new Error('no candidate');
    const r = expectOk(hireStaff(s, candidate.id));
    expect(r.state.staff).toHaveLength(2);
    expect(r.state.cashSen).toBe(STARTING_CASH_SEN - candidate.hireFeeSen);
    expect(r.newObjectives).toContain('hire_staff');
    const { report } = settle(stockAll(r.state));
    expect(report.expenses.wagesSen).toBe(9_000 + candidate.wageSen);
    expect(report.expenses.hiringSen).toBe(candidate.hireFeeSen);
  });

  it('keeps the other candidates unchanged after hiring one', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createNewGame(seed);
      const before = hiringCandidates(s);
      const pick = before[seed % before.length];
      if (!pick) continue;
      const after = hiringCandidates(expectOk(hireStaff(s, pick.id)).state);
      expect(after).toEqual(before.filter((c) => c.id !== pick.id));
    }
  });

  it('keeps today’s candidates unchanged when an earlier hire is fired', () => {
    for (let seed = 1; seed <= 150; seed++) {
      let s = createNewGame(seed);
      const first = hiringCandidates(s)[0];
      if (!first) continue;
      s = expectOk(hireStaff(s, first.id)).state;
      s = settle(stockAll(s, 30)).state;
      s = expectOk(startNextDay(s, s.day)).state;
      const before = hiringCandidates(s);
      s = expectOk(fireStaff(s, first.id)).state;
      expect(hiringCandidates(s)).toEqual(before);
      expect(before.some((c) => c.name === first.name)).toBe(false);
    }
  });

  it('never offers a candidate with the same name as someone on the team', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s: GameState = {
        ...createNewGame(seed),
        upgrades: ['second_counter'],
        cashSen: 5_000_000,
        dayStart: { cashSen: 5_000_000, inventorySen: 0, staffNames: ['Aiman'] },
      };
      for (let day = 0; day < 6; day++) {
        // Hire, then fire a non-founder, then hire again, checking names each step.
        for (const step of [0, 1, 2]) {
          const names = new Set(s.staff.map((m) => m.name));
          for (const c of hiringCandidates(s)) expect(names.has(c.name)).toBe(false);
          const c = hiringCandidates(s)[step % 2];
          if (step === 1) {
            const victim = s.staff.find((m) => m.id !== 'staff-founder');
            if (victim) s = expectOk(fireStaff(s, victim.id)).state;
          } else if (c && s.staff.length < 4) {
            s = expectOk(hireStaff(s, c.id)).state;
          }
        }
        expect(new Set(s.staff.map((m) => m.name)).size).toBe(s.staff.length);
        s = settle(s).state;
        s = expectOk(startNextDay(s, s.day)).state;
      }
    }
  });

  it('enforces staff slots and keeps at least one barista', () => {
    let s = newGame();
    const [c1, c2] = hiringCandidates(s);
    if (!c1 || !c2) throw new Error('need candidates');
    s = expectOk(hireStaff(s, c1.id)).state;
    expect(expectFail(hireStaff(s, c2.id)).error).toBe('STAFF_LIMIT');
    expect(expectFail(fireStaff(newGame(), 'staff-founder')).error).toBe('LAST_BARISTA');
  });
});

describe('upgrades', () => {
  it('is capital spending: reduces cash but not net profit', () => {
    const s = stockAll(newGame());
    const r = expectOk(buyUpgrade(s, 'signage'));
    expect(r.state.cashSen).toBe(s.cashSen - 60_000);
    const { report } = settle(r.state);
    expect(report.capexSen).toBe(60_000);
    expect(reconcileReport(report).ok).toBe(true);
    expect(expectFail(buyUpgrade(settle(r.state).state, 'pastry_display')).error).toBe('WRONG_PHASE');
  });

  it('rejects owned, locked and unaffordable upgrades', () => {
    const s = expectOk(buyUpgrade(newGame(), 'signage')).state;
    expect(expectFail(buyUpgrade(s, 'signage')).error).toBe('ALREADY_OWNED');
    expect(expectFail(buyUpgrade(newGame(), 'pos_system')).error).toBe('LOCKED');
    expect(expectFail(buyUpgrade({ ...newGame(), cashSen: 100 }, 'signage')).error).toBe('INSUFFICIENT_FUNDS');
  });

  it('supplier contract lowers unit costs', () => {
    // 40 + 30 + 30 XP = level 3.
    const s = {
      ...newGame(),
      completedObjectives: [
        { id: 'cash_25000' as const, day: 1 },
        { id: 'revenue_1200' as const, day: 1 },
        { id: 'rep_90' as const, day: 1 },
      ],
    };
    const r = expectOk(buyUpgrade(s, 'supplier_contract'));
    expect(r.state.products.latte.unitCostSen).toBe(198);
  });
});

describe('bankruptcy', () => {
  it('ends the game after three consecutive days with negative cash', () => {
    let s = { ...createNewGame(TEST_SEED), cashSen: -50_000, dayStart: { cashSen: -50_000, inventorySen: 0 } };
    for (let i = 0; i < 3; i++) {
      s = settle(s).state;
      if (i < 2) {
        expect(s.status).toBe('active');
        s = expectOk(startNextDay(s, s.day)).state;
      }
    }
    expect(s.status).toBe('bankrupt');
    expect(expectFail(startNextDay(s, s.day)).error).toBe('GAME_OVER');
  });
});

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
import { recipeCostToday } from '../economy';
import { INGREDIENT_IDS, PRODUCT_IDS, type GameState } from '../types';
import { expectFail, expectOk, newGame, playDays, purchaseLines, settle, soldOf, stockAll, TEST_SEED, withEvent } from './helpers';

describe('new game', () => {
  it('starts with RM5,000, reputation 50, one barista and five products', () => {
    const s = newGame();
    expect(s.cashSen).toBe(STARTING_CASH_SEN);
    expect(s.reputation).toBe(50);
    expect(s.staff).toHaveLength(1);
    expect(s.staff[0]?.role).toBe('barista');
    expect(Object.keys(s.products)).toHaveLength(5);
    expect(s.products.kopi_o).toEqual({ id: 'kopi_o', priceSen: 350, enabled: true });
    expect(s.products.americano).toMatchObject({ priceSen: 500 });
    expect(s.products.latte).toMatchObject({ priceSen: 700 });
    expect(s.products.teh_ais).toMatchObject({ priceSen: 350 });
    expect(s.products.croissant).toMatchObject({ priceSen: 550 });
    expect(s.ingredients).toEqual({
      kopi: { id: 'kopi', unitCostSen: 80, stock: 0, stockValueSen: 0 },
      susu: { id: 'susu', unitCostSen: 70, stock: 0, stockValueSen: 0 },
      teh: { id: 'teh', unitCostSen: 50, stock: 0, stockValueSen: 0 },
      pastri: { id: 'pastri', unitCostSen: 200, stock: 0, stockValueSen: 0 },
    });
    expect(s.day).toBe(1);
    expect(s.phase).toBe('prep');
  });
});

describe('stock purchasing', () => {
  it('reduces cash immediately and records a transaction', () => {
    const r = expectOk(purchaseStock(newGame(), 'susu', 20));
    expect(r.state.cashSen).toBe(STARTING_CASH_SEN - 1_400);
    expect(r.state.ingredients.susu.stock).toBe(20);
    expect(r.state.ingredients.susu.stockValueSen).toBe(1_400);
    expect(r.state.dayTransactions).toEqual([
      expect.objectContaining({ type: 'stock_purchase', amountSen: -1_400, ingredientId: 'susu', quantity: 20, label: 'Beli Susu segar ×20' }),
    ]);
  });

  it('rejects purchases the café cannot afford and leaves state unchanged', () => {
    const poor = { ...newGame(), cashSen: 1_000 };
    const r = expectFail(purchaseStock(poor, 'pastri', 10)); // RM20 needed
    expect(r.error).toBe('INSUFFICIENT_FUNDS');
    expect(r.message).toContain('Tunai tidak mencukupi');
    expect(poor.ingredients.pastri.stock).toBe(0);
  });

  it('allows spending exactly all cash', () => {
    const s = { ...newGame(), cashSen: 2_000 };
    const r = expectOk(purchaseStock(s, 'pastri', 10));
    expect(r.state.cashSen).toBe(0);
  });

  it('is atomic for batch purchases', () => {
    const s = { ...newGame(), cashSen: 2_500 };
    const r = expectFail(
      purchaseStockBatch(s, [
        { ingredientId: 'kopi', quantity: 10 }, // RM8
        { ingredientId: 'pastri', quantity: 10 }, // RM20 -> total RM28 > RM25
      ]),
    );
    expect(r.error).toBe('INSUFFICIENT_FUNDS');
    expect(s.ingredients.kopi.stock).toBe(0);
  });

  it('rejects invalid quantities and unknown ingredients', () => {
    const s = newGame();
    expect(expectFail(purchaseStock(s, 'susu', 0)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'susu', -5)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'susu', 2.5)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'susu', 501)).error).toBe('INVALID_QUANTITY');
    expect(expectFail(purchaseStock(s, 'latte' as unknown as 'susu', 5)).error).toBe('UNKNOWN_ITEM');
  });

  it('enforces storage capacity, over a whole batch too', () => {
    const rich = { ...newGame(), cashSen: 10_000_000 };
    let s = rich;
    for (let i = 0; i < 9; i++) s = expectOk(purchaseStock(s, 'teh', 500)).state;
    s = expectOk(purchaseStock(s, 'teh', 499)).state;
    expect(s.ingredients.teh.stock).toBe(4_999);
    expect(expectFail(purchaseStock(s, 'teh', 2)).error).toBe('STORAGE_FULL');
    const batch = Array.from({ length: 11 }, () => ({ ingredientId: 'kopi' as const, quantity: 500 }));
    expect(expectFail(purchaseStockBatch(rich, batch)).error).toBe('STORAGE_FULL');
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
    // Pastry no product on the menu uses is kept (perishables still spoil overnight).
    const pastry = report.ingredients?.find((l) => l.ingredientId === 'pastri');
    expect(pastry?.used).toBe(0);
    expect(state.ingredients.pastri.stock).toBe(60 - (pastry?.spoiled ?? 0));
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
    const s = expectOk(purchaseStockBatch(newGame(), purchaseLines({ kopi: 45, susu: 45, teh: 45, pastri: 45 }))).state; // no bulk discount
    const { report, state } = settle(s);
    const revenue = sumSen(report.products.map((l) => l.sold * l.salePriceSen));
    expect(report.revenueSen).toBe(revenue);
    expect(report.revenueSen).toBeGreaterThan(0);
    // Every ingredient bought at its list price, so COGS = units sold × recipe cost.
    const cogs = sumSen(report.products.map((l) => l.sold * recipeCostToday(s, l.productId).unitCostSen));
    expect(report.cogsSen).toBe(cogs);
    expect(sumSen(report.ingredients!.map((l) => l.usedValueSen))).toBe(cogs);
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
    const s = expectOk(purchaseStock(newGame(), 'kopi', 400)).state;
    const { report, state } = settle(s);
    const shots = soldOf(report, 'kopi_o') + 2 * soldOf(report, 'americano');
    expect(shots).toBeGreaterThan(0);
    expect(shots).toBeLessThan(400);
    // 8% bulk discount: RM294.40 for 400 measures (73.6 sen each, taken at weighted-average cost).
    expect(report.stockPurchasesSen).toBe(29_440);
    expect(report.cogsSen).toBe(29_440 - state.ingredients.kopi.stockValueSen);
    expect(Math.abs(report.cogsSen - shots * 73.6)).toBeLessThanOrEqual(shots);
    expect(report.ingredients?.find((l) => l.ingredientId === 'kopi')).toMatchObject({ purchased: 400, used: shots, closingStock: 400 - shots });
    expect(state.ingredients.kopi.stock).toBe(400 - shots);
    expect(report.closingInventorySen).toBe(state.ingredients.kopi.stockValueSen);
  });

  it('shares ingredients between products: latte and teh ais both use milk', () => {
    const s = expectOk(purchaseStockBatch(newGame(), purchaseLines({ kopi: 200, teh: 200, susu: 20 }))).state;
    const { report, state } = settle(s);
    const milk = 2 * soldOf(report, 'latte') + soldOf(report, 'teh_ais');
    expect(milk).toBeLessThanOrEqual(20);
    expect(milk).toBeGreaterThanOrEqual(19); // runs out (a latte needs two)
    expect(state.ingredients.susu.stock).toBe(20 - milk - (report.ingredients?.find((l) => l.ingredientId === 'susu')?.spoiled ?? 0));
    expect(report.timeline.some((t) => /habis — susu segar tidak cukup/.test(t.text))).toBe(true);
    expect(report.products.find((l) => l.productId === 'latte')?.unmetStockout).toBeGreaterThan(0);
  });

  it('keeps cash balance equal to opening cash plus every transaction', () => {
    const s = stockAll(newGame());
    const { report } = settle(s);
    expect(report.openingCashSen).toBe(STARTING_CASH_SEN);
    expect(report.closingCashSen).toBe(STARTING_CASH_SEN + sumSen(report.transactions.map((t) => t.amountSen)));
  });

  it('writes off spoiled perishables as an expense, not COGS', () => {
    const s = expectOk(purchaseStockBatch(newGame(), purchaseLines({ kopi: 200, pastri: 200 }))).state;
    const { report, state } = settle(s);
    const line = report.ingredients?.find((l) => l.ingredientId === 'pastri');
    expect(line?.spoiled).toBe(Math.floor((200 - soldOf(report, 'croissant')) * 0.4));
    expect(line?.used).toBe(soldOf(report, 'croissant'));
    expect(report.expenses.spoilageSen).toBe(line?.spoiledValueSen);
    expect(report.ingredients?.find((l) => l.ingredientId === 'kopi')?.spoiled).toBe(0); // beans keep
    expect(state.ingredients.pastri.stock).toBe(200 - (line?.used ?? 0) - (line?.spoiled ?? 0));
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
      for (const id of INGREDIENT_IDS) {
        expect(state.ingredients[id].stock).toBeGreaterThanOrEqual(0);
        expect(state.ingredients[id].stockValueSen).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(state.ingredients[id].stockValueSen)).toBe(true);
      }
      expect(Number.isInteger(state.cashSen)).toBe(true);
    }
  });

  it('never sells more than is in stock (no negative inventory)', () => {
    let s = newGame();
    s = expectOk(purchaseStock(s, 'kopi', 3)).state;
    s = expectOk(purchaseStock(s, 'susu', 3)).state;
    const { report, state } = settle(s);
    expect(soldOf(report, 'kopi_o') + 2 * soldOf(report, 'americano') + soldOf(report, 'latte')).toBeLessThanOrEqual(3);
    expect(2 * soldOf(report, 'latte')).toBeLessThanOrEqual(3);
    expect(soldOf(report, 'teh_ais')).toBe(0);
    expect(soldOf(report, 'croissant')).toBe(0);
    for (const id of INGREDIENT_IDS) expect(state.ingredients[id].stock).toBeGreaterThanOrEqual(0);
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
    expect(expectFail(purchaseStock(state, 'susu', 1)).error).toBe('WRONG_PHASE');
    expect(expectFail(setPrice(state, 'latte', 800)).error).toBe('WRONG_PHASE');
    const next = expectOk(startNextDay(state, 1)).state;
    expect(next.day).toBe(2);
    expect(next.phase).toBe('prep');
    expect(next.dayStart.cashSen).toBe(state.cashSen);
    expect(expectFail(startNextDay(next, 1)).error).toBe('STALE_DAY');
    expect(expectOk(purchaseStock(next, 'susu', 1)).state.ingredients.susu.stock).toBeGreaterThan(0);
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
    const broke = { ...newGame(), cashSen: -5_000, dayStart: { cashSen: -5_000, inventorySen: 0, debtSen: 0, assetsSen: 0 } };
    const discounted = expectOk(setPromotion(broke, 'discount10')).state;
    expect(expectFail(setPromotion(broke, 'social')).error).toBe('INSUFFICIENT_FUNDS');
    const plain = settle(stockAll({ ...broke, cashSen: 50_000, dayStart: { cashSen: 50_000, inventorySen: 0, debtSen: 0, assetsSen: 0 } }, 10));
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
        dayStart: { cashSen: 5_000_000, inventorySen: 0, debtSen: 0, assetsSen: 0, staffNames: ['Aiman'] },
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
    expect(r.state.ingredients.susu.unitCostSen).toBe(63);
    expect(r.state.ingredients.pastri.unitCostSen).toBe(180);
  });
});

describe('bankruptcy', () => {
  it('ends the game after three consecutive days with negative cash', () => {
    let s = { ...createNewGame(TEST_SEED), cashSen: -50_000, dayStart: { cashSen: -50_000, inventorySen: 0, debtSen: 0, assetsSen: 0 } };
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

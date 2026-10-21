import { describe, expect, it } from 'vitest';
import { LOAN_OFFER_ORDER, LOAN_OFFERS } from '../data/loans';
import { projectedFixedCosts } from '../economy';
import { openCafe, repayLoan, startNextDay, takeLoan } from '../engine';
import { installment, offerTotalInterest, settlementQuote } from '../loans';
import { evaluateObjectives, isObjectiveComplete } from '../objectives';
import { reconcileReport } from '../reports';
import { migrateSave } from '../save';
import { activeLoanView, loanOfferViews } from '../selectors';
import { sumSen } from '../money';
import type { DayReport, GameState } from '../types';
import { validateGameState } from '../validate';
import { expectFail, expectOk, newGame, playDays, settle, stockAll } from './helpers';

/** Enough completed objectives for café level 2 (45 XP). */
function atLevel2(state: GameState): GameState {
  return {
    ...state,
    completedObjectives: (['first_day', 'first_profit', 'serve_100', 'no_stockout'] as const).map((id) => ({ id, day: 1 })),
  };
}

function nextDay(state: GameState): GameState {
  return expectOk(startNextDay(state, state.day)).state;
}

function expectReconciled(report: DayReport): void {
  const rec = reconcileReport(report);
  expect(rec.checks.filter((c) => !c.ok)).toEqual([]);
}

describe('loan schedule', () => {
  it('uses flat interest and installments that add up exactly', () => {
    expect(offerTotalInterest('mikro')).toBe(10_000);
    expect(offerTotalInterest('perniagaan')).toBe(40_000);
    expect(offerTotalInterest('pengembangan')).toBe(144_000);
    for (const id of LOAN_OFFER_ORDER) {
      const def = LOAN_OFFERS[id];
      const loan = { principalSen: def.principalSen, totalInterestSen: offerTotalInterest(id), termDays: def.termDays };
      const all = Array.from({ length: def.termDays }, (_, i) => installment(loan, i + 1));
      expect(sumSen(all.map((x) => x.principalSen))).toBe(def.principalSen);
      expect(sumSen(all.map((x) => x.interestSen))).toBe(loan.totalInterestSen);
      for (const x of all) {
        expect(Number.isInteger(x.principalSen) && x.principalSen > 0).toBe(true);
        expect(Number.isInteger(x.interestSen) && x.interestSen >= 0).toBe(true);
      }
    }
  });

  it('absorbs rounding in the last installment', () => {
    const loan = { principalSen: 1_000, totalInterestSen: 100, termDays: 3 };
    expect([1, 2, 3].map((n) => installment(loan, n).principalSen)).toEqual([333, 333, 334]);
    expect([1, 2, 3].map((n) => installment(loan, n).interestSen)).toEqual([33, 33, 34]);
  });
});

describe('taking a loan', () => {
  it('adds the cash at once as financing, not revenue, and charges nothing on the first close', () => {
    const s0 = stockAll(newGame(), 30);
    const r = expectOk(takeLoan(s0, 'mikro'));
    expect(r.state.cashSen).toBe(s0.cashSen + 200_000);
    expect(r.state.loan).toMatchObject({ offerId: 'mikro', principalSen: 200_000, totalInterestSen: 10_000, termDays: 10, takenDay: 1, paymentsMade: 0 });
    expect(r.state.dayTransactions.at(-1)).toMatchObject({ type: 'loan_proceeds', amountSen: 200_000 });

    const { state, report } = settle(r.state);
    expect(report.loanProceedsSen).toBe(200_000);
    expect(report.loanPrincipalRepaidSen).toBe(0);
    expect(report.expenses.interestSen).toBe(0);
    expect(report.openingDebtSen).toBe(0);
    expect(report.closingDebtSen).toBe(200_000);
    expect(report.revenueSen).toBe(sumSen(report.products.map((l) => l.revenueSen)));
    expectReconciled(report);
    expect(state.loan?.paymentsMade).toBe(0);
    expect(nextDay(state).dayStart.debtSen).toBe(200_000);
  });

  it('is limited to one loan at a time, by café level, and to preparation', () => {
    const s = newGame();
    expect(expectFail(takeLoan(s, 'perniagaan')).error).toBe('LOCKED');
    expect(expectOk(takeLoan(atLevel2(s), 'perniagaan')).state.loan?.principalSen).toBe(500_000);
    const withLoan = expectOk(takeLoan(s, 'mikro')).state;
    expect(expectFail(takeLoan(withLoan, 'mikro')).error).toBe('LOAN_ACTIVE');
    const closed = settle(stockAll(s, 10)).state;
    expect(expectFail(takeLoan(closed, 'mikro')).error).toBe('WRONG_PHASE');
    expect(expectFail(takeLoan(s, 'nope' as never)).error).toBe('UNKNOWN_ITEM');
  });

  it('shows offers with their real repayment terms', () => {
    const views = loanOfferViews(newGame());
    expect(views.map((v) => [v.id, v.locked])).toEqual([
      ['mikro', false],
      ['perniagaan', true],
      ['pengembangan', true],
    ]);
    expect(views[0]).toMatchObject({ totalRepaySen: 210_000, dailyInstallmentSen: 21_000 });
  });
});

describe('repaying on schedule', () => {
  it('charges one installment per close from the next day until the loan is repaid', () => {
    const start = expectOk(takeLoan(newGame(), 'mikro')).state;
    const { state, reports } = playDays(start, 11);
    expect(reports).toHaveLength(11);
    expect(state.loan).toBeNull();
    expect(state.stats.loansRepaid).toBe(1);
    expect(isObjectiveComplete(state, 'repay_loan')).toBe(true);
    expect(reports[10]?.objectivesCompleted).toContain('repay_loan');

    expect(reports[0]?.expenses.interestSen).toBe(0);
    expect(reports.slice(1).every((r) => r.expenses.interestSen === 1_000 && r.loanPrincipalRepaidSen === 20_000)).toBe(true);
    expect(sumSen(reports.map((r) => r.expenses.interestSen))).toBe(10_000);
    expect(sumSen(reports.map((r) => r.loanPrincipalRepaidSen))).toBe(200_000);
    expect(reports[10]?.closingDebtSen).toBe(0);
    for (let i = 1; i < reports.length; i++) expect(reports[i]?.openingDebtSen).toBe(reports[i - 1]?.closingDebtSen);
    reports.forEach(expectReconciled);
    // Interest is an expense (in "other"); principal repayments are not.
    const r2 = reports[1] as DayReport;
    expect(r2.expenses.otherSen).toBe(r2.expenses.hiringSen + r2.expenses.eventCostSen + r2.expenses.spoilageSen + 1_000);
  });

  it('charges the installment even when cash runs out, counting toward bankruptcy', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state);
    s = { ...s, cashSen: 0, dayStart: { ...s.dayStart, cashSen: 0 } };
    const { state, report } = settle(s);
    expect(report.loanPrincipalRepaidSen).toBe(20_000);
    expect(report.expenses.interestSen).toBe(1_000);
    expect(state.cashSen).toBeLessThan(0);
    expect(state.stats.negativeCashStreak).toBe(1);
    expectReconciled(report);
  });

  it('includes the installment due today in the projected fixed costs', () => {
    const s = expectOk(takeLoan(newGame(), 'mikro')).state;
    expect(projectedFixedCosts(s).loanSen).toBe(0);
    const tomorrow = nextDay(settle(s).state);
    const fixed = projectedFixedCosts(tomorrow);
    expect(fixed.loanSen).toBe(21_000);
    expect(fixed.totalSen).toBe(fixed.wagesSen + fixed.rentSen + fixed.utilitiesBaseSen + 21_000);
    expect(activeLoanView(tomorrow)).toMatchObject({ nextChargedToday: true, nextInstallment: { totalSen: 21_000 } });
  });

  it('after a close, describes the next installment and repayment as tomorrow’s', () => {
    // Closed on the day the loan was taken: tomorrow's repayment is no longer a free cancellation.
    const closedDay1 = settle(expectOk(takeLoan(newGame(), 'mikro')).state).state;
    expect(activeLoanView(closedDay1)).toMatchObject({
      actionTomorrow: true,
      nextChargedToday: false,
      nextInstallment: { number: 1 },
      settlement: { cancellation: false, principalSen: 200_000, interestSen: 1_000, totalSen: 201_000 },
    });
    // The quote shown tonight is exactly what repaying costs in tomorrow's preparation.
    const day2 = nextDay(closedDay1);
    const repaid = expectOk(repayLoan(day2));
    expect(day2.cashSen - repaid.state.cashSen).toBe(201_000);

    // Closed on a later day: that day's installment is already paid; the next is tomorrow's.
    const closedDay2 = settle(day2).state;
    expect(closedDay2.loan?.paymentsMade).toBe(1);
    expect(activeLoanView(closedDay2)).toMatchObject({ actionTomorrow: true, nextChargedToday: false, nextInstallment: { number: 2 } });
    expect(activeLoanView(nextDay(closedDay2))).toMatchObject({ actionTomorrow: false, nextChargedToday: true, nextInstallment: { number: 2 } });
  });
});

describe('after bankruptcy', () => {
  it('shows the loan as final: nothing more is charged or repayable', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state);
    const bankrupt = { ...settle(s).state, status: 'bankrupt' as const };
    expect(activeLoanView(bankrupt)).toMatchObject({ gameOver: true, actionTomorrow: false, nextChargedToday: false, canSettle: false });
    expect(expectFail(repayLoan(bankrupt)).error).toBe('GAME_OVER');
  });
});

describe('repaying early', () => {
  it('cancels for free on the day the loan was taken, without counting as repaid', () => {
    const s = newGame();
    const taken = expectOk(takeLoan(s, 'mikro')).state;
    expect(settlementQuote(taken.loan!, taken.day)).toMatchObject({ principalSen: 200_000, interestSen: 0, cancellation: true });
    const r = expectOk(repayLoan(taken));
    expect(r.state.cashSen).toBe(s.cashSen);
    expect(r.state.loan).toBeNull();
    expect(r.state.stats.loansRepaid).toBe(0);
    expect(isObjectiveComplete(r.state, 'repay_loan')).toBe(false);
    const { report } = settle(stockAll(r.state, 10));
    expect(report.loanProceedsSen).toBe(200_000);
    expect(report.loanPrincipalRepaidSen).toBe(200_000);
    expect(report.closingDebtSen).toBe(0);
    expectReconciled(report);
  });

  it('pays the remaining principal plus the interest of the day already traded, then waives the rest', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state); // day 2: one day traded, nothing paid yet
    s = nextDay(settle(s).state); // day 3: installment 1 paid at the close of day 2
    expect(s.loan?.paymentsMade).toBe(1);
    const quote = settlementQuote(s.loan!, s.day);
    expect(quote).toEqual({ principalSen: 180_000, interestSen: 1_000, totalSen: 181_000, cancellation: false });

    const r = expectOk(repayLoan(s));
    expect(r.state.cashSen).toBe(s.cashSen - 181_000);
    expect(r.state.loan).toBeNull();
    expect(r.state.stats.loansRepaid).toBe(1);
    expect(r.newObjectives).toContain('repay_loan');
    const { report } = settle(r.state);
    expect(report.openingDebtSen).toBe(180_000);
    expect(report.loanPrincipalRepaidSen).toBe(180_000);
    expect(report.expenses.interestSen).toBe(1_000);
    expect(report.closingDebtSen).toBe(0);
    expectReconciled(report);
  });

  it('refuses when cash cannot cover the settlement', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state);
    const poor = { ...s, cashSen: 1_000 };
    expect(expectFail(repayLoan(poor)).error).toBe('INSUFFICIENT_FUNDS');
    expect(activeLoanView(poor)?.canSettle).toBe(false);
    expect(expectFail(repayLoan(newGame())).error).toBe('NO_LOAN');
  });
});

describe('borrowed money and objectives', () => {
  it('does not count loan money toward savings objectives', () => {
    const rich = { ...newGame(), cashSen: 700_000 };
    const borrowed = expectOk(takeLoan(rich, 'mikro')).state;
    expect(borrowed.cashSen).toBe(900_000);
    expect(isObjectiveComplete(borrowed, 'cash_8000')).toBe(false);
    expect(isObjectiveComplete(evaluateObjectives({ ...rich, cashSen: 900_000 }).state, 'cash_8000')).toBe(true);
  });
});

describe('saves with loans', () => {
  /** Remove every field schema v3 added, giving the shape a v2 build wrote. */
  function asV2Save(game: GameState): unknown {
    const g = structuredClone(game) as unknown as Record<string, unknown> & {
      dayStart: Record<string, unknown>;
      stats: Record<string, unknown>;
      history: (Record<string, unknown> & { expenses: Record<string, unknown> })[];
    };
    g.schemaVersion = 2;
    delete g.loan;
    delete g.dayStart.debtSen;
    delete g.stats.loansRepaid;
    for (const r of g.history) {
      delete r.loanProceedsSen;
      delete r.loanPrincipalRepaidSen;
      delete r.openingDebtSen;
      delete r.closingDebtSen;
      delete r.expenses.interestSen;
    }
    return { schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z', game: g };
  }

  it('migrates a v2 save to v3 with no loan and zero debt', () => {
    const { state } = playDays(newGame(), 4);
    const migrated = migrateSave(asV2Save(state));
    expect(migrated).toMatchObject({ ok: true, fromVersion: 2 });
    if (!migrated.ok) return;
    const validated = validateGameState(migrated.game);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.state).toEqual(state);
    expect(validated.state.history.every((r) => reconcileReport(r).ok)).toBe(true);
  });

  it('a v2 save without the loan fields does not validate as v3', () => {
    const v2 = asV2Save(newGame()) as { game: Record<string, unknown> };
    expect(validateGameState({ ...v2.game, schemaVersion: 3 }).ok).toBe(false);
  });

  it('validates an active loan and rejects impossible ones', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state);
    s = settle(s).state;
    expect(validateGameState(structuredClone(s)).ok).toBe(true);
    const loan = s.loan!;
    for (const bad of [
      { ...loan, offerId: 'gold' },
      { ...loan, paymentsMade: loan.termDays },
      { ...loan, principalRepaidSen: loan.principalSen },
      { ...loan, interestPaidSen: -1 },
      { ...loan, takenDay: s.day + 1 },
    ]) {
      expect(validateGameState({ ...structuredClone(s), loan: bad }).ok).toBe(false);
    }
    expect(validateGameState({ ...structuredClone(s), dayStart: { ...s.dayStart, debtSen: -1 } }).ok).toBe(false);
  });

  it('cannot settle a day twice even with loan activity', () => {
    const s = expectOk(takeLoan(stockAll(newGame(), 10), 'mikro')).state;
    const once = settle(s).state;
    expect(expectFail(openCafe(once, s.day)).error).toBe('ALREADY_SETTLED');
  });
});

describe('loan validation invariants', () => {
  it('accepts every state reached by playing with loans', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    for (let i = 0; i < 12; i++) {
      expect(validateGameState(structuredClone(s)).ok).toBe(true);
      s = settle(stockAll(s, 10)).state;
      expect(validateGameState(structuredClone(s)).ok).toBe(true);
      s = nextDay(s);
      if (!s.loan && i === 10) s = expectOk(takeLoan(s, 'mikro')).state; // a second loan, taken later
    }
    const early = expectOk(repayLoan(nextDay(settle(s).state))).state;
    expect(validateGameState(structuredClone(early)).ok).toBe(true);
  });

  it('rejects loans whose paid amounts or payments contradict the schedule', () => {
    let s = expectOk(takeLoan(newGame(), 'mikro')).state;
    s = nextDay(settle(s).state);
    s = nextDay(settle(s).state); // day 3 prep, one installment paid
    const loan = s.loan!;
    expect(validateGameState(structuredClone(s)).ok).toBe(true);
    for (const bad of [
      { ...loan, interestPaidSen: loan.totalInterestSen },
      { ...loan, principalRepaidSen: 199_999 },
      { ...loan, paymentsMade: 0 },
      { ...loan, paymentsMade: 2, principalRepaidSen: 40_000, interestPaidSen: 2_000 },
    ]) {
      expect(validateGameState({ ...structuredClone(s), loan: bad }).ok).toBe(false);
    }
    expect(validateGameState({ ...structuredClone(s), dayStart: { ...s.dayStart, debtSen: 200_000 } }).ok).toBe(false);
  });
});

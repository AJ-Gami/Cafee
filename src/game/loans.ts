/**
 * Bank loans: flat interest repaid in equal daily installments at each close,
 * starting the day after the loan is taken. Principal repayments are financing
 * cash flows; only the interest part is an expense.
 */
import { LOAN_OFFERS } from './data/loans';
import { applyBps } from './money';
import type { ActiveLoan, LoanOfferId } from './types';

export interface Installment {
  /** 1-based installment number. */
  number: number;
  principalSen: number;
  interestSen: number;
  totalSen: number;
}

export function offerTotalInterest(offerId: LoanOfferId): number {
  const def = LOAN_OFFERS[offerId];
  return applyBps(def.principalSen, def.flatRateBps);
}

export function newLoan(offerId: LoanOfferId, day: number): ActiveLoan {
  const def = LOAN_OFFERS[offerId];
  return {
    offerId,
    principalSen: def.principalSen,
    totalInterestSen: offerTotalInterest(offerId),
    termDays: def.termDays,
    takenDay: day,
    paymentsMade: 0,
    principalRepaidSen: 0,
    interestPaidSen: 0,
  };
}

/** Installment `number` (1..termDays). The last one absorbs rounding so totals are exact. */
export function installment(loan: Pick<ActiveLoan, 'principalSen' | 'totalInterestSen' | 'termDays'>, number: number): Installment {
  const basePrincipal = Math.floor(loan.principalSen / loan.termDays);
  const baseInterest = Math.floor(loan.totalInterestSen / loan.termDays);
  const last = number >= loan.termDays;
  const principalSen = last ? loan.principalSen - basePrincipal * (loan.termDays - 1) : basePrincipal;
  const interestSen = last ? loan.totalInterestSen - baseInterest * (loan.termDays - 1) : baseInterest;
  return { number, principalSen, interestSen, totalSen: principalSen + interestSen };
}

export function remainingPrincipal(loan: ActiveLoan | null): number {
  return loan ? loan.principalSen - loan.principalRepaidSen : 0;
}

/** The installment charged at the close of `day`, or null if none is due. */
export function installmentDue(loan: ActiveLoan | null, day: number): Installment | null {
  if (!loan || day <= loan.takenDay || loan.paymentsMade >= loan.termDays) return null;
  return installment(loan, loan.paymentsMade + 1);
}

/** Apply a paid installment. Returns null once the loan is fully repaid. */
export function afterInstallment(loan: ActiveLoan, paid: Installment): ActiveLoan | null {
  const next: ActiveLoan = {
    ...loan,
    paymentsMade: loan.paymentsMade + 1,
    principalRepaidSen: loan.principalRepaidSen + paid.principalSen,
    interestPaidSen: loan.interestPaidSen + paid.interestSen,
  };
  return next.paymentsMade >= next.termDays ? null : next;
}

export interface SettlementQuote {
  principalSen: number;
  /** Interest for the day already traded on the loan but not yet charged (0 on the day it was taken). */
  interestSen: number;
  totalSen: number;
  /** True when the loan is repaid on the day it was taken: a cancellation, not a repaid loan. */
  cancellation: boolean;
}

/**
 * Paying the loan off during preparation of `day`. Each installment is charged at a close, so by
 * the morning after the loan was taken one day of trading on it is always still unpaid; settling
 * early charges that day's interest and waives the rest.
 */
export function settlementQuote(loan: ActiveLoan, day: number): SettlementQuote {
  const principalSen = remainingPrincipal(loan);
  const cancellation = day <= loan.takenDay;
  const interestSen = cancellation ? 0 : installment(loan, loan.paymentsMade + 1).interestSen;
  return { principalSen, interestSen, totalSen: principalSen + interestSen, cancellation };
}

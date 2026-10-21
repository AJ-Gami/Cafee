import type { LoanOfferId } from '../types';

export interface LoanOfferDef {
  id: LoanOfferId;
  name: string;
  description: string;
  principalSen: number;
  termDays: number;
  /** Flat interest on the principal for the whole term, in basis points. */
  flatRateBps: number;
  minLevel: number;
}

/** Fictional bank loan offers for game balancing — not real financing terms. */
export const LOAN_OFFERS: Record<LoanOfferId, LoanOfferDef> = {
  mikro: {
    id: 'mikro',
    name: 'Pinjaman Mikro',
    description: 'Modal kecil untuk stok atau naik taraf pertama.',
    principalSen: 200_000,
    termDays: 10,
    flatRateBps: 500,
    minLevel: 1,
  },
  perniagaan: {
    id: 'perniagaan',
    name: 'Pinjaman Perniagaan Kecil',
    description: 'Modal sederhana untuk mengembangkan pasukan dan peralatan.',
    principalSen: 500_000,
    termDays: 20,
    flatRateBps: 800,
    minLevel: 2,
  },
  pengembangan: {
    id: 'pengembangan',
    name: 'Pinjaman Pengembangan',
    description: 'Modal besar untuk naik taraf utama. Bayaran harian yang tinggi.',
    principalSen: 1_200_000,
    termDays: 30,
    flatRateBps: 1_200,
    minLevel: 3,
  },
};

export const LOAN_OFFER_ORDER: readonly LoanOfferId[] = ['mikro', 'perniagaan', 'pengembangan'];

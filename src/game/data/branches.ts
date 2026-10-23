import type { BranchLocationId, ProductId } from '../types';

export interface BranchLocationDef {
  id: BranchLocationId;
  name: string;
  shortName: string;
  description: string;
  /** Fit-out cost, paid when the branch opens (a fixed asset). */
  setupCostSen: number;
  rentSen: number;
  /** Utilities before the per-customer part. */
  utilitiesBaseSen: number;
  /** Footfall relative to the main café at the same reputation (busier spots than its street). */
  footfallMultiplier: number;
  /** Isnin..Ahad footfall factors (they replace the main café's weekday pattern). */
  weekdayFactors: readonly number[];
  /** Footfall on a public holiday. */
  holidayFactor: number;
  /** Added to the chance a customer buys at a fair price (negative: more price-sensitive). */
  conversionBonus: number;
  productDemand: Partial<Record<ProductId, number>>;
  /** Short notes for the location card. */
  traits: string[];
}

// Fictional game-balancing values.
export const BRANCH_LOCATIONS: Record<BranchLocationId, BranchLocationDef> = {
  kampus: {
    id: 'kampus',
    name: 'Kawasan universiti',
    shortName: 'Kampus',
    description: 'Pelajar datang beramai-ramai pada hari kuliah, tetapi sensitif harga dan sunyi pada hujung minggu.',
    setupCostSen: 600_000,
    rentSen: 9_000,
    utilitiesBaseSen: 2_000,
    footfallMultiplier: 1.25,
    weekdayFactors: [1.2, 1.25, 1.25, 1.2, 1.0, 0.55, 0.5],
    holidayFactor: 0.6,
    conversionBonus: -0.05,
    productDemand: { teh_ais: 1.3, kopi_o: 1.2, latte: 0.8, croissant: 0.8 },
    traits: ['Sibuk Isnin–Jumaat', 'Sewa RM90 sehari', 'Teh Ais & Kopi O laris', 'Sensitif harga'],
  },
  pejabat: {
    id: 'pejabat',
    name: 'Menara pejabat',
    shortName: 'Pejabat',
    description: 'Pekerja pejabat membeli kopi setiap hari bekerja dan kurang kisah harga. Hampir kosong pada hujung minggu.',
    setupCostSen: 800_000,
    rentSen: 12_000,
    utilitiesBaseSen: 2_500,
    footfallMultiplier: 1.3,
    weekdayFactors: [1.3, 1.3, 1.3, 1.3, 1.15, 0.35, 0.25],
    holidayFactor: 0.3,
    conversionBonus: 0.03,
    productDemand: { americano: 1.4, latte: 1.2, teh_ais: 0.8 },
    traits: ['Sangat sibuk hari bekerja', 'Sewa RM120 sehari', 'Americano & Latte laris', 'Kurang sensitif harga'],
  },
  mall: {
    id: 'mall',
    name: 'Pusat beli-belah',
    shortName: 'Pusat beli-belah',
    description: 'Keluarga dan pengunjung memenuhi kafe pada hujung minggu dan cuti umum. Sewa paling mahal.',
    setupCostSen: 1_000_000,
    rentSen: 16_000,
    utilitiesBaseSen: 3_000,
    footfallMultiplier: 1.45,
    weekdayFactors: [0.8, 0.8, 0.85, 0.9, 1.1, 1.65, 1.55],
    holidayFactor: 1.4,
    conversionBonus: 0,
    productDemand: { latte: 1.2, croissant: 1.4 },
    traits: ['Sibuk hujung minggu & cuti', 'Sewa RM160 sehari', 'Latte & Croissant laris'],
  },
};

export const BRANCH_LOCATION_ORDER: readonly BranchLocationId[] = ['kampus', 'pejabat', 'mall'];

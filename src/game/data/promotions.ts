import type { PromotionId } from '../types';

export interface PromotionDef {
  id: PromotionId;
  name: string;
  description: string;
  costSen: number;
  /** Multiplier on footfall. */
  trafficMultiplier: number;
  /** Added to buy probability. */
  conversionBonus: number;
  /** Discount applied to every menu price, in basis points. */
  discountBps: number;
  reputationDelta: number;
  minLevel: number;
}

export const PROMOTIONS: Record<PromotionId, PromotionDef> = {
  none: {
    id: 'none',
    name: 'Tiada promosi',
    description: 'Operasi biasa tanpa kos pemasaran.',
    costSen: 0,
    trafficMultiplier: 1,
    conversionBonus: 0,
    discountBps: 0,
    reputationDelta: 0,
    minLevel: 1,
  },
  social: {
    id: 'social',
    name: 'Hantaran media sosial',
    description: 'Iklan bertaja di media sosial kawasan sekitar. +12% pelanggan.',
    costSen: 3_000,
    trafficMultiplier: 1.12,
    conversionBonus: 0,
    discountBps: 0,
    reputationDelta: 0,
    minLevel: 1,
  },
  flyers: {
    id: 'flyers',
    name: 'Risalah pejabat berhampiran',
    description: 'Edar risalah di bangunan pejabat. +20% pelanggan.',
    costSen: 6_000,
    trafficMultiplier: 1.2,
    conversionBonus: 0,
    discountBps: 0,
    reputationDelta: 0,
    minLevel: 1,
  },
  discount10: {
    id: 'discount10',
    name: 'Diskaun 10% semua menu',
    description: 'Tiada kos awal, tetapi harga jualan turun 10%. +15% pelanggan, lebih ramai membeli.',
    costSen: 0,
    trafficMultiplier: 1.15,
    conversionBonus: 0.05,
    discountBps: 1_000,
    reputationDelta: 0.3,
    minLevel: 1,
  },
  influencer: {
    id: 'influencer',
    name: 'Kolaborasi pempengaruh tempatan',
    description: 'Pempengaruh makanan tempatan mempromosi kafe anda. +35% pelanggan, +reputasi.',
    costSen: 20_000,
    trafficMultiplier: 1.35,
    conversionBonus: 0,
    discountBps: 0,
    reputationDelta: 1.5,
    minLevel: 2,
  },
};

export const PROMOTION_ORDER: readonly PromotionId[] = ['none', 'social', 'flyers', 'discount10', 'influencer'];

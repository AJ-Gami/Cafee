import type { BranchUpgradeId, IngredientId } from '../types';

export interface BranchUpgradeDef {
  id: BranchUpgradeId;
  name: string;
  description: string;
  costSen: number;
  /** Multiplier on the branch's barista output. */
  capacityMultiplier?: number;
  /** Multiplier on the branch's footfall. */
  trafficMultiplier?: number;
  /** Multipliers on overnight spoilage of the branch's own stock. */
  spoilageMultiplier?: Partial<Record<IngredientId, number>>;
  effectSummary: string;
}

// Fictional game-balancing values. Each is a fixed asset of its branch.
export const BRANCH_UPGRADES: Record<BranchUpgradeId, BranchUpgradeDef> = {
  mesin: {
    id: 'mesin',
    name: 'Mesin espreso cawangan',
    description: 'Mesin dua kepala supaya barista cawangan menyiapkan lebih banyak pesanan.',
    costSen: 150_000,
    capacityMultiplier: 1.25,
    effectSummary: '+25% kapasiti barista cawangan',
  },
  papan: {
    id: 'papan',
    name: 'Papan tanda cawangan',
    description: 'Papan tanda bercahaya supaya cawangan mudah dilihat.',
    costSen: 50_000,
    trafficMultiplier: 1.1,
    effectSummary: '+10% pelanggan cawangan',
  },
  peti: {
    id: 'peti',
    name: 'Peti sejuk cawangan',
    description: 'Menyimpan susu dan pastri cawangan lebih lama.',
    costSen: 70_000,
    spoilageMultiplier: { susu: 0.4, pastri: 0.4 },
    effectSummary: '−60% pembaziran susu & pastri cawangan',
  },
};

export const BRANCH_UPGRADE_ORDER: readonly BranchUpgradeId[] = ['mesin', 'papan', 'peti'];

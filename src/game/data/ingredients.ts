import type { IngredientId } from '../types';

export interface IngredientDef {
  id: IngredientId;
  name: string;
  description: string;
  /** Starting supplier cost per unit. */
  baseCostSen: number;
  /** Fraction of the units left at closing that is thrown away (perishables). */
  spoilageRate: number;
  unitLabel: string;
}

// Fictional game-balancing values. One unit is one recipe measure.
export const INGREDIENTS: Record<IngredientId, IngredientDef> = {
  kopi: {
    id: 'kopi',
    name: 'Biji kopi',
    description: 'Dikisar setiap pagi. Satu sukatan untuk satu syot.',
    baseCostSen: 80,
    spoilageRate: 0,
    unitLabel: 'sukatan',
  },
  susu: {
    id: 'susu',
    name: 'Susu segar',
    description: 'Untuk latte dan teh ais. Cepat rosak.',
    baseCostSen: 70,
    spoilageRate: 0.05,
    unitLabel: 'sukatan',
  },
  teh: {
    id: 'teh',
    name: 'Serbuk teh',
    description: 'Teh hitam pekat untuk teh ais.',
    baseCostSen: 50,
    spoilageRate: 0,
    unitLabel: 'sukatan',
  },
  pastri: {
    id: 'pastri',
    name: 'Doh croissant',
    description: 'Dibakar setiap pagi. Yang tidak terjual tidak tahan lama.',
    baseCostSen: 200,
    spoilageRate: 0.4,
    unitLabel: 'keping',
  },
};

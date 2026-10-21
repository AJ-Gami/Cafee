import type { ProductId } from '../types';

export type ProductKind = 'hot' | 'cold' | 'food';

export interface ProductDef {
  id: ProductId;
  name: string;
  description: string;
  kind: ProductKind;
  /** Starting supplier cost per unit. */
  baseCostSen: number;
  /** Starting menu price. */
  defaultPriceSen: number;
  /** What customers consider a fair price; demand falls as price rises above it. */
  referencePriceSen: number;
  /** Relative chance this is a customer's first choice. */
  popularity: number;
  /** Price sensitivity exponent. */
  elasticity: number;
  /** Fraction of unsold units discarded at closing (perishables). */
  spoilageRate: number;
  /** Chance a drink buyer adds this item to their order (food only). */
  addOnRate: number;
  unitLabel: string;
}

// Fictional game-balancing values from the design brief.
export const PRODUCTS: Record<ProductId, ProductDef> = {
  kopi_o: {
    id: 'kopi_o',
    name: 'Kopi O',
    description: 'Kopi hitam tradisional, pekat dan wangi.',
    kind: 'hot',
    baseCostSen: 100,
    defaultPriceSen: 350,
    referencePriceSen: 350,
    popularity: 1.25,
    elasticity: 1.7,
    spoilageRate: 0,
    addOnRate: 0,
    unitLabel: 'cawan',
  },
  americano: {
    id: 'americano',
    name: 'Americano',
    description: 'Espreso dicairkan dengan air panas.',
    kind: 'hot',
    baseCostSen: 150,
    defaultPriceSen: 500,
    referencePriceSen: 500,
    popularity: 0.9,
    elasticity: 1.4,
    spoilageRate: 0,
    addOnRate: 0,
    unitLabel: 'cawan',
  },
  latte: {
    id: 'latte',
    name: 'Latte',
    description: 'Espreso dengan susu segar berbuih.',
    kind: 'hot',
    baseCostSen: 220,
    defaultPriceSen: 700,
    referencePriceSen: 700,
    popularity: 1.0,
    elasticity: 1.3,
    spoilageRate: 0.05,
    addOnRate: 0,
    unitLabel: 'cawan',
  },
  teh_ais: {
    id: 'teh_ais',
    name: 'Teh Ais',
    description: 'Teh susu sejuk, kegemaran ramai.',
    kind: 'cold',
    baseCostSen: 120,
    defaultPriceSen: 350,
    referencePriceSen: 350,
    popularity: 1.2,
    elasticity: 1.6,
    spoilageRate: 0,
    addOnRate: 0,
    unitLabel: 'gelas',
  },
  croissant: {
    id: 'croissant',
    name: 'Croissant',
    description: 'Pastri mentega rangup, dibakar setiap pagi.',
    kind: 'food',
    baseCostSen: 200,
    defaultPriceSen: 550,
    referencePriceSen: 550,
    popularity: 0.45,
    elasticity: 1.5,
    spoilageRate: 0.4,
    addOnRate: 0.22,
    unitLabel: 'keping',
  },
};

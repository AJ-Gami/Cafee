import type { ProductId, UpgradeId } from '../types';

export interface UpgradeEffects {
  trafficMultiplier?: number;
  /** Multiplier on barista output only. */
  baristaCapacityMultiplier?: number;
  /** Multiplier on total hourly capacity. */
  capacityMultiplier?: number;
  conversionBonus?: number;
  productDemand?: Partial<Record<ProductId, number>>;
  spoilageMultiplier?: Partial<Record<ProductId, number>>;
  reputationPerDay?: number;
  utilitiesSenPerDay?: number;
  staffSlots?: number;
  /** Basis-point reduction applied to every supplier unit cost. */
  supplierDiscountBps?: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  costSen: number;
  minLevel: number;
  effects: UpgradeEffects;
  effectSummary: string[];
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  espresso_machine: {
    id: 'espresso_machine',
    name: 'Mesin Espreso Dwi-Kepala',
    description: 'Dua kepala bancuhan supaya barista boleh menyiapkan lebih banyak pesanan.',
    costSen: 180_000,
    minLevel: 1,
    effects: { baristaCapacityMultiplier: 1.25 },
    effectSummary: ['+25% kapasiti barista'],
  },
  pastry_display: {
    id: 'pastry_display',
    name: 'Peti Pameran Pastri',
    description: 'Peti sejuk berkaca yang menarik mata dan memanjangkan kesegaran pastri.',
    costSen: 85_000,
    minLevel: 1,
    effects: { productDemand: { croissant: 1.35 }, spoilageMultiplier: { croissant: 0.4 } },
    effectSummary: ['+35% permintaan Croissant', '−60% pembaziran Croissant'],
  },
  signage: {
    id: 'signage',
    name: 'Papan Tanda Bercahaya',
    description: 'Papan tanda LED di hadapan kedai supaya mudah dilihat dari jalan.',
    costSen: 60_000,
    minLevel: 1,
    effects: { trafficMultiplier: 1.08 },
    effectSummary: ['+8% pelanggan'],
  },
  hygiene_system: {
    id: 'hygiene_system',
    name: 'Sistem Kebersihan Profesional',
    description: 'Sinki tambahan, jadual pembersihan dan bahan pembersih gred komersial.',
    costSen: 65_000,
    minLevel: 1,
    effects: { reputationPerDay: 0.2 },
    effectSummary: ['Lulus pemeriksaan kesihatan', '+0.2 reputasi sehari'],
  },
  cozy_interior: {
    id: 'cozy_interior',
    name: 'Hiasan Dalaman Selesa',
    description: 'Sofa, lampu hangat dan tumbuhan hijau. Pelanggan suka melepak.',
    costSen: 150_000,
    minLevel: 2,
    effects: { trafficMultiplier: 1.05, reputationPerDay: 0.4, utilitiesSenPerDay: 500 },
    effectSummary: ['+5% pelanggan', '+0.4 reputasi sehari', '+RM5 utiliti sehari'],
  },
  pos_system: {
    id: 'pos_system',
    name: 'Sistem POS & Kod QR',
    description: 'Pesanan dan bayaran QR yang pantas memendekkan barisan.',
    costSen: 90_000,
    minLevel: 2,
    effects: { capacityMultiplier: 1.1, conversionBonus: 0.03 },
    effectSummary: ['+10% kapasiti keseluruhan', '+3% kadar pembelian'],
  },
  air_cond: {
    id: 'air_cond',
    name: 'Penghawa Dingin Inverter',
    description: 'Ruang sejuk dan selesa walaupun cuaca panas terik.',
    costSen: 160_000,
    minLevel: 2,
    effects: { reputationPerDay: 0.2, utilitiesSenPerDay: 800 },
    effectSummary: ['Kebal kesan cuaca panas', '+0.2 reputasi sehari', '+RM8 utiliti sehari'],
  },
  second_counter: {
    id: 'second_counter',
    name: 'Kaunter Servis Kedua',
    description: 'Ruang kerja tambahan supaya lebih ramai staf boleh bertugas.',
    costSen: 240_000,
    minLevel: 2,
    effects: { staffSlots: 4 },
    effectSummary: ['Had staf 2 → 4 orang'],
  },
  supplier_contract: {
    id: 'supplier_contract',
    name: 'Kontrak Pembekal Borong',
    description: 'Kontrak jangka panjang dengan pembekal untuk harga kos lebih rendah.',
    costSen: 220_000,
    minLevel: 3,
    effects: { supplierDiscountBps: 1_000 },
    effectSummary: ['−10% kos seunit semua produk'],
  },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'espresso_machine',
  'pastry_display',
  'signage',
  'hygiene_system',
  'cozy_interior',
  'pos_system',
  'air_cond',
  'second_counter',
  'supplier_contract',
];

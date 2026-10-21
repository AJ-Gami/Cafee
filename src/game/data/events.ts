import type { EventId, ProductId, UpgradeId } from '../types';

export interface EventEffects {
  trafficMultiplier?: number;
  productDemand?: Partial<Record<ProductId, number>>;
  /** Supplier cost multiplier (basis points, 10000 = unchanged) for stock bought today. */
  purchaseCostBps?: Partial<Record<ProductId, number>>;
  capacityMultiplier?: number;
  /** Hours (24h clock) during which the café cannot serve anyone. */
  closedHours?: number[];
  reputationDelta?: number;
  /** One-off cash effect. Negative = cost (other expenses), positive = other income. */
  cashSen?: number;
  /** A bulk order fulfilled from stock at menu price. */
  extraOrders?: Partial<Record<ProductId, number>>;
  /** Reputation depends on how well the café serves customers today. */
  reviewer?: { goodDelta: number; badDelta: number; minServiceRate: number };
}

export interface EventDef {
  id: EventId;
  title: string;
  description: string;
  /** forecast = known during preparation; surprise = revealed when the café opens. */
  visibility: 'forecast' | 'surprise';
  tone: 'good' | 'bad' | 'mixed';
  weight: number;
  minDay: number;
  /** Hour the event appears in the day's timeline. */
  hour: number;
  effects: EventEffects;
  mitigation?: { upgrade: UpgradeId; effects: EventEffects; note: string };
}

export const EVENT_CHANCE = 0.55;

export const EVENTS: Record<EventId, EventDef> = {
  heavy_rain: {
    id: 'heavy_rain',
    title: 'Hujan lebat sepanjang hari',
    description: 'Ramai orang memilih untuk tinggal di rumah. Minuman panas lebih laku, minuman sejuk kurang.',
    visibility: 'forecast',
    tone: 'bad',
    weight: 10,
    minDay: 2,
    hour: 8,
    effects: { trafficMultiplier: 0.75, productDemand: { teh_ais: 0.6, kopi_o: 1.2, latte: 1.15 } },
  },
  heatwave: {
    id: 'heatwave',
    title: 'Cuaca panas terik',
    description: 'Suhu mencecah 35°C. Teh Ais menjadi rebutan, minuman panas kurang diminati.',
    visibility: 'forecast',
    tone: 'mixed',
    weight: 8,
    minDay: 2,
    hour: 8,
    effects: { trafficMultiplier: 0.9, productDemand: { teh_ais: 1.8, kopi_o: 0.8, americano: 0.8, latte: 0.85 } },
    mitigation: {
      upgrade: 'air_cond',
      effects: { trafficMultiplier: 1.1, productDemand: { teh_ais: 1.8, kopi_o: 0.9, americano: 0.9, latte: 0.9 } },
      note: 'Penghawa dingin menarik pelanggan berteduh di kafe anda.',
    },
  },
  food_festival: {
    id: 'food_festival',
    title: 'Pesta makanan berdekatan',
    description: 'Ada pesta makanan di dataran berhampiran. Jangkakan lebih ramai pengunjung.',
    visibility: 'forecast',
    tone: 'good',
    weight: 6,
    minDay: 3,
    hour: 8,
    effects: { trafficMultiplier: 1.4 },
  },
  public_holiday: {
    id: 'public_holiday',
    title: 'Cuti umum',
    description: 'Keluarga keluar bersantai. Lebih ramai pelanggan dan permintaan pastri meningkat.',
    visibility: 'forecast',
    tone: 'good',
    weight: 5,
    minDay: 4,
    hour: 8,
    effects: { trafficMultiplier: 1.25, productDemand: { croissant: 1.2 } },
  },
  coffee_price_spike: {
    id: 'coffee_price_spike',
    title: 'Harga biji kopi naik',
    description: 'Pembekal menaikkan harga 25% untuk hari ini sahaja. Stok kopi yang dibeli hari ini lebih mahal.',
    visibility: 'forecast',
    tone: 'bad',
    weight: 6,
    minDay: 3,
    hour: 8,
    effects: { purchaseCostBps: { kopi_o: 12_500, americano: 12_500, latte: 12_500 } },
  },
  competitor_promo: {
    id: 'competitor_promo',
    title: 'Pesaing buat promosi',
    description: 'Rangkaian kafe berdekatan menawarkan beli 1 percuma 1. Sebahagian pelanggan beralih.',
    visibility: 'forecast',
    tone: 'bad',
    weight: 6,
    minDay: 5,
    hour: 8,
    effects: { trafficMultiplier: 0.8 },
  },
  exam_season: {
    id: 'exam_season',
    title: 'Musim peperiksaan universiti',
    description: 'Pelajar perlukan kafein untuk berjaga. Americano dan Kopi O lebih laris.',
    visibility: 'forecast',
    tone: 'good',
    weight: 5,
    minDay: 3,
    hour: 8,
    effects: { trafficMultiplier: 1.1, productDemand: { americano: 1.5, kopi_o: 1.2 } },
  },
  machine_breakdown: {
    id: 'machine_breakdown',
    title: 'Mesin espreso rosak',
    description: 'Mesin rosak pada waktu puncak. Kapasiti menurun dan kos pembaikan RM120 dikenakan.',
    visibility: 'surprise',
    tone: 'bad',
    weight: 6,
    minDay: 2,
    hour: 11,
    effects: { capacityMultiplier: 0.65, cashSen: -12_000 },
    mitigation: {
      upgrade: 'espresso_machine',
      effects: { capacityMultiplier: 0.85, cashSen: -6_000 },
      note: 'Kepala kedua mesin baharu masih berfungsi — kesannya lebih kecil.',
    },
  },
  food_blogger: {
    id: 'food_blogger',
    title: 'Pengulas makanan singgah',
    description: 'Seorang pengulas makanan terkenal datang tanpa diduga. Servis yang baik akan dipuji.',
    visibility: 'surprise',
    tone: 'mixed',
    weight: 5,
    minDay: 4,
    hour: 15,
    effects: { reviewer: { goodDelta: 5, badDelta: -4, minServiceRate: 0.9 } },
  },
  health_inspection: {
    id: 'health_inspection',
    title: 'Pemeriksaan kesihatan',
    description: 'Pegawai kesihatan membuat pemeriksaan mengejut. Kompaun RM200 dikenakan atas kekurangan kebersihan.',
    visibility: 'surprise',
    tone: 'bad',
    weight: 5,
    minDay: 3,
    hour: 10,
    effects: { cashSen: -20_000, reputationDelta: -2 },
    mitigation: {
      upgrade: 'hygiene_system',
      effects: { reputationDelta: 2 },
      note: 'Sistem kebersihan anda lulus cemerlang — tiada kompaun.',
    },
  },
  office_order: {
    id: 'office_order',
    title: 'Tempahan pukal dari pejabat',
    description: 'Pejabat berdekatan memesan 12 Latte dan 8 Kopi O untuk mesyuarat.',
    visibility: 'surprise',
    tone: 'good',
    weight: 6,
    minDay: 2,
    hour: 10,
    effects: { extraOrders: { latte: 12, kopi_o: 8 } },
  },
  power_outage: {
    id: 'power_outage',
    title: 'Gangguan bekalan elektrik',
    description: 'Bekalan elektrik terputus dari 2 hingga 5 petang. Kafe tidak dapat melayan pelanggan.',
    visibility: 'surprise',
    tone: 'bad',
    weight: 4,
    minDay: 3,
    hour: 14,
    effects: { closedHours: [14, 15, 16], reputationDelta: -0.5 },
  },
  viral_post: {
    id: 'viral_post',
    title: 'Hantaran tular!',
    description: 'Video pelanggan tentang kafe anda tular di media sosial. Ramai datang mencuba.',
    visibility: 'surprise',
    tone: 'good',
    weight: 4,
    minDay: 4,
    hour: 12,
    effects: { trafficMultiplier: 1.5, reputationDelta: 3 },
  },
  pipe_leak: {
    id: 'pipe_leak',
    title: 'Paip bocor',
    description: 'Paip di bawah sinki bocor. Tukang paip dipanggil dengan kos RM90.',
    visibility: 'surprise',
    tone: 'bad',
    weight: 5,
    minDay: 2,
    hour: 16,
    effects: { cashSen: -9_000, reputationDelta: -1 },
  },
  barista_contest: {
    id: 'barista_contest',
    title: 'Menang pertandingan barista',
    description: 'Barista anda memenangi pertandingan seni latte daerah. Hadiah wang tunai RM250!',
    visibility: 'surprise',
    tone: 'good',
    weight: 3,
    minDay: 6,
    hour: 19,
    effects: { cashSen: 25_000, reputationDelta: 2 },
  },
};

export const EVENT_IDS = Object.keys(EVENTS) as EventId[];

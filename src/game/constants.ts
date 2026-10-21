/**
 * Economy and balancing constants. All values are fictional game-balancing
 * numbers, not real Malaysian market data.
 */

export const SAVE_SCHEMA_VERSION = 3;

export const STARTING_CASH_SEN = 500_000; // RM5,000
export const STARTING_REPUTATION = 50;
export const DEFAULT_CAFE_NAME = 'Kopi Kita';
export const CAFE_NAME_MAX_LENGTH = 24;

export const RENT_SEN_PER_DAY = 12_000; // RM120
export const UTILITIES_BASE_SEN = 3_000; // RM30
export const UTILITIES_PER_CUSTOMER_SEN = 10; // RM0.10 per customer served

/** Opening hours 08:00–20:00, one simulation slot per hour. */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
/** Share of the day's footfall arriving in each hour slot (sums to 1). */
export const HOUR_WEIGHTS: readonly number[] = [
  0.1, 0.12, 0.08, 0.07, 0.1, 0.11, 0.07, 0.08, 0.09, 0.08, 0.06, 0.04,
];

/** Footfall at reputation r before multipliers: BASE + r * PER_REP. */
export const BASE_FOOTFALL = 35;
export const FOOTFALL_PER_REPUTATION = 1.1;
/** Isnin..Ahad footfall factors. */
export const WEEKDAY_FACTORS: readonly number[] = [0.95, 1, 1, 1, 1.1, 1.25, 1.15];
export const WEEKDAY_NAMES: readonly string[] = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad'];

/** Base probability that a customer buys their chosen item when it is fairly priced. */
export const BASE_CONVERSION = 0.9;
export const MAX_CONVERSION = 0.98;
/** Chance a customer facing a sold-out item settles for something else. */
export const SUBSTITUTE_ON_STOCKOUT = 0.5;
/** Chance a customer who balks at a price tries something else instead. */
export const SUBSTITUTE_ON_PRICE = 0.3;

export const MIN_PRICE_SEN = 50;
export const MAX_PRICE_SEN = 5_000;
export const PRICE_STEP_SEN = 10;

export const MAX_STOCK_PER_PRODUCT = 999;
export const MAX_PURCHASE_QTY = 500;

/** Bulk purchase discounts, highest threshold first. */
export const BULK_DISCOUNTS: readonly { minQty: number; bps: number }[] = [
  { minQty: 100, bps: 800 },
  { minQty: 50, bps: 500 },
];

export const BASE_STAFF_SLOTS = 2;
export const EXTENDED_STAFF_SLOTS = 4;
export const CANDIDATES_PER_DAY = 3;

export const HISTORY_LIMIT = 60;
export const BANKRUPTCY_NEGATIVE_DAYS = 3;
/** Fraction of potential customers that must be served to keep reputation steady. */
export const SERVICE_RATE_TARGET = 0.85;

export const LOW_STOCK_RATIO = 0.6;

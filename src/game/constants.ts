/**
 * Economy and balancing constants. All values are fictional game-balancing
 * numbers, not real Malaysian market data.
 */

export const SAVE_SCHEMA_VERSION = 7;

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

/** Storage limit per ingredient (a product-era save converts to at most 3,996 coffee measures). */
export const MAX_STOCK_PER_INGREDIENT = 5_000;
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

/** Upgrades are fixed assets, depreciated straight-line over this many closes. */
export const ASSET_LIFE_DAYS = 90;

/** A second branch: unlocked at this café level, its fit-out depreciated over this many closes. */
export const BRANCH_MIN_LEVEL = 3;
export const BRANCH_LIFE_DAYS = 180;
export const BRANCH_STARTING_REPUTATION = 40;
/** The branch runs with 1 to this many baristas, each on a fixed wage and output. */
export const BRANCH_MAX_BARISTAS = 3;
export const BRANCH_BARISTA_WAGE_SEN = 9_000;
export const BRANCH_BARISTA_ORDERS_PER_HOUR = 8;

/**
 * Sales goals on Saturdays, Sundays and public holidays: a revenue target above the average of
 * the days just before (calibrated so a planned weekend — extra stock, staff, a promotion — usually
 * meets it and an ordinary one usually does not).
 */
export const GOAL_BASE_DAYS = 7;
/** Fewer recent days than this and there is no fair average to set a goal from. */
export const GOAL_MIN_BASE_DAYS = 3;
export const WEEKEND_GOAL_BPS = 12_000; // average + 20%
export const HOLIDAY_GOAL_BPS = 13_500; // average + 35%
export const GOAL_MIN_TARGET_SEN = 20_000; // RM200
/** Targets are rounded up to a whole RM10. */
export const GOAL_ROUNDING_SEN = 1_000;
export const BANKRUPTCY_NEGATIVE_DAYS = 3;
/** Fraction of potential customers that must be served to keep reputation steady. */
export const SERVICE_RATE_TARGET = 0.85;


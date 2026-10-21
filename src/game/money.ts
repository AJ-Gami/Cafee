/**
 * Integer-sen money helpers. All arithmetic stays in whole sen; any division
 * is rounded immediately back to an integer.
 */

export const SEN_PER_RINGGIT = 100;

export function isSen(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function rm(ringgit: number): number {
  // Only for static data definitions written as literal ringgit (e.g. rm(3.5)).
  return Math.round(ringgit * SEN_PER_RINGGIT);
}

/** round(a * b / c) for non-negative integers, half rounding up, using integer maths. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) throw new Error('mulDivRound: divisor must be positive');
  return Math.floor((2 * a * b + c) / (2 * c));
}

/** Apply a basis-point rate (10000 = 100%) to an amount in sen, rounding half up. */
export function applyBps(amountSen: number, bps: number): number {
  const sign = amountSen < 0 ? -1 : 1;
  return sign * mulDivRound(Math.abs(amountSen), bps, 10_000);
}

export function sumSen(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatOptions {
  /** Prefix positive numbers with "+". */
  signed?: boolean;
  /** Drop the sen part when it is zero (e.g. RM5,000). */
  trimZeroSen?: boolean;
}

/** Format sen as Malaysian Ringgit, e.g. 123456 -> "RM1,234.56", -500 -> "−RM5.00". */
export function formatRM(sen: number, options: FormatOptions = {}): string {
  const negative = sen < 0;
  const abs = Math.abs(Math.trunc(sen));
  const whole = Math.floor(abs / SEN_PER_RINGGIT);
  const cents = abs % SEN_PER_RINGGIT;
  const centsText = options.trimZeroSen && cents === 0 ? '' : `.${String(cents).padStart(2, '0')}`;
  const body = `RM${groupThousands(whole)}${centsText}`;
  if (negative) return `−${body}`;
  if (options.signed && abs > 0) return `+${body}`;
  return body;
}

/** Plain decimal string for inputs, e.g. 750 -> "7.50". */
export function senToInput(sen: number): string {
  const abs = Math.abs(sen);
  return `${sen < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Parse a ringgit amount typed by the player ("7", "7.5", "RM 7.50", "7,50")
 * into sen without floating-point arithmetic. Returns null when invalid.
 */
export function parseRinggit(text: string): number | null {
  const match = /^\s*(?:RM)?\s*(\d{1,6})(?:[.,](\d{0,2}))?\s*$/i.exec(text);
  if (!match) return null;
  const whole = Number.parseInt(match[1] ?? '0', 10);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return whole * SEN_PER_RINGGIT + Number.parseInt(fraction || '0', 10);
}

/** Margin percentage (0-100, one decimal) — display-only ratio, not money. */
export function marginPercent(priceSen: number, costSen: number): number {
  if (priceSen <= 0) return 0;
  return Math.round(((priceSen - costSen) * 1000) / priceSen) / 10;
}

/**
 * Deterministic pseudo-random numbers. Each day draws from a stream derived
 * from (master seed, day, purpose), so replaying or re-rendering can never
 * change the outcome of a day, and tests are fully reproducible.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  /** Weighted pick; returns undefined when no item has positive weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined;
}

export const RNG_PURPOSE = {
  event: 101,
  demand: 202,
  candidates: 303,
  branch: 404,
} as const;

/** Mix integers into a well-distributed 32-bit seed. */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(probability) {
      return next() < probability;
    },
    weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
      let total = 0;
      for (const item of items) total += Math.max(0, weight(item));
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const item of items) {
        const w = Math.max(0, weight(item));
        if (w <= 0) continue;
        if (roll < w) return item;
        roll -= w;
      }
      // Floating-point edge: fall back to the last positive-weight item.
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i] as T;
        if (weight(item) > 0) return item;
      }
      return undefined;
    },
  };
}

export function dayRng(seed: number, day: number, purpose: number): Rng {
  return createRng(hashSeed(seed, day, purpose));
}

export function newRandomSeed(): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] ?? Date.now() >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

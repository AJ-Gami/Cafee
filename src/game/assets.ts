/**
 * Fixed assets. Upgrades are capital spending: cash leaves when one is bought, and its cost
 * reaches the P&L as straight-line depreciation, one equal charge at each close (the last charge
 * absorbs the rounding), starting with the close of the day it was bought.
 */
import { ASSET_LIFE_DAYS } from './constants';
import { UPGRADES } from './data/upgrades';
import { sumSen } from './money';
import type { FixedAsset, UpgradeId } from './types';

export function newAsset(upgradeId: UpgradeId, day: number): FixedAsset {
  return { upgradeId, costSen: UPGRADES[upgradeId].costSen, lifeDays: ASSET_LIFE_DAYS, acquiredDay: day, chargedDays: 0 };
}

/** The charge taken at the asset's `n`-th close (1-based); 0 outside its life. */
export function depreciationCharge(asset: Pick<FixedAsset, 'costSen' | 'lifeDays'>, n: number): number {
  if (n < 1 || n > asset.lifeDays) return 0;
  const daily = Math.floor(asset.costSen / asset.lifeDays);
  return n < asset.lifeDays ? daily : asset.costSen - daily * (asset.lifeDays - 1);
}

/** Depreciation taken after `charges` closes. */
export function accumulatedDepreciation(asset: Pick<FixedAsset, 'costSen' | 'lifeDays'>, charges: number): number {
  if (charges <= 0) return 0;
  if (charges >= asset.lifeDays) return asset.costSen;
  return Math.floor(asset.costSen / asset.lifeDays) * charges;
}

export function bookValue(asset: FixedAsset): number {
  return asset.costSen - accumulatedDepreciation(asset, asset.chargedDays);
}

export function totalBookValue(assets: readonly FixedAsset[]): number {
  return sumSen(assets.map(bookValue));
}

/** The charge at the next close (0 once fully depreciated). */
export function nextCharge(asset: FixedAsset): number {
  return depreciationCharge(asset, asset.chargedDays + 1);
}

/** Take one day's depreciation on every asset still being depreciated. */
export function depreciateAtClose(assets: readonly FixedAsset[]): { assets: FixedAsset[]; chargeSen: number } {
  let chargeSen = 0;
  const after = assets.map((a) => {
    if (a.chargedDays >= a.lifeDays) return a;
    chargeSen += nextCharge(a);
    return { ...a, chargedDays: a.chargedDays + 1 };
  });
  return { assets: after, chargeSen };
}

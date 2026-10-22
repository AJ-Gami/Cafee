/**
 * Fixed assets. Upgrades and a branch fit-out are capital spending: cash leaves when one is
 * bought, and its cost reaches the P&L as straight-line depreciation, one equal charge at each
 * close (the last charge absorbs the rounding), starting with the close of the day it was bought.
 */
import { ASSET_LIFE_DAYS } from './constants';
import { UPGRADES } from './data/upgrades';
import { sumSen } from './money';
import type { BranchState, DepreciatingCost, FixedAsset, UpgradeId } from './types';

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

export function bookValue(asset: DepreciatingCost): number {
  return asset.costSen - accumulatedDepreciation(asset, asset.chargedDays);
}

export function totalBookValue(assets: readonly DepreciatingCost[]): number {
  return sumSen(assets.map(bookValue));
}

/** Book value of everything the café owns: its upgrades and the branch fit-out. */
export function fixedAssetsBookValue(assets: readonly FixedAsset[], branch: BranchState | null): number {
  return totalBookValue(assets) + (branch ? bookValue(branch.fitOut) : 0);
}

/** The charge at the next close (0 once fully depreciated). */
export function nextCharge(asset: DepreciatingCost): number {
  return depreciationCharge(asset, asset.chargedDays + 1);
}

/** Take one close's depreciation on an asset (nothing once fully depreciated). */
export function depreciateOne<T extends DepreciatingCost>(asset: T): { asset: T; chargeSen: number } {
  if (asset.chargedDays >= asset.lifeDays) return { asset, chargeSen: 0 };
  return { asset: { ...asset, chargedDays: asset.chargedDays + 1 }, chargeSen: nextCharge(asset) };
}

/** Take one day's depreciation on every asset still being depreciated. */
export function depreciateAtClose(assets: readonly FixedAsset[]): { assets: FixedAsset[]; chargeSen: number } {
  let chargeSen = 0;
  const after = assets.map((a) => {
    const step = depreciateOne(a);
    chargeSen += step.chargeSen;
    return step.asset;
  });
  return { assets: after, chargeSen };
}

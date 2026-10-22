import { remainingPrincipal } from '../loans';
import type { GameState, ObjectiveId } from '../types';

/** Cash minus loan principal still owed, so borrowed money never counts as savings. */
const netCash = (s: GameState): number => s.cashSen - remainingPrincipal(s.loan);

export interface ObjectiveDef {
  id: ObjectiveId;
  title: string;
  description: string;
  xp: number;
  target: number;
  /** Current progress toward target (same unit as target). */
  progress: (state: GameState) => number;
  /** How to display progress values. */
  unit: 'count' | 'sen' | 'points';
}

export const OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'first_day',
    title: 'Hari pertama',
    description: 'Lengkapkan hari operasi pertama.',
    xp: 10,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.daysCompleted,
  },
  {
    id: 'first_profit',
    title: 'Untung pertama',
    description: 'Catat untung bersih positif dalam satu hari.',
    xp: 10,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.profitableDays,
  },
  {
    id: 'serve_100',
    title: '100 pelanggan',
    description: 'Layan seramai 100 pelanggan secara kumulatif.',
    xp: 10,
    target: 100,
    unit: 'count',
    progress: (s) => s.stats.totalServed,
  },
  {
    id: 'no_stockout',
    title: 'Stok sentiasa cukup',
    description: 'Layan sekurang-kurangnya 50 pelanggan dalam sehari tanpa sebarang produk kehabisan stok.',
    xp: 15,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.perfectServiceDays,
  },
  {
    id: 'hire_staff',
    title: 'Pasukan berkembang',
    description: 'Ambil pekerja kedua.',
    xp: 10,
    target: 2,
    unit: 'count',
    progress: (s) => s.staff.length,
  },
  {
    id: 'first_upgrade',
    title: 'Naik taraf pertama',
    description: 'Beli sebarang naik taraf kafe.',
    xp: 10,
    target: 1,
    unit: 'count',
    progress: (s) => s.upgrades.length,
  },
  {
    id: 'revenue_600',
    title: 'Jualan RM600 sehari',
    description: 'Capai hasil jualan RM600 dalam satu hari.',
    xp: 15,
    target: 60_000,
    unit: 'sen',
    progress: (s) => s.stats.bestDayRevenueSen,
  },
  {
    id: 'rep_70',
    title: 'Kafe kegemaran',
    description: 'Capai reputasi 70.',
    xp: 20,
    target: 70,
    unit: 'points',
    progress: (s) => s.reputation,
  },
  {
    id: 'cash_8000',
    title: 'Simpanan RM8,000',
    description: 'Kumpul baki tunai RM8,000 (selepas tolak baki pinjaman).',
    xp: 20,
    target: 800_000,
    unit: 'sen',
    progress: netCash,
  },
  {
    id: 'profit_streak_5',
    title: 'Konsisten',
    description: 'Untung bersih positif 5 hari berturut-turut.',
    xp: 25,
    target: 5,
    unit: 'count',
    progress: (s) => s.stats.profitStreak,
  },
  {
    id: 'serve_1000',
    title: '1,000 pelanggan',
    description: 'Layan seramai 1,000 pelanggan secara kumulatif.',
    xp: 25,
    target: 1_000,
    unit: 'count',
    progress: (s) => s.stats.totalServed,
  },
  {
    id: 'revenue_1200',
    title: 'Jualan RM1,200 sehari',
    description: 'Capai hasil jualan RM1,200 dalam satu hari.',
    xp: 30,
    target: 120_000,
    unit: 'sen',
    progress: (s) => s.stats.bestDayRevenueSen,
  },
  {
    id: 'rep_90',
    title: 'Legenda kejiranan',
    description: 'Capai reputasi 90.',
    xp: 30,
    target: 90,
    unit: 'points',
    progress: (s) => s.reputation,
  },
  {
    id: 'cash_25000',
    title: 'Empayar Kafe',
    description: 'Kumpul baki tunai RM25,000 (selepas tolak baki pinjaman).',
    xp: 40,
    target: 2_500_000,
    unit: 'sen',
    progress: netCash,
  },
  {
    id: 'repay_loan',
    title: 'Bebas hutang',
    description: 'Lunaskan pinjaman bank sepenuhnya.',
    xp: 15,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.loansRepaid,
  },
  {
    id: 'weekend_goal',
    title: 'Sasaran tercapai',
    description: 'Capai sasaran jualan pada hari Sabtu, Ahad atau cuti umum.',
    xp: 10,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.goalsMet,
  },
  {
    id: 'holiday_goal',
    title: 'Raikan cuti umum',
    description: 'Capai sasaran jualan pada hari cuti umum.',
    xp: 15,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.holidayGoalsMet,
  },
  {
    id: 'perfect_weekend',
    title: 'Hujung minggu cemerlang',
    description: 'Capai sasaran jualan pada hari Sabtu dan Ahad dalam minggu yang sama.',
    xp: 20,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.perfectWeekends,
  },
  {
    id: 'goals_5',
    title: 'Pakar hujung minggu',
    description: 'Capai 5 sasaran jualan hujung minggu atau cuti umum.',
    xp: 25,
    target: 5,
    unit: 'count',
    progress: (s) => s.stats.goalsMet,
  },
  {
    id: 'open_branch',
    title: 'Empayar bermula',
    description: 'Buka cawangan kedua.',
    xp: 30,
    target: 1,
    unit: 'count',
    progress: (s) => s.stats.branchesOpened,
  },
];

export interface LevelDef {
  level: number;
  title: string;
  minXp: number;
}

export const LEVELS: readonly LevelDef[] = [
  { level: 1, title: 'Kafe Kecil', minXp: 0 },
  { level: 2, title: 'Kafe Kejiranan', minXp: 40 },
  { level: 3, title: 'Kafe Popular', minXp: 100 },
  { level: 4, title: 'Empayar Kafe', minXp: 180 },
];

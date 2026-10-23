/**
 * The getting-started guide: a few steps in the order a new player meets them. Each step is done
 * once the game shows it, so no progress of its own is stored.
 */
import { currentLevel } from './objectives';
import type { GameState } from './types';
import { INGREDIENT_IDS } from './types';

export type TutorialStepId = 'stok' | 'buka' | 'laporan' | 'kapasiti' | 'tahap';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  detail: string;
  /** The screen where the step is done (a navigation tab and sub-tab). */
  tab: 'menu' | 'operasi' | 'urus';
  sub: string | null;
  done: boolean;
}

function boughtStock(state: GameState): boolean {
  return (
    state.day > 1 ||
    state.history.length > 0 ||
    state.dayTransactions.some((t) => t.type === 'stock_purchase') ||
    INGREDIENT_IDS.some((id) => state.ingredients[id].stock > 0)
  );
}

export function tutorialSteps(state: GameState): TutorialStep[] {
  return [
    {
      id: 'stok',
      title: 'Beli stok bahan',
      detail:
        'Setiap menu dibuat daripada bahan: kopi, susu, teh dan pastri. Di Menu → Inventori, tekan "Isi semula ikut anggaran" untuk membeli bahan yang cukup bagi anggaran pelanggan hari ini. Sebahagian susu dan pastri rosak setiap malam, jadi beli ikut keperluan.',
      tab: 'menu',
      sub: 'inventori',
      done: boughtStock(state),
    },
    {
      id: 'buka',
      title: 'Buka kafe',
      detail:
        'Di Operasi, semak senarai persediaan (stok, kapasiti dan promosi), kemudian tekan "Buka kafe". Pelanggan datang dari 8 pagi hingga 8 malam; anda boleh menonton jam demi jam atau terus ke laporan.',
      tab: 'operasi',
      sub: null,
      done: state.day > 1 || state.phase === 'closed',
    },
    {
      id: 'laporan',
      title: 'Baca laporan hari',
      detail:
        'Laporan menunjukkan jualan, kos dan untung bersih, serta pelanggan yang terlepas kerana stok habis, barisan terlalu panjang atau harga terlalu mahal. Tekan "Mulakan Hari 2" apabila sedia.',
      tab: 'operasi',
      sub: null,
      done: state.day > 1,
    },
    {
      id: 'kapasiti',
      title: 'Tambah kapasiti',
      detail:
        'Jika pelanggan beredar kerana barisan terlalu panjang, upah staf atau beli naik taraf di Urus. Gaji dibayar setiap hari, jadi pastikan jualan cukup untuk menampungnya.',
      tab: 'urus',
      sub: null,
      done: state.staff.length > 1 || state.upgrades.length > 0 || state.branches.length > 0,
    },
    {
      id: 'tahap',
      title: 'Capai Tahap 2',
      detail:
        'Objektif di Urus → Objektif memberi XP. Setiap tahap baharu membuka naik taraf dan promosi, dan kemudian cawangan. Jika baki tunai negatif 3 hari berturut-turut, kafe muflis.',
      tab: 'urus',
      sub: 'objektif',
      done: currentLevel(state) >= 2,
    },
  ];
}

/** The first step not yet done, with its position; null once every step is done. */
export function currentTutorialStep(state: GameState): { step: TutorialStep; index: number; total: number } | null {
  const steps = tutorialSteps(state);
  const index = steps.findIndex((s) => !s.done);
  if (index < 0) return null;
  return { step: steps[index] as TutorialStep, index, total: steps.length };
}

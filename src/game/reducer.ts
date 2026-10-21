/**
 * Pure reducer that routes UI actions to the engine. It is safe under React
 * StrictMode double-invocation: identical input always yields identical
 * output, and day settlement is keyed by day number so a repeated OPEN_CAFE
 * for the same day is ignored.
 */
import {
  buyUpgrade,
  createNewGame,
  fireStaff,
  hireStaff,
  openCafe,
  purchaseStock,
  purchaseStockBatch,
  renameCafe,
  repayLoan,
  setPrice,
  setProductEnabled,
  setPromotion,
  startNextDay,
  takeLoan,
} from './engine';
import type {
  EngineErrorCode,
  EngineResult,
  GameState,
  LoanOfferId,
  ObjectiveId,
  ProductId,
  PromotionId,
  UpgradeId,
} from './types';

export type GameAction =
  | { type: 'PURCHASE'; productId: ProductId; quantity: number }
  | { type: 'PURCHASE_BATCH'; items: { productId: ProductId; quantity: number }[] }
  | { type: 'SET_PRICE'; productId: ProductId; priceSen: number }
  | { type: 'SET_PRODUCT_ENABLED'; productId: ProductId; enabled: boolean }
  | { type: 'SET_PROMOTION'; promotionId: PromotionId }
  | { type: 'HIRE'; candidateId: string }
  | { type: 'FIRE'; staffId: string }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'TAKE_LOAN'; offerId: LoanOfferId }
  | { type: 'REPAY_LOAN' }
  | { type: 'OPEN_CAFE'; day: number }
  | { type: 'START_NEXT_DAY'; day: number }
  | { type: 'RENAME'; name: string }
  | { type: 'REPLACE_GAME'; game: GameState; notice?: { kind: 'error' | 'info'; message: string } }
  | { type: 'RESET'; seed: number }
  | { type: 'DISMISS_FEEDBACK'; id: number }
  /** The live replay of a settled day has been watched or skipped. */
  | { type: 'PLAYBACK_DONE' };

export interface Feedback {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  objectives: ObjectiveId[];
}

export interface GameStore {
  game: GameState;
  feedback: Feedback | null;
  feedbackSeq: number;
  /** Day settled during this session (drives the live day playback; not persisted). */
  justSettledDay: number | null;
}

export function initStore(game: GameState): GameStore {
  return { game, feedback: null, feedbackSeq: 0, justSettledDay: null };
}

/** Errors that are expected from repeated taps and should not alarm the player. */
const SILENT_ERRORS: ReadonlySet<EngineErrorCode> = new Set(['NO_CHANGE', 'ALREADY_SETTLED', 'STALE_DAY']);

function apply(store: GameStore, result: EngineResult, extra: Partial<GameStore> = {}): GameStore {
  if (!result.ok) {
    if (SILENT_ERRORS.has(result.error)) return store;
    const id = store.feedbackSeq + 1;
    return { ...store, feedbackSeq: id, feedback: { id, kind: 'error', message: result.message, objectives: [] } };
  }
  const id = store.feedbackSeq + 1;
  return {
    ...store,
    ...extra,
    game: result.state,
    feedbackSeq: id,
    feedback: { id, kind: 'success', message: result.message, objectives: result.newObjectives ?? [] },
  };
}

export function gameReducer(store: GameStore, action: GameAction): GameStore {
  const g = store.game;
  switch (action.type) {
    case 'PURCHASE':
      return apply(store, purchaseStock(g, action.productId, action.quantity));
    case 'PURCHASE_BATCH':
      return apply(store, purchaseStockBatch(g, action.items));
    case 'SET_PRICE':
      return apply(store, setPrice(g, action.productId, action.priceSen));
    case 'SET_PRODUCT_ENABLED':
      return apply(store, setProductEnabled(g, action.productId, action.enabled));
    case 'SET_PROMOTION':
      return apply(store, setPromotion(g, action.promotionId));
    case 'HIRE':
      return apply(store, hireStaff(g, action.candidateId));
    case 'FIRE':
      return apply(store, fireStaff(g, action.staffId));
    case 'BUY_UPGRADE':
      return apply(store, buyUpgrade(g, action.upgradeId));
    case 'TAKE_LOAN':
      return apply(store, takeLoan(g, action.offerId));
    case 'REPAY_LOAN':
      return apply(store, repayLoan(g));
    case 'OPEN_CAFE': {
      const result = openCafe(g, action.day);
      // The report screen itself is the feedback for a settled day.
      if (result.ok) return { ...apply(store, result, { justSettledDay: action.day }), feedback: null };
      return apply(store, result);
    }
    case 'START_NEXT_DAY':
      return apply(store, startNextDay(g, action.day), { justSettledDay: null });
    case 'RENAME':
      return apply(store, renameCafe(g, action.name));
    case 'REPLACE_GAME': {
      if (!action.notice) return { ...store, game: action.game, justSettledDay: null, feedback: null };
      const id = store.feedbackSeq + 1;
      return {
        ...store,
        game: action.game,
        justSettledDay: null,
        feedbackSeq: id,
        feedback: { id, kind: action.notice.kind, message: action.notice.message, objectives: [] },
      };
    }
    case 'RESET': {
      const id = store.feedbackSeq + 1;
      return {
        game: createNewGame(action.seed),
        justSettledDay: null,
        feedbackSeq: id,
        feedback: { id, kind: 'info', message: 'Permainan baharu dimulakan. Semoga berjaya!', objectives: [] },
      };
    }
    case 'PLAYBACK_DONE':
      return store.justSettledDay === null ? store : { ...store, justSettledDay: null };
    case 'DISMISS_FEEDBACK':
      return store.feedback?.id === action.id ? { ...store, feedback: null } : store;
    default:
      return store;
  }
}

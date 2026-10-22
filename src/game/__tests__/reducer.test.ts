import { describe, expect, it } from 'vitest';
import { STARTING_CASH_SEN } from '../constants';
import { gameReducer, initStore, type GameStore } from '../reducer';
import { newGame, stockAll } from './helpers';

function dispatchAll(store: GameStore, actions: Parameters<typeof gameReducer>[1][]): GameStore {
  return actions.reduce(gameReducer, store);
}

describe('game reducer', () => {
  it('settles a day exactly once even if OPEN_CAFE is dispatched repeatedly', () => {
    const store = initStore(stockAll(newGame()));
    const after = dispatchAll(store, [
      { type: 'OPEN_CAFE', day: 1 },
      { type: 'OPEN_CAFE', day: 1 },
      { type: 'OPEN_CAFE', day: 1 },
    ]);
    expect(after.game.history).toHaveLength(1);
    expect(after.game.stats.daysCompleted).toBe(1);
    expect(after.justSettledDay).toBe(1);
    // Repeat taps are ignored silently: no error toast.
    expect(after.feedback).toBeNull();
  });

  it('is pure: invoking twice with the same input (as StrictMode does) gives the same result', () => {
    const store = initStore(stockAll(newGame()));
    const a = gameReducer(store, { type: 'OPEN_CAFE', day: 1 });
    const b = gameReducer(store, { type: 'OPEN_CAFE', day: 1 });
    expect(a).toEqual(b);
    expect(store.game.phase).toBe('prep'); // input not mutated
  });

  it('ignores a stale OPEN_CAFE after advancing to the next day', () => {
    let store = initStore(stockAll(newGame()));
    store = dispatchAll(store, [
      { type: 'OPEN_CAFE', day: 1 },
      { type: 'START_NEXT_DAY', day: 1 },
      { type: 'OPEN_CAFE', day: 1 },
      { type: 'START_NEXT_DAY', day: 1 },
    ]);
    expect(store.game.day).toBe(2);
    expect(store.game.phase).toBe('prep');
    expect(store.game.history).toHaveLength(1);
  });

  it('shows clear feedback for successful and failed purchases', () => {
    const ok = gameReducer(initStore(newGame()), { type: 'PURCHASE', ingredientId: 'susu', quantity: 10 });
    expect(ok.feedback?.kind).toBe('success');
    expect(ok.feedback?.message).toContain('Susu segar');
    const poor = initStore({ ...newGame(), cashSen: 50 });
    const failed = gameReducer(poor, { type: 'PURCHASE', ingredientId: 'susu', quantity: 10 });
    expect(failed.feedback?.kind).toBe('error');
    expect(failed.feedback?.message).toContain('Tunai tidak mencukupi');
    expect(failed.game).toBe(poor.game);
  });

  it('resets to a brand-new game', () => {
    let store = initStore(stockAll(newGame()));
    store = dispatchAll(store, [{ type: 'OPEN_CAFE', day: 1 }, { type: 'START_NEXT_DAY', day: 1 }]);
    const reset = gameReducer(store, { type: 'RESET', seed: 5 });
    expect(reset.game.day).toBe(1);
    expect(reset.game.cashSen).toBe(STARTING_CASH_SEN);
    expect(reset.game.history).toEqual([]);
    expect(reset.game.seed).toBe(5);
  });

  it('marks the day replay as watched so it does not restart', () => {
    let store = gameReducer(initStore(stockAll(newGame())), { type: 'OPEN_CAFE', day: 1 });
    expect(store.justSettledDay).toBe(1);
    store = gameReducer(store, { type: 'PLAYBACK_DONE' });
    expect(store.justSettledDay).toBeNull();
    expect(gameReducer(store, { type: 'PLAYBACK_DONE' })).toBe(store);
  });

  it('dismisses only the matching feedback', () => {
    const store = gameReducer(initStore(newGame()), { type: 'PURCHASE', ingredientId: 'susu', quantity: 1 });
    const id = store.feedback?.id ?? -1;
    expect(gameReducer(store, { type: 'DISMISS_FEEDBACK', id: id + 1 }).feedback).not.toBeNull();
    expect(gameReducer(store, { type: 'DISMISS_FEEDBACK', id }).feedback).toBeNull();
  });
});

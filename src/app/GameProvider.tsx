import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createNewGame } from '../game/engine';
import { gameReducer, initStore, type GameAction, type GameStore } from '../game/reducer';
import { newRandomSeed } from '../game/rng';
import { clearSave, getBrowserStorage, loadGame, peekSaveId, SAVE_KEY, saveGame, type StorageLike } from '../game/save';
import type { GameState } from '../game/types';

export type BootStatus = 'loading' | 'ready';

export type BootNotice =
  | { kind: 'corrupt'; message: string }
  | { kind: 'migrated'; message: string }
  | { kind: 'restored'; message: string }
  | { kind: 'synced'; message: string };

export interface SaveInfo {
  status: 'pending' | 'saved' | 'error' | 'unavailable';
  savedAt: string | null;
  error: string | null;
}

interface GameContextValue {
  boot: BootStatus;
  store: GameStore;
  game: GameState;
  dispatch: (action: GameAction) => void;
  saveInfo: SaveInfo;
  storageAvailable: boolean;
  bootNotice: BootNotice | null;
  dismissBootNotice: () => void;
  /** Write the save now. Returns false when nothing was written (e.g. newer progress was adopted instead). */
  saveNow: () => boolean;
  resetGame: () => void;
  /** Replace the current game with an imported save (already validated). */
  importGame: (game: GameState) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

/** Actions that only touch UI state and never need the cross-tab freshness check. */
const LOCAL_ONLY: ReadonlySet<GameAction['type']> = new Set(['DISMISS_FEEDBACK', 'REPLACE_GAME', 'PLAYBACK_DONE']);

export function GameProvider({ children }: { children: ReactNode }) {
  const storageRef = useRef<StorageLike | null | undefined>(undefined);
  if (storageRef.current === undefined) storageRef.current = getBrowserStorage();
  const storage = storageRef.current;

  // Placeholder game until the save is read; autosave is blocked until boot is ready,
  // so the placeholder can never overwrite a real save.
  const [store, rawDispatch] = useReducer(gameReducer, undefined, () => initStore(createNewGame(newRandomSeed())));
  const [boot, setBoot] = useState<BootStatus>('loading');
  const [bootNotice, setBootNotice] = useState<BootNotice | null>(null);
  const [saveInfo, setSaveInfo] = useState<SaveInfo>({
    status: storage ? 'pending' : 'unavailable',
    savedAt: null,
    error: null,
  });
  /** Id of the save this tab last read or wrote. A different stored id means another tab saved since. */
  const lastSaveIdRef = useRef<string | null>(null);
  /** A game object that already matches storage (just loaded or adopted) and must not be written back. */
  const skipSaveRef = useRef<GameState | null>(null);
  /** The game object last written to storage by this tab. */
  const lastWrittenRef = useRef<GameState | null>(null);

  /**
   * Load the save written by another tab and make it this tab's state.
   * `blocked` means the player's action was dropped because of it, so tell them right there.
   */
  const adoptStoredSave = useCallback((reason: 'remote' | 'blocked'): boolean => {
    const result = loadGame(storage);
    if (result.status !== 'loaded') return false;
    skipSaveRef.current = result.game;
    lastWrittenRef.current = result.game;
    lastSaveIdRef.current = result.saveId;
    rawDispatch({
      type: 'REPLACE_GAME',
      game: result.game,
      notice:
        reason === 'blocked'
          ? { kind: 'error', message: 'Tindakan dibatalkan: kemajuan lebih baharu daripada tab lain telah dimuatkan. Sila semak dan cuba lagi.' }
          : { kind: 'info', message: `Kemajuan dikemas kini daripada tab lain (Hari ${result.game.day}).` },
    });
    setSaveInfo({ status: 'saved', savedAt: result.savedAt, error: null });
    setBootNotice({
      kind: 'synced',
      message: `Kemajuan dikemas kini daripada tab lain (Hari ${result.game.day}). Permainan ini hanya boleh dimainkan dalam satu tab pada satu masa.`,
    });
    return true;
  }, [storage]);

  useEffect(() => {
    const result = loadGame(storage);
    if (result.status === 'loaded') {
      skipSaveRef.current = result.game;
      lastWrittenRef.current = result.game;
      lastSaveIdRef.current = result.saveId;
      rawDispatch({ type: 'REPLACE_GAME', game: result.game });
      setSaveInfo({ status: 'saved', savedAt: result.savedAt, error: null });
      if (result.migratedFrom !== null) {
        // A migrated game must be written in the new format.
        skipSaveRef.current = null;
        setBootNotice({
          kind: 'migrated',
          message: `Simpanan versi ${result.migratedFrom} telah dikemas kini ke format terkini.`,
        });
      } else if (result.game.day > 1 || result.game.history.length > 0) {
        setBootNotice({ kind: 'restored', message: `Selamat kembali! Kemajuan Hari ${result.game.day} dipulihkan.` });
      }
    } else if (result.status === 'corrupt') {
      setBootNotice({
        kind: 'corrupt',
        message: `Simpanan lama tidak dapat dibaca dan permainan baharu dimulakan. ${result.backedUp ? 'Salinan data lama disimpan dalam pelayar ini.' : ''} (${result.error})`,
      });
    }
    setBoot('ready');
  }, [storage]);

  // Autosave after every state change once the save has been read.
  useEffect(() => {
    if (boot !== 'ready') return;
    if (!storage) {
      setSaveInfo({ status: 'unavailable', savedAt: null, error: null });
      return;
    }
    if (store.game === skipSaveRef.current) return;
    const result = saveGame(storage, store.game);
    if (result.ok) {
      lastSaveIdRef.current = result.saveId;
      lastWrittenRef.current = store.game;
    }
    setSaveInfo(
      result.ok
        ? { status: 'saved', savedAt: result.savedAt, error: null }
        : { status: 'error', savedAt: null, error: result.error },
    );
  }, [boot, storage, store.game]);

  /** True when storage holds a save written by another tab since this tab last read or wrote. */
  const storageIsNewer = useCallback((): boolean => {
    const storedId = peekSaveId(storage);
    return typeof storedId === 'string' && storedId !== lastSaveIdRef.current;
  }, [storage]);

  // Another tab saved: adopt its progress immediately so this tab can never overwrite it.
  // Also re-check when the page becomes visible again (tab switch, restore from back/forward cache),
  // since storage events can be missed while a page is suspended.
  useEffect(() => {
    if (!storage || boot !== 'ready') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY || e.newValue === null) return;
      if (storageIsNewer()) adoptStoredSave('remote');
    };
    const onShow = () => {
      if (document.visibilityState === 'visible' && storageIsNewer()) adoptStoredSave('remote');
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [storage, boot, adoptStoredSave, storageIsNewer]);

  /**
   * Before any action that changes the game, make sure this tab still holds the latest save.
   * Covers background tabs that missed a storage event (e.g. a suspended mobile tab).
   */
  const dispatch = useCallback(
    (action: GameAction) => {
      if (boot === 'ready' && storage && !LOCAL_ONLY.has(action.type) && action.type !== 'RESET') {
        if (storageIsNewer() && adoptStoredSave('blocked')) return;
      }
      rawDispatch(action);
    },
    [boot, storage, adoptStoredSave, storageIsNewer],
  );

  const saveNow = useCallback(() => {
    // A stale tab must never overwrite newer progress, not even through a manual save.
    if (storageIsNewer() && adoptStoredSave('blocked')) return false;
    // Nothing changed since this tab's last write: keep the same id so other tabs do not reload.
    const unchanged = store.game === lastWrittenRef.current && lastSaveIdRef.current !== null;
    const result = saveGame(storage, store.game, new Date(), unchanged ? (lastSaveIdRef.current ?? undefined) : undefined);
    if (result.ok) {
      lastSaveIdRef.current = result.saveId;
      lastWrittenRef.current = store.game;
    }
    setSaveInfo(
      result.ok
        ? { status: 'saved', savedAt: result.savedAt, error: null }
        : { status: storage ? 'error' : 'unavailable', savedAt: null, error: result.error },
    );
    return result.ok;
  }, [storage, store.game, adoptStoredSave, storageIsNewer]);

  const importGame = useCallback((game: GameState) => {
    // An explicit, confirmed replacement: always written (and adopted by other tabs).
    skipSaveRef.current = null;
    rawDispatch({
      type: 'REPLACE_GAME',
      game,
      notice: { kind: 'info', message: `Simpanan diimport: ${game.cafeName}, Hari ${game.day}.` },
    });
    setBootNotice(null);
  }, []);

  const resetGame = useCallback(() => {
    clearSave(storage);
    rawDispatch({ type: 'RESET', seed: newRandomSeed() });
    setBootNotice(null);
  }, [storage]);

  const value = useMemo<GameContextValue>(
    () => ({
      boot,
      store,
      game: store.game,
      dispatch,
      saveInfo,
      storageAvailable: storage !== null,
      bootNotice,
      dismissBootNotice: () => setBootNotice(null),
      saveNow,
      resetGame,
      importGame,
    }),
    [boot, store, dispatch, saveInfo, storage, bootNotice, saveNow, resetGame, importGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createNewGame } from '../game/engine';
import { gameReducer, initStore, type GameAction, type GameStore } from '../game/reducer';
import { newRandomSeed } from '../game/rng';
import {
  BACKUP_KEY,
  clearSave,
  compareProgress,
  discardCopy as discardStoredCopy,
  getBrowserStorage,
  isEarlierStateOf,
  isUntouched,
  keepCopy,
  loadGame,
  peekSaveId,
  readCopies,
  readLegacyBackup,
  resolveOldBuildWrite,
  SAVE_KEY,
  saveGame,
  type DecodedSave,
  type StorageLike,
} from '../game/save';
import type { GameState } from '../game/types';

export type BootStatus = 'loading' | 'ready';

export type BootNotice =
  | { kind: 'corrupt'; message: string }
  | { kind: 'migrated'; message: string }
  | { kind: 'restored'; message: string }
  | { kind: 'synced'; message: string }
  /** A tab running an older build of the game wrote older progress; this tab kept its own. */
  | { kind: 'conflict'; message: string }
  /** A kept copy is further ahead than the game that was loaded (see Settings to restore it). */
  | { kind: 'copy'; message: string };

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
  /** Replace the current game with an imported or restored save (already validated). */
  importGame: (game: GameState, message?: string) => void;
  /** Copies set aside that this build can load (see save.readCopies). */
  readCopies: () => DecodedSave[];
  /** Forget a set-aside copy. */
  discardCopy: (game: GameState) => void;
  /**
   * The stored save belongs to a newer version of the game. This tab is read-only (no autosave,
   * no actions) so it can never overwrite that save; the player is asked to reload.
   */
  outdated: boolean;
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
  const [outdated, setOutdated] = useState(false);
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
  /** This tab's current game, for handlers that run outside render. */
  const gameRef = useRef(store.game);
  /**
   * The game as last read from a save an older build wrote (that build keeps playing on from it).
   * While this tab has not changed it, it is part of that build's line of play, not play of its own.
   */
  const fromOldSaveRef = useRef<GameState | null>(null);
  gameRef.current = store.game;

  /**
   * An older build moves a save it cannot read into BACKUP_KEY, and overwrites that key each time
   * it meets one, so a restorable save there may soon be lost. Keep it in this build's own copies
   * unless it is just an earlier point of the current game.
   */
  const rescueLegacyBackup = useCallback(
    (current: GameState): GameState | null => {
      const legacy = readLegacyBackup(storage);
      if (!legacy || !keepCopy(storage, legacy.game, new Date(), current)) return null;
      return legacy.game;
    },
    [storage],
  );

  /**
   * Load the save written by another tab and make it this tab's state.
   * `blocked` means the player's action was dropped because of it, so tell them right there.
   */
  const adoptStoredSave = useCallback((reason: 'remote' | 'blocked'): boolean => {
    const result = loadGame(storage);
    if (result.status === 'newer') {
      setOutdated(true);
      return true;
    }
    if (result.status !== 'loaded') return false;
    // Only a tab still running an older build writes an older format. That build cannot read this
    // tab's saves, so decide which game stays (see resolveOldBuildWrite) and keep the other as a
    // restorable copy unless it is just an earlier point of the one that stays.
    const fromOldBuild = result.migratedFrom !== null;
    let ourCopy = '';
    const ours = gameRef.current;
    if (fromOldBuild) {
      const theirs = result.game;
      if (resolveOldBuildWrite(ours, theirs) === 'ours') {
        // Save the game in play first: if storage is short of room, a kept copy gives way to it,
        // and the notice below must say whether the other tab's copy really was kept.
        const saved = saveGame(storage, ours);
        if (saved.ok) {
          lastSaveIdRef.current = saved.saveId;
          lastWrittenRef.current = ours;
        }
        const keptTheirs = keepCopy(storage, theirs, new Date(), ours);
        const theirsHeldPlay = !isUntouched(theirs) && !isEarlierStateOf(theirs, ours);
        const what =
          theirs.seed === ours.seed
            ? `kemajuan yang kurang (Hari ${theirs.day})`
            : theirs.status !== 'active'
              ? `kafe yang telah muflis (${theirs.cafeName}, Hari ${theirs.day})`
              : `permainan lain (${theirs.cafeName}, Hari ${theirs.day})`;
        setBootNotice({
          kind: 'conflict',
          message: `Tab lain menjalankan versi lama permainan ini dan menyimpan ${what}. Permainan anda (Hari ${ours.day}) dikekalkan${
            keptTheirs
              ? ' dan salinan tab itu boleh dipulihkan dalam Tetapan'
              : theirsHeldPlay
                ? ', tetapi salinan tab itu tidak dapat disimpan'
                : ''
          }. Muat semula tab lama itu untuk mendapatkan versi terkini.`,
        });
        return false;
      }
      // Unchanged since it was read from the old build's own save, ours is part of that tab's line.
      if (ours !== fromOldSaveRef.current && !isUntouched(ours) && !isEarlierStateOf(ours, theirs)) {
        ourCopy = keepCopy(storage, ours, new Date(), theirs)
          ? ` Permainan tab ini sebelumnya (${ours.cafeName}, Hari ${ours.day}) disimpan dan boleh dipulihkan dalam Tetapan.`
          : ` Permainan tab ini sebelumnya (${ours.cafeName}, Hari ${ours.day}) tidak dapat disimpan.`;
      }
      fromOldSaveRef.current = theirs;
    }
    // Not written back, so the old build (if any) can still read what it saved.
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
    setBootNotice(
      fromOldBuild
        ? {
            kind: 'conflict',
            message: `Kemajuan dikemas kini daripada tab yang menjalankan versi lama permainan ini (${result.game.cafeName}, Hari ${result.game.day}).${ourCopy} Muat semula tab lama itu untuk mendapatkan versi terkini.`,
          }
        : {
            kind: 'synced',
            message: `Kemajuan dikemas kini daripada tab lain (Hari ${result.game.day}). Permainan ini hanya boleh dimainkan dalam satu tab pada satu masa.`,
          },
    );
    return true;
  }, [storage]);

  useEffect(() => {
    const result = loadGame(storage);
    const rescued =
      result.status !== 'newer' && result.status !== 'unavailable'
        ? rescueLegacyBackup(result.status === 'loaded' ? result.game : gameRef.current)
        : null;
    if (result.status === 'loaded') {
      skipSaveRef.current = result.game;
      lastWrittenRef.current = result.game;
      lastSaveIdRef.current = result.saveId;
      rawDispatch({ type: 'REPLACE_GAME', game: result.game });
      setSaveInfo({ status: 'saved', savedAt: result.savedAt, error: null });
      if (result.migratedFrom !== null) {
        fromOldSaveRef.current = result.game;
        // A migrated game must be written in the new format.
        skipSaveRef.current = null;
        setBootNotice({
          kind: 'migrated',
          message: `Simpanan versi ${result.migratedFrom} telah dikemas kini ke format terkini.`,
        });
      } else if (result.game.day > 1 || result.game.history.length > 0) {
        setBootNotice({ kind: 'restored', message: `Selamat kembali! Kemajuan Hari ${result.game.day} dipulihkan.` });
      }
    } else if (result.status === 'newer') {
      setOutdated(true);
    }
    // e.g. an older build could not read the newer save and started over: point the player to it.
    // A copy further ahead than what loaded: one just rescued, or any copy when the loaded game
    // has not been played at all (e.g. this tab started over while an older-build tab played on).
    const ahead =
      result.status !== 'loaded'
        ? null
        : rescued && compareProgress(rescued, result.game) > 0
          ? rescued
          : isUntouched(result.game)
            ? (readCopies(storage).find((c) => compareProgress(c.game, result.game) > 0)?.game ?? null)
            : null;
    if (ahead) {
      setBootNotice({
        kind: 'copy',
        message: `Salinan kemajuan yang lebih jauh ditemui (${ahead.cafeName}, Hari ${ahead.day}). Anda boleh memulihkannya dalam Tetapan.`,
      });
    } else if (result.status === 'corrupt') {
      setBootNotice({
        kind: 'corrupt',
        message: `Simpanan lama tidak dapat dibaca dan permainan baharu dimulakan. ${result.backedUp ? 'Salinan data lama disimpan dalam pelayar ini.' : ''} (${result.error})`,
      });
    }
    setBoot('ready');
  }, [storage, rescueLegacyBackup]);

  // Autosave after every state change once the save has been read.
  useEffect(() => {
    if (boot !== 'ready' || outdated) return;
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
  }, [boot, outdated, storage, store.game]);

  /** True when storage holds a save written by another tab since this tab last read or wrote. */
  const storageIsNewer = useCallback((): boolean => {
    const storedId = peekSaveId(storage);
    return typeof storedId === 'string' && storedId !== lastSaveIdRef.current;
  }, [storage]);

  // Another tab saved: adopt its progress immediately so this tab can never overwrite it.
  // Also re-check when the page becomes visible again (tab switch, restore from back/forward cache),
  // since storage events can be missed while a page is suspended.
  useEffect(() => {
    if (!storage || boot !== 'ready' || outdated) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === BACKUP_KEY && e.newValue !== null) rescueLegacyBackup(gameRef.current);
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
  }, [storage, boot, outdated, adoptStoredSave, storageIsNewer, rescueLegacyBackup]);

  /**
   * Before any action that changes the game, make sure this tab still holds the latest save.
   * Covers background tabs that missed a storage event (e.g. a suspended mobile tab).
   */
  const dispatch = useCallback(
    (action: GameAction) => {
      if (outdated && !LOCAL_ONLY.has(action.type)) return;
      if (boot === 'ready' && storage && !LOCAL_ONLY.has(action.type) && action.type !== 'RESET') {
        if (storageIsNewer() && adoptStoredSave('blocked')) return;
      }
      rawDispatch(action);
    },
    [boot, outdated, storage, adoptStoredSave, storageIsNewer],
  );

  const saveNow = useCallback(() => {
    if (outdated) return false;
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
  }, [outdated, storage, store.game, adoptStoredSave, storageIsNewer]);

  const importGame = useCallback((game: GameState, message?: string) => {
    if (outdated) return;
    // An explicit, confirmed replacement: always written (and adopted by other tabs).
    skipSaveRef.current = null;
    rawDispatch({
      type: 'REPLACE_GAME',
      game,
      notice: { kind: 'info', message: message ?? `Simpanan diimport: ${game.cafeName}, Hari ${game.day}.` },
    });
    setBootNotice(null);
  }, [outdated]);

  const resetGame = useCallback(() => {
    if (outdated) return;
    clearSave(storage);
    rawDispatch({ type: 'RESET', seed: newRandomSeed() });
    setBootNotice(null);
  }, [outdated, storage]);

  const readCopiesCb = useCallback(() => readCopies(storage), [storage]);
  const discardCopy = useCallback(
    (game: GameState) => {
      discardStoredCopy(storage, game);
      // A start-up notice pointing to a copy must not outlive the copies the player removes.
      setBootNotice((n) => (n?.kind === 'copy' ? null : n));
    },
    [storage],
  );

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
      readCopies: readCopiesCb,
      discardCopy,
      outdated,
    }),
    [boot, store, dispatch, saveInfo, storage, bootNotice, saveNow, resetGame, importGame, readCopiesCb, discardCopy, outdated],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createNewGame } from '../game/engine';
import { gameReducer, initStore, type GameAction, type GameStore } from '../game/reducer';
import { newRandomSeed } from '../game/rng';
import { clearSave, getBrowserStorage, loadGame, saveGame, type StorageLike } from '../game/save';
import type { GameState } from '../game/types';

export type BootStatus = 'loading' | 'ready';

export type BootNotice =
  | { kind: 'corrupt'; message: string }
  | { kind: 'migrated'; message: string }
  | { kind: 'restored'; message: string };

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
  saveNow: () => void;
  resetGame: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const storageRef = useRef<StorageLike | null | undefined>(undefined);
  if (storageRef.current === undefined) storageRef.current = getBrowserStorage();
  const storage = storageRef.current;

  // Placeholder game until the save is read; autosave is blocked until boot is ready,
  // so the placeholder can never overwrite a real save.
  const [store, dispatch] = useReducer(gameReducer, undefined, () => initStore(createNewGame(newRandomSeed())));
  const [boot, setBoot] = useState<BootStatus>('loading');
  const [bootNotice, setBootNotice] = useState<BootNotice | null>(null);
  const [saveInfo, setSaveInfo] = useState<SaveInfo>({
    status: storage ? 'pending' : 'unavailable',
    savedAt: null,
    error: null,
  });

  useEffect(() => {
    const result = loadGame(storage);
    if (result.status === 'loaded') {
      dispatch({ type: 'REPLACE_GAME', game: result.game });
      setSaveInfo({ status: 'saved', savedAt: result.savedAt, error: null });
      if (result.migratedFrom !== null) {
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
    const result = saveGame(storage, store.game);
    setSaveInfo(
      result.ok
        ? { status: 'saved', savedAt: result.savedAt, error: null }
        : { status: 'error', savedAt: null, error: result.error },
    );
  }, [boot, storage, store.game]);

  const saveNow = useCallback(() => {
    const result = saveGame(storage, store.game);
    setSaveInfo(
      result.ok
        ? { status: 'saved', savedAt: result.savedAt, error: null }
        : { status: storage ? 'error' : 'unavailable', savedAt: null, error: result.error },
    );
  }, [storage, store.game]);

  const resetGame = useCallback(() => {
    clearSave(storage);
    dispatch({ type: 'RESET', seed: newRandomSeed() });
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
    }),
    [boot, store, saveInfo, storage, bootNotice, saveNow, resetGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

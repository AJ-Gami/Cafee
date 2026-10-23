/**
 * Whether the player has hidden the getting-started guide. A per-device convenience kept apart
 * from the save: it names the game (by seed) it was hidden for, so a new game shows it again.
 * Storage may be unavailable; the guide then simply shows.
 */
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'rlt-cafe-empire/panduan';
const CHANGE = 'rlt-cafe-empire:panduan';

/** The stored value, read once and then kept in step with every write. */
let memory: number | null | undefined;

function readHiddenSeed(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { hiddenSeed?: unknown };
    return typeof value.hiddenSeed === 'number' ? value.hiddenSeed : null;
  } catch {
    return null;
  }
}

function writeHiddenSeed(seed: number | null): void {
  try {
    if (seed === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ hiddenSeed: seed }));
  } catch {
    // Not stored: the choice lasts until the page is reloaded.
  }
  memory = seed;
  window.dispatchEvent(new Event(CHANGE));
}

function snapshot(): number | null {
  if (memory === undefined) memory = readHiddenSeed();
  return memory;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = readHiddenSeed();
    onChange();
  };
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTutorialHidden(seed: number): { hidden: boolean; hide: () => void; show: () => void } {
  const hiddenSeed = useSyncExternalStore(subscribe, snapshot);
  const hide = useCallback(() => writeHiddenSeed(seed), [seed]);
  const show = useCallback(() => writeHiddenSeed(null), []);
  return { hidden: hiddenSeed === seed, hide, show };
}

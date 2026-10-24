"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "resitku:pref";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Pilihan kecil per-pelayar (contohnya paparan grid/senarai). Selamat untuk SSR dan pelayar peribadi. */
export function useLocalPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(EVENT, cb);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      try {
        window.localStorage.setItem(key, v);
      } catch {
        // abaikan (contohnya mod peribadi)
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}

"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

type State<T> = { key: string | null; data: T | null; error: string | null };

/**
 * Muat data secara async dengan keadaan loading/error dan fungsi reload.
 * `fetcher` dipanggil semula setiap kali `deps` (nilai boleh-JSON) berubah.
 */
export function useData<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: null });
  const key = JSON.stringify([...deps, version]);
  const run = useEffectEvent(() => fetcher());

  useEffect(() => {
    let cancelled = false;
    run()
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState((s) => ({ key, data: s.data, error: errorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setState((s) => ({ ...s, data: updater(s.data) })), []);
  const refreshing = state.key !== key;
  return {
    data: state.data,
    error: state.error,
    /** Belum ada data langsung (papar skeleton). */
    loading: refreshing && state.data === null && state.error === null,
    refreshing,
    reload,
    setData,
  };
}

/** Tukar ralat kepada mesej BM yang mesra pengguna. */
export function errorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "Tiada sambungan internet. Cuba lagi.";
  if (/JWT|not authenticated|401/i.test(raw)) return "Sesi tamat. Sila log masuk semula.";
  if (/row-level security|permission denied/i.test(raw)) return "Anda tiada kebenaran untuk tindakan ini.";
  if (/NEXT_PUBLIC_SUPABASE/.test(raw)) return "Supabase belum dikonfigurasi (semak env vars).";
  return raw || "Ralat tidak diketahui.";
}

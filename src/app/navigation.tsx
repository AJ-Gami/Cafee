import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type TabId = 'utama' | 'operasi' | 'menu' | 'urus' | 'kewangan';

export const TABS: readonly TabId[] = ['utama', 'operasi', 'menu', 'urus', 'kewangan'];

interface NavState {
  tab: TabId;
  /** Optional sub-section within a tab (e.g. "inventori" inside Menu). */
  sub: string | null;
}

interface NavContextValue extends NavState {
  go: (tab: TabId, sub?: string | null) => void;
  setSub: (sub: string) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

function parseHash(hash: string): NavState {
  const [tab, sub] = hash.replace(/^#\/?/, '').split('/');
  if (tab && (TABS as readonly string[]).includes(tab)) return { tab: tab as TabId, sub: sub || null };
  return { tab: 'utama', sub: null };
}

function writeHash(state: NavState): void {
  const hash = `#/${state.tab}${state.sub ? `/${state.sub}` : ''}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavState>(() => parseHash(window.location.hash));

  useEffect(() => writeHash(state), [state]);

  const go = useCallback((tab: TabId, sub: string | null = null) => {
    setState({ tab, sub });
    window.scrollTo({ top: 0 });
  }, []);

  const setSub = useCallback((sub: string) => setState((s) => ({ ...s, sub })), []);

  const value = useMemo(() => ({ ...state, go, setSub }), [state, go, setSub]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
}

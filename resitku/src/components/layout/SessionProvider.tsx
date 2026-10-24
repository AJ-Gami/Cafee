"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase/client";

export type SessionInfo = {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
  isAdmin: boolean;
  plan: string;
};

type SessionCtx = SessionInfo & { refreshProfile: () => Promise<void> };

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ initial, children }: { initial: SessionInfo; children: ReactNode }) {
  const [info, setInfo] = useState(initial);

  const refreshProfile = useCallback(async () => {
    const { data } = await getSupabase().from("profiles").select("display_name, plan").eq("id", info.userId).maybeSingle();
    if (data) setInfo((s) => ({ ...s, displayName: data.display_name ?? s.displayName, plan: data.plan ?? s.plan }));
  }, [info.userId]);

  const value = useMemo(() => ({ ...info, refreshProfile }), [info, refreshProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession mesti digunakan dalam SessionProvider");
  return ctx;
}

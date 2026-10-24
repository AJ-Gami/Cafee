"use client";

import { ChevronRight, KeyRound, Landmark, LogOut, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { NameSheet, PasswordSheet } from "./ProfileSheets";

export function Row({ icon, label, onClick, danger, right }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean; right?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-canvas ${danger ? "text-red-600" : ""}`}>
      <span className={`grid size-9 place-items-center rounded-xl ${danger ? "bg-red-50" : "bg-canvas"}`}>{icon}</span>
      <span className="flex-1 font-semibold">{label}</span>
      {right ?? <ChevronRight className="size-4 text-muted" />}
    </button>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const session = useSession();
  const [sheet, setSheet] = useState<"name" | "password" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    await getSupabase().auth.signOut();
    router.replace("/log-masuk");
    router.refresh();
  };

  return (
    <main>
      <PageHeader title="Profil" />
      <div className="flex flex-col gap-4 px-4">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent text-xl font-extrabold">
            {session.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{session.displayName}</p>
            <p className="truncate text-sm text-muted">{session.email}</p>
            <p className="text-xs text-muted">Ahli sejak {formatDate(session.createdAt)}</p>
          </div>
        </Card>

        <Card className="divide-y divide-line overflow-hidden">
          <Row icon={<Pencil className="size-4" />} label="Tukar nama paparan" onClick={() => setSheet("name")} />
          <Row icon={<KeyRound className="size-4" />} label="Tukar kata laluan" onClick={() => setSheet("password")} />
          {session.isAdmin ? <Row icon={<Landmark className="size-4" />} label="Admin kategori cukai" onClick={() => router.push("/admin/cukai")} /> : null}
          <Row
            icon={<LogOut className="size-4" />}
            label="Log keluar"
            danger
            onClick={logout}
            right={loggingOut ? <Spinner className="size-4" /> : null}
          />
        </Card>
      </div>
      {sheet === "name" ? <NameSheet open onClose={() => setSheet(null)} /> : null}
      {sheet === "password" ? <PasswordSheet open onClose={() => setSheet(null)} /> : null}
    </main>
  );
}

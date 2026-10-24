"use client";

import { ChevronRight, Crown, FileDown, FileUp, KeyRound, Landmark, LogOut, Pencil, ScanLine, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ImportSheet } from "@/components/profile/ImportSheet";
import { useSession } from "@/components/layout/SessionProvider";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { currentMonthKL, formatDate } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { CategoriesSheet } from "./CategoriesSheet";
import { NameSheet, PasswordSheet } from "./ProfileSheets";

export function Row({ icon, label, hint, onClick, danger, right }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean; right?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-canvas ${danger ? "text-red-600" : ""}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${danger ? "bg-red-50" : "bg-canvas"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block truncate text-xs text-muted">{hint}</span> : null}
      </span>
      {right ?? <ChevronRight className="size-4 shrink-0 text-muted" />}
    </button>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const session = useSession();
  const { success, error } = useToast();
  const [sheet, setSheet] = useState<"name" | "password" | "import" | "categories" | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const { data: scans } = useData(async () => {
    const { data } = await getSupabase().from("ai_usage").select("scan_count").eq("month", currentMonthKL()).maybeSingle();
    return (data?.scan_count as number | undefined) ?? 0;
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    await getSupabase().auth.signOut();
    router.replace("/log-masuk");
    router.refresh();
  };

  const exportData = async () => {
    setExporting("…");
    try {
      const { exportAllData } = await import("@/lib/export/allData");
      await exportAllData((table) => setExporting(table));
      success("Data dieksport.");
    } catch (e) {
      error(`Gagal mengeksport: ${errorMessage(e)}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <main>
      <PageHeader title="Profil" />
      <div className="flex flex-col gap-4 px-4">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-xl font-extrabold">{session.displayName.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{session.displayName}</p>
            <p className="truncate text-sm text-muted">{session.email}</p>
            <p className="text-xs text-muted">Ahli sejak {formatDate(session.createdAt)}</p>
          </div>
        </Card>

        <section>
          <h2 className="eyebrow mb-2 px-1 text-muted">Pakej</h2>
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft">
              <Crown className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-bold">Percuma</p>
              <p className="flex items-center gap-1 text-xs text-muted">
                <ScanLine className="size-3.5" /> Scan AI bulan ini: {scans ?? "–"}
              </p>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="eyebrow mb-2 px-1 text-muted">Akaun</h2>
          <Card className="divide-y divide-line overflow-hidden">
            <Row icon={<Pencil className="size-4" />} label="Tukar nama paparan" onClick={() => setSheet("name")} />
            <Row icon={<KeyRound className="size-4" />} label="Tukar kata laluan" onClick={() => setSheet("password")} />
          </Card>
        </section>

        <section>
          <h2 className="eyebrow mb-2 px-1 text-muted">Data</h2>
          <Card className="divide-y divide-line overflow-hidden">
            <Row icon={<Tags className="size-4" />} label="Kategori belanja saya" hint="Tambah, namakan semula atau padam" onClick={() => setSheet("categories")} />
            <Row
              icon={<FileDown className="size-4" />}
              label="Eksport semua data"
              hint={exporting ? `Mengeksport ${exporting}…` : "ZIP mengandungi CSV setiap jadual"}
              onClick={() => !exporting && void exportData()}
              right={exporting ? <Spinner className="size-4" /> : undefined}
            />
            <Row icon={<FileUp className="size-4" />} label="Import CSV" hint="Belanja atau hutang, dengan pratonton" onClick={() => setSheet("import")} />
            {session.isAdmin ? <Row icon={<Landmark className="size-4" />} label="Admin kategori cukai" hint="Had, kata kunci, salin tahun" onClick={() => router.push("/admin/cukai")} /> : null}
          </Card>
        </section>

        <Card className="overflow-hidden">
          <Row icon={<LogOut className="size-4" />} label="Log keluar" danger onClick={logout} right={loggingOut ? <Spinner className="size-4" /> : null} />
        </Card>
        <p className="pb-4 text-center text-xs text-muted">ResitKu · Simpan resit anda sekurang-kurangnya 7 tahun untuk LHDN.</p>
      </div>
      {sheet === "name" ? <NameSheet open onClose={() => setSheet(null)} /> : null}
      {sheet === "password" ? <PasswordSheet open onClose={() => setSheet(null)} /> : null}
      {sheet === "import" ? <ImportSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "categories" ? <CategoriesSheet onClose={() => setSheet(null)} /> : null}
    </main>
  );
}

import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Luar talian" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent-soft">
        <WifiOff className="size-8" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold">Tiada sambungan</h1>
      <p className="mt-2 text-muted">ResitKu perlukan internet untuk memuatkan data anda. Sambung semula dan cuba lagi.</p>
    </main>
  );
}

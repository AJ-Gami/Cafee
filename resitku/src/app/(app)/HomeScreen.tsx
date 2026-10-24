"use client";

import { Receipt } from "lucide-react";
import { useSession } from "@/components/layout/SessionProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { useToast } from "@/components/ui/Toast";
import { greetingKL } from "@/lib/format";

export function HomeScreen() {
  const { displayName } = useSession();
  const { toast } = useToast();
  return (
    <main className="px-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <p className="eyebrow text-muted">{greetingKL()}</p>
      <h1 className="text-2xl font-extrabold tracking-tight">{displayName}</h1>
      <div className="mt-6">
        <EmptyState icon={Receipt} title="Belum ada belanja" text="Snap resit pertama anda untuk mula menjejak belanja dan cukai." />
      </div>
      <Fab label="Snap resit" onClick={() => toast("Snap resit akan tersedia dalam Fasa 2.")} />
    </main>
  );
}

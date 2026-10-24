"use client";

import { HandCoins } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";

export default function HutangPage() {
  const { toast } = useToast();
  return (
    <main>
      <PageHeader title="Hutang" />
      <div className="px-4">
        <EmptyState icon={HandCoins} title="Belum ada data" text="Bahagian ini sedang dibina." />
      </div>
      <Fab label="Tambah" onClick={() => toast("Akan datang.")} />
    </main>
  );
}

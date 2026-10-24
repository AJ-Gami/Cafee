"use client";

import { Car } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";

export default function KenderaanPage() {
  const { toast } = useToast();
  return (
    <main>
      <PageHeader title="Kenderaan" />
      <div className="px-4">
        <EmptyState icon={Car} title="Belum ada data" text="Bahagian ini sedang dibina." />
      </div>
      <Fab label="Tambah" onClick={() => toast("Akan datang.")} />
    </main>
  );
}

"use client";

import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";

export default function BelanjaPage() {
  const { toast } = useToast();
  return (
    <main>
      <PageHeader title="Belanja" />
      <div className="px-4">
        <EmptyState icon={Receipt} title="Belum ada data" text="Bahagian ini sedang dibina." />
      </div>
      <Fab label="Tambah" onClick={() => toast("Akan datang.")} />
    </main>
  );
}

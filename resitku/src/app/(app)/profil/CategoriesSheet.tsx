"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { CategorySelect } from "@/components/expenses/CategorySelect";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { fetchExpenseCategories } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import type { ExpenseCategory } from "@/lib/types";

/** Urus kategori belanja sendiri. Kategori sistem tidak boleh diubah. */
export function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const { success, error } = useToast();
  const { data, setData, reload } = useData(fetchExpenseCategories, []);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const own = (data ?? []).filter((c) => c.user_id);

  const rename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    const { error: err } = await getSupabase().from("expense_categories").update({ name: renaming.name.trim() }).eq("id", renaming.id);
    if (err) return error(err.code === "23505" ? "Nama ini sudah digunakan." : errorMessage(err));
    setRenaming(null);
    reload();
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error: err } = await getSupabase().from("expense_categories").delete().eq("id", deleting.id);
    setBusy(false);
    if (err) return error(errorMessage(err));
    success("Kategori dipadam.");
    setDeleting(null);
    reload();
  };

  return (
    <>
      <BottomSheet open onClose={onClose} title="Kategori belanja saya">
        <div className="flex flex-col gap-4 pb-3">
          {own.length === 0 ? <p className="text-sm text-muted">Belum ada kategori sendiri. Tambah di bawah.</p> : null}
          <ul className="flex flex-col gap-2">
            {own.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line p-2">
                <span className="grid size-9 place-items-center rounded-lg bg-canvas">
                  <CategoryIcon name={c.icon} className="size-4" />
                </span>
                {renaming?.id === c.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename();
                    }}
                  >
                    <Input value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} className="h-9" autoFocus />
                    <button type="submit" className="rounded-lg bg-accent px-3 text-sm font-semibold">
                      Simpan
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 truncate font-semibold">{c.name}</span>
                    <button type="button" aria-label="Namakan semula" onClick={() => setRenaming({ id: c.id, name: c.name })} className="grid size-9 place-items-center rounded-lg text-muted">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label="Padam" onClick={() => setDeleting(c)} className="grid size-9 place-items-center rounded-lg text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Tambah kategori</p>
            <CategorySelect categories={[]} value={null} onChange={() => {}} onCreated={(c) => setData((list) => [...(list ?? []), c])} />
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={deleting !== null}
        title={`Padam kategori "${deleting?.name}"?`}
        message="Belanja dalam kategori ini tidak dipadam; ia akan menjadi tanpa kategori."
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

"use client";

import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { PICKABLE_ICONS } from "@/lib/categoryIcons";
import { getSupabase } from "@/lib/supabase/client";
import type { ExpenseCategory } from "@/lib/types";

/** Grid pilihan kategori belanja + butang tambah kategori sendiri. */
export function CategorySelect({
  categories,
  value,
  onChange,
  onCreated,
}: {
  categories: ExpenseCategory[];
  value: string | null;
  onChange: (id: string) => void;
  onCreated: (category: ExpenseCategory) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {categories.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              aria-pressed={active}
              className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-[11px] font-semibold leading-tight ${
                active ? "border-ink bg-accent-soft" : "border-line bg-white"
              }`}
            >
              <CategoryIcon name={c.icon} className="size-5" />
              <span className="line-clamp-2">{c.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[11px] font-semibold text-muted"
        >
          <Plus className="size-5" />
          Kategori baharu
        </button>
      </div>
      {adding ? (
        <NewCategorySheet
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            onCreated(c);
            onChange(c.id);
            setAdding(false);
          }}
        />
      ) : null}
    </>
  );
}

function NewCategorySheet({ onClose, onCreated }: { onClose: () => void; onCreated: (c: ExpenseCategory) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [saving, setSaving] = useState(false);
  const { error } = useToast();
  const { userId } = useSession();

  const save = async () => {
    if (!name.trim()) return error("Nama kategori diperlukan.");
    setSaving(true);
    try {
      const { data, error: err } = await getSupabase()
        .from("expense_categories")
        .insert({ name: name.trim(), icon, sort_order: 500, user_id: userId })
        .select("id, user_id, name, icon, sort_order")
        .single();
      if (err) throw err.code === "23505" ? new Error("Kategori dengan nama ini sudah wujud.") : err;
      onCreated(data as ExpenseCategory);
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title="Kategori baharu" onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Field label="Nama" htmlFor="cat-name">
          <Input id="cat-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Ikon</p>
          <div className="grid grid-cols-6 gap-2">
            {PICKABLE_ICONS.map((key) => {
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={icon === key}
                  onClick={() => setIcon(key)}
                  className={`grid aspect-square place-items-center rounded-xl border ${icon === key ? "border-ink bg-accent-soft" : "border-line"}`}
                >
                  <CategoryIcon name={key} className="size-5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

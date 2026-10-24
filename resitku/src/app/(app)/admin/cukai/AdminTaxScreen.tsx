"use client";

import { ChevronRight, Copy, Landmark, Plus } from "lucide-react";
import { useState } from "react";
import { fetchTaxYears } from "@/components/tax/TaxTracker";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useData } from "@/hooks/useData";
import { currentYearKL, formatRM, parseAmount } from "@/lib/format";
import { fetchTaxCategories, orderWithChildren } from "@/lib/tax";
import { BENEFICIARY_LABELS, type Beneficiary, type TaxCategory } from "@/lib/types";

async function adminRequest(path: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; copied?: number };
  if (!res.ok) throw new Error(json.error ?? "Permintaan gagal.");
  return json;
}

const TYPE_LABEL = { relief: "Pelepasan", deduction: "Potongan", rebate: "Rebat" } as const;

export function AdminTaxScreen() {
  const [year, setYear] = useState(currentYearKL());
  const [version, setVersion] = useState(0);
  const { data: years } = useData(fetchTaxYears, [version]);
  const { data: categories, loading } = useData(() => fetchTaxCategories(year, { includeInactive: true }), [year, version]);
  const [editing, setEditing] = useState<TaxCategory | "new" | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const yearOptions = [...new Set([...(years ?? []), year])].sort((a, b) => b - a);
  const ordered = orderWithChildren(categories ?? []);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <main>
      <PageHeader title="Kategori cukai" eyebrow="Admin" back="/profil" />
      <div className="flex flex-col gap-3 px-4">
        <div className="flex gap-2">
          <Select aria-label="Tahun taksiran" value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-11 flex-1">
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                YA {y}
              </option>
            ))}
          </Select>
          <Button variant="secondary" className="h-11 px-3 text-sm" onClick={() => setCopyOpen(true)}>
            <Copy className="size-4" /> Salin ke tahun baru
          </Button>
        </div>

        {loading ? (
          <SkeletonList rows={6} />
        ) : ordered.length === 0 ? (
          <EmptyState icon={Landmark} title={`Tiada kategori untuk YA ${year}`} text="Salin daripada tahun lain atau tambah kategori baharu." />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {ordered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditing(c)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left active:bg-canvas ${c.parent_id ? "pl-8" : ""} ${c.is_active ? "" : "opacity-50"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.code} · {TYPE_LABEL[c.type]} · {c.cap_amount !== null ? formatRM(c.cap_amount) : "Tiada had"}
                    {c.is_active ? "" : " · Tidak aktif"}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>
            ))}
          </Card>
        )}
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Tambah kategori
        </Button>
      </div>
      {editing ? (
        <CategoryEditSheet
          year={year}
          category={editing === "new" ? null : editing}
          parents={(categories ?? []).filter((c) => !c.parent_id && (editing === "new" || c.id !== editing.id))}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {copyOpen ? (
        <CopyYearSheet
          years={years ?? []}
          onClose={() => setCopyOpen(false)}
          onCopied={(to) => {
            setYear(to);
            refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function CategoryEditSheet({
  year,
  category,
  parents,
  onClose,
  onSaved,
}: {
  year: number;
  category: TaxCategory | null;
  parents: TaxCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error } = useToast();
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [cap, setCap] = useState(category?.cap_amount != null ? String(category.cap_amount) : "");
  const [parentId, setParentId] = useState(category?.parent_id ?? "");
  const [type, setType] = useState<TaxCategory["type"]>(category?.type ?? "relief");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(category?.allowed_beneficiaries ?? ["self"]);
  const [keywords, setKeywords] = useState((category?.keywords ?? []).join(", "));
  const [proofType, setProofType] = useState<TaxCategory["proof_type"]>(category?.proof_type ?? "receipt");
  const [notes, setNotes] = useState(category?.notes ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 100));
  const [active, setActive] = useState(category?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return error("Nama diperlukan.");
    if (beneficiaries.length === 0) return error("Pilih sekurang-kurangnya satu penerima.");
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      cap_amount: cap.trim() ? parseAmount(cap) : null,
      parent_id: parentId || null,
      type,
      allowed_beneficiaries: beneficiaries,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      proof_type: proofType,
      notes: notes.trim() || null,
      sort_order: Number(sortOrder) || 100,
      is_active: active,
    };
    setSaving(true);
    try {
      if (category) await adminRequest("/api/admin/tax-categories", "PATCH", { id: category.id, ...body });
      else await adminRequest("/api/admin/tax-categories", "POST", { assessment_year: year, code: code.trim().toUpperCase(), ...body });
      success("Kategori disimpan.");
      onSaved();
      onClose();
    } catch (e) {
      error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title={category ? "Edit kategori" : `Kategori baharu (YA ${year})`} onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Field label="Kod" htmlFor="tc-code" hint={category ? "Kod tidak boleh diubah." : "Huruf besar, contoh GAYA_HIDUP."}>
          <Input id="tc-code" value={code} disabled={Boolean(category)} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Nama" htmlFor="tc-name">
          <Input id="tc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Penerangan" htmlFor="tc-desc">
          <Textarea id="tc-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Had" htmlFor="tc-cap" hint="Kosong = tiada had">
            <MoneyInput id="tc-cap" value={cap} onChange={setCap} placeholder="Tiada had" />
          </Field>
          <Field label="Susunan" htmlFor="tc-sort">
            <Input id="tc-sort" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis" htmlFor="tc-type">
            <Select id="tc-type" value={type} onChange={(e) => setType(e.target.value as TaxCategory["type"])}>
              <option value="relief">Pelepasan</option>
              <option value="deduction">Potongan</option>
              <option value="rebate">Rebat</option>
            </Select>
          </Field>
          <Field label="Bukti" htmlFor="tc-proof">
            <Select id="tc-proof" value={proofType} onChange={(e) => setProofType(e.target.value as TaxCategory["proof_type"])}>
              <option value="receipt">Resit</option>
              <option value="statement">Penyata</option>
            </Select>
          </Field>
        </div>
        <Field label="Kategori induk (sub-had)" htmlFor="tc-parent">
          <Select id="tc-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Tiada (kategori utama)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Penerima dibenarkan</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BENEFICIARY_LABELS) as Beneficiary[]).map((b) => {
              const on = beneficiaries.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setBeneficiaries((list) => (on ? list.filter((x) => x !== b) : [...list, b]))}
                  className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${on ? "border-ink bg-ink text-white" : "border-line"}`}
                >
                  {BENEFICIARY_LABELS[b]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Kata kunci (dipisahkan koma)" htmlFor="tc-kw" hint="Dihantar kepada AI untuk mencadangkan kategori.">
          <Textarea id="tc-kw" rows={3} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
        <Field label="Nota" htmlFor="tc-notes">
          <Textarea id="tc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between rounded-xl border border-line px-3 py-3">
          <span className="font-semibold">Aktif</span>
          <input type="checkbox" className="size-5 accent-[#111827]" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </label>
      </div>
    </BottomSheet>
  );
}

function CopyYearSheet({ years, onClose, onCopied }: { years: number[]; onClose: () => void; onCopied: (to: number) => void }) {
  const { success, error } = useToast();
  const latest = years[0] ?? currentYearKL();
  const [from, setFrom] = useState(latest);
  const [to, setTo] = useState(String(latest + 1));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const target = Number(to);
    if (!Number.isInteger(target) || target < 2000 || target > 2100) return error("Tahun sasaran tidak sah.");
    if (years.includes(target)) return error(`YA ${target} sudah mempunyai kategori.`);
    setSaving(true);
    try {
      const res = await adminRequest("/api/admin/tax-categories/copy", "POST", { fromYear: from, toYear: target });
      success(`${res.copied ?? 0} kategori disalin ke YA ${target}.`);
      onCopied(target);
      onClose();
    } catch (e) {
      error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title="Salin ke tahun baru" onSubmit={save} submitting={saving} submitLabel="Salin">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Menduplikasi semua kategori (termasuk sub-had, had, kata kunci dan nota). Kemudian edit had mengikut Bajet yang
          diluluskan.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dari" htmlFor="copy-from">
            <Select id="copy-from" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ke tahun" htmlFor="copy-to">
            <Input id="copy-to" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
        </div>
      </div>
    </BottomSheet>
  );
}

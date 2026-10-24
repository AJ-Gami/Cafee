"use client";

import { ExternalLink, FolderPlus, Heart, LayoutGrid, Link2, List, Pencil, Search, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { LinkSheet } from "@/components/links/LinkSheet";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, Field, Input } from "@/components/ui/Field";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { errorMessage, useData } from "@/hooks/useData";
import { useLocalPref } from "@/hooks/useLocalPref";
import { domainOf, fetchFolders, fetchLinks, type LinkFolder, type SavedLink } from "@/lib/links";
import { getSupabase } from "@/lib/supabase/client";

type Filter = "all" | "fav" | string;
const VIEWS = ["list", "grid"] as const;

export function PautanScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const sharedUrl = params.get("simpan");
  const sharedTitle = params.get("tajuk");
  const { userId } = useSession();
  const { success, error } = useToast();
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setViewMode] = useLocalPref("resitku:pautan:view", "list", VIEWS);
  const [sheet, setSheet] = useState<{ link: SavedLink | null } | null>(null);
  const [folderSheet, setFolderSheet] = useState<{ folder: LinkFolder | null } | null>(null);
  const { data: links, loading } = useData(fetchLinks, [version]);
  const { data: folders } = useData(fetchFolders, [version]);
  const bump = () => setVersion((v) => v + 1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (links ?? []).filter((l) => {
      if (filter === "fav" && !l.is_favourite) return false;
      if (filter !== "all" && filter !== "fav" && l.folder_id !== filter) return false;
      if (!q) return true;
      return [l.title, l.description, l.note, l.url].some((v) => v?.toLowerCase().includes(q));
    });
  }, [links, filter, query]);

  const toggleFavourite = async (link: SavedLink) => {
    const { error: err } = await getSupabase().from("links").update({ is_favourite: !link.is_favourite }).eq("id", link.id);
    if (err) return error(errorMessage(err));
    bump();
  };

  const closeShared = () => {
    setSheet(null);
    if (sharedUrl) router.replace("/pautan");
  };

  const activeFolder = (folders ?? []).find((f) => f.id === filter) ?? null;
  const showShareSheet = Boolean(sharedUrl) && sheet === null;

  return (
    <main>
      <PageHeader
        title="Pautan"
        back="/"
        right={
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            <button type="button" aria-label="Paparan senarai" aria-pressed={view === "list"} onClick={() => setViewMode("list")} className={`grid size-8 place-items-center rounded-lg ${view === "list" ? "bg-ink text-white" : ""}`}>
              <List className="size-4" />
            </button>
            <button type="button" aria-label="Paparan grid" aria-pressed={view === "grid"} onClick={() => setViewMode("grid")} className={`grid size-8 place-items-center rounded-lg ${view === "grid" ? "bg-ink text-white" : ""}`}>
              <LayoutGrid className="size-4" />
            </button>
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari tajuk, nota atau URL" className="pl-10" aria-label="Cari pautan" />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Semua
          </Chip>
          <Chip active={filter === "fav"} onClick={() => setFilter("fav")}>
            <Heart className="size-3.5" /> Kegemaran
          </Chip>
          {(folders ?? []).map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.name}
            </Chip>
          ))}
          <Chip active={false} onClick={() => setFolderSheet({ folder: null })}>
            <FolderPlus className="size-3.5" /> Folder
          </Chip>
        </div>
        {activeFolder ? (
          <button type="button" onClick={() => setFolderSheet({ folder: activeFolder })} className="-mt-1 self-start px-1 text-xs font-semibold text-muted underline">
            Urus folder &ldquo;{activeFolder.name}&rdquo;
          </button>
        ) : null}

        {loading ? (
          <SkeletonList rows={4} />
        ) : filtered.length === 0 ? (
          links && links.length > 0 ? (
            <EmptyState icon={Search} title="Tiada padanan" text="Cuba carian atau folder lain." />
          ) : (
            <EmptyState
              icon={Link2}
              title="Belum ada pautan"
              text="Simpan pautan resipi, artikel atau produk. Anda juga boleh kongsi terus dari app lain ke ResitKu."
              action={<Button onClick={() => setSheet({ link: null })}>Simpan pautan</Button>}
            />
          )
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((l) => (
              <Card key={l.id} className="flex flex-col overflow-hidden">
                <a href={l.url} target="_blank" rel="noreferrer" className="block">
                  {l.image_url ? (
                    <img src={l.image_url} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full bg-canvas object-cover" />
                  ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center bg-link/10 text-link">
                      <Link2 className="size-8" />
                    </span>
                  )}
                </a>
                <div className="flex flex-1 flex-col p-2.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{l.title || domainOf(l.url)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{domainOf(l.url)}</p>
                  <div className="mt-auto flex justify-end gap-1 pt-2">
                    <IconBtn label="Kegemaran" onClick={() => toggleFavourite(l)} active={l.is_favourite}>
                      <Heart className={`size-4 ${l.is_favourite ? "fill-current" : ""}`} />
                    </IconBtn>
                    <IconBtn label="Edit" onClick={() => setSheet({ link: l })}>
                      <Pencil className="size-4" />
                    </IconBtn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-3">
                <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  {l.image_url ? (
                    <img src={l.image_url} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-xl bg-canvas object-cover" />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-link/10 text-link">
                      <Link2 className="size-6" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">{l.title || domainOf(l.url)}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted">
                      <ExternalLink className="size-3 shrink-0" /> {domainOf(l.url)}
                    </span>
                    {l.note ? <span className="block truncate text-xs text-muted">{l.note}</span> : null}
                  </span>
                </a>
                <IconBtn label="Kegemaran" onClick={() => toggleFavourite(l)} active={l.is_favourite}>
                  <Heart className={`size-4 ${l.is_favourite ? "fill-current" : ""}`} />
                </IconBtn>
                <IconBtn label="Edit" onClick={() => setSheet({ link: l })}>
                  <Pencil className="size-4" />
                </IconBtn>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Fab label="Simpan pautan" onClick={() => setSheet({ link: null })} />
      {sheet || showShareSheet ? (
        <LinkSheet
          link={sheet?.link ?? null}
          initialUrl={sheet ? null : sharedUrl}
          initialTitle={sheet ? null : sharedTitle}
          folders={folders ?? []}
          defaultFolderId={filter !== "all" && filter !== "fav" ? filter : null}
          onClose={closeShared}
          onSaved={bump}
        />
      ) : null}
      {folderSheet ? (
        <FolderSheet
          folder={folderSheet.folder}
          userId={userId}
          onClose={() => setFolderSheet(null)}
          onSaved={(id) => {
            bump();
            if (id) setFilter(id);
            else setFilter("all");
            success(id ? "Folder disimpan." : "Folder dipadam.");
          }}
        />
      ) : null}
    </main>
  );
}

function FolderSheet({ folder, userId, onClose, onSaved }: { folder: LinkFolder | null; userId: string; onClose: () => void; onSaved: (id: string | null) => void }) {
  const { error } = useToast();
  const [name, setName] = useState(folder?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!name.trim()) return error("Masukkan nama folder.");
    setSaving(true);
    const supabase = getSupabase();
    const res = folder
      ? await supabase.from("link_folders").update({ name: name.trim() }).eq("id", folder.id).select("id").single()
      : await supabase.from("link_folders").insert({ user_id: userId, name: name.trim() }).select("id").single();
    setSaving(false);
    if (res.error) return error(res.error.code === "23505" ? "Folder dengan nama ini sudah wujud." : errorMessage(res.error));
    onSaved(res.data.id as string);
    onClose();
  };

  const remove = async () => {
    if (!folder) return;
    setSaving(true);
    const { error: err } = await getSupabase().from("link_folders").delete().eq("id", folder.id);
    setSaving(false);
    if (err) return error(errorMessage(err));
    onSaved(null);
    onClose();
  };

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={folder ? "Urus folder" : "Folder baharu"}
        onSubmit={save}
        submitting={saving}
        footerExtra={
          folder ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="mb-2 flex w-full items-center justify-center gap-2 py-1 text-sm font-semibold text-red-600">
              <Trash2 className="size-4" /> Padam folder
            </button>
          ) : null
        }
      >
        <Field label="Nama folder" htmlFor="folder-name">
          <Input id="folder-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Padam folder ini?"
        message="Pautan dalam folder ini tidak dipadam; ia akan dipindahkan ke Tiada folder."
        loading={saving}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${active ? "border-link bg-link text-white" : "border-line bg-white"}`}
    >
      {children}
    </button>
  );
}

function IconBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`grid size-9 shrink-0 place-items-center rounded-xl active:bg-canvas ${active ? "text-red-600" : "text-muted"}`}>
      {children}
    </button>
  );
}

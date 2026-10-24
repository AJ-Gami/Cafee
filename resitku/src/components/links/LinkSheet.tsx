"use client";

import { Eye, Heart, ImageOff, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { canUse, LIMIT_MESSAGE } from "@/lib/limits";
import { domainOf, fetchPreview, normalizeUrl, type LinkFolder, type Preview, type SavedLink } from "@/lib/links";
import { getSupabase } from "@/lib/supabase/client";

const NEW_FOLDER = "__new__";

export function LinkSheet({
  link,
  initialUrl,
  initialTitle,
  folders,
  defaultFolderId,
  onClose,
  onSaved,
}: {
  link?: SavedLink | null;
  initialUrl?: string | null;
  initialTitle?: string | null;
  folders: LinkFolder[];
  defaultFolderId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { userId, plan } = useSession();
  const { success, error } = useToast();
  const [url, setUrl] = useState(link?.url ?? initialUrl ?? "");
  const [title, setTitle] = useState(link?.title ?? initialTitle ?? "");
  const [preview, setPreview] = useState<Preview | null>(
    link ? { url: link.url, title: link.title, description: link.description, image: link.image_url } : null,
  );
  const [folderId, setFolderId] = useState(link?.folder_id ?? defaultFolderId ?? "");
  const [newFolder, setNewFolder] = useState("");
  const [note, setNote] = useState(link?.note ?? "");
  const [favourite, setFavourite] = useState(link?.is_favourite ?? false);
  const autoUrl = !link && initialUrl ? normalizeUrl(initialUrl) : null;
  const [peeking, setPeeking] = useState(Boolean(autoUrl));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const peek = async (target = url) => {
    const normalized = normalizeUrl(target);
    if (!normalized) return error("URL tidak sah.");
    setPeeking(true);
    const result = await fetchPreview(normalized);
    setPeeking(false);
    if (!result || (!result.title && !result.description && !result.image)) {
      setPreview({ url: normalized, title: null, description: null, image: null });
      return;
    }
    setPreview(result);
    if (!title.trim() && result.title) setTitle(result.title);
  };

  // Pautan yang dikongsi dari app lain: terus buat pratonton.
  const applyAutoPreview = useEffectEvent((result: Preview | null, target: string) => {
    setPeeking(false);
    setPreview(result ?? { url: target, title: null, description: null, image: null });
    if (result?.title) setTitle((t) => t.trim() || result.title || "");
  });
  useEffect(() => {
    if (!autoUrl) return;
    let cancelled = false;
    fetchPreview(autoUrl).then((result) => {
      if (!cancelled) applyAutoPreview(result, autoUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [autoUrl]);

  const save = async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return error("Masukkan URL yang sah.");
    if (!link && !(await canUse("save_link", { plan }))) return error(LIMIT_MESSAGE);
    setSaving(true);
    const supabase = getSupabase();
    try {
      let folder: string | null = folderId && folderId !== NEW_FOLDER ? folderId : null;
      if (folderId === NEW_FOLDER && newFolder.trim()) {
        const { data, error: fErr } = await supabase.from("link_folders").insert({ user_id: userId, name: newFolder.trim() }).select("id").single();
        if (fErr) throw fErr.code === "23505" ? new Error("Folder dengan nama ini sudah wujud.") : fErr;
        folder = data.id as string;
      }
      const samePreview = preview && preview.url && normalizeUrl(preview.url) === normalized;
      const payload = {
        user_id: userId,
        url: normalized,
        title: title.trim() || (samePreview ? preview?.title : null) || domainOf(normalized),
        description: samePreview ? preview?.description ?? null : null,
        image_url: samePreview ? preview?.image ?? null : null,
        folder_id: folder,
        note: note.trim() || null,
        is_favourite: favourite,
      };
      const res = link ? await supabase.from("links").update(payload).eq("id", link.id) : await supabase.from("links").insert(payload);
      if (res.error) throw res.error;
      success(link ? "Pautan dikemas kini." : "Pautan disimpan.");
      onSaved();
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!link) return;
    setSaving(true);
    const { error: err } = await getSupabase().from("links").delete().eq("id", link.id);
    setSaving(false);
    if (err) return error(errorMessage(err));
    success("Pautan dipadam.");
    onSaved();
    onClose();
  };

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={link ? "Edit pautan" : "Simpan pautan"}
        onSubmit={save}
        submitting={saving}
        footerExtra={
          link ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="mb-2 flex w-full items-center justify-center gap-2 py-1 text-sm font-semibold text-red-600">
              <Trash2 className="size-4" /> Padam pautan
            </button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="URL" htmlFor="link-url">
            <div className="flex gap-2">
              <Input
                id="link-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                autoFocus={!link && !initialUrl}
              />
              <button
                type="button"
                onClick={() => void peek()}
                disabled={peeking || !url.trim()}
                className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {peeking ? <Spinner className="size-4" /> : <Eye className="size-4" />} Peek
              </button>
            </div>
          </Field>

          {peeking ? (
            <div className="h-24 animate-pulse rounded-2xl bg-line" />
          ) : preview ? (
            <div className="flex overflow-hidden rounded-2xl border border-line">
              {preview.image ? (
                <img src={preview.image} alt="" className="h-24 w-24 shrink-0 bg-canvas object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid h-24 w-24 shrink-0 place-items-center bg-canvas text-muted">
                  <ImageOff className="size-6" />
                </span>
              )}
              <div className="min-w-0 p-3">
                <p className="line-clamp-2 text-sm font-semibold">{preview.title ?? "Tiada pratonton"}</p>
                {preview.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{preview.description}</p> : null}
                <p className="mt-1 truncate text-xs text-muted">{domainOf(preview.url)}</p>
              </div>
            </div>
          ) : null}

          <Field label="Tajuk" htmlFor="link-title">
            <Input id="link-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diisi automatik selepas Peek" />
          </Field>
          <Field label="Folder" htmlFor="link-folder">
            <Select id="link-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Tiada folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value={NEW_FOLDER}>+ Folder baharu…</option>
            </Select>
          </Field>
          {folderId === NEW_FOLDER ? (
            <Field label="Nama folder baharu" htmlFor="link-newfolder">
              <Input id="link-newfolder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Contoh: Resipi" />
            </Field>
          ) : null}
          <Field label="Nota" htmlFor="link-note">
            <Textarea id="link-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pilihan" />
          </Field>
          <button
            type="button"
            aria-pressed={favourite}
            onClick={() => setFavourite((f) => !f)}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl border font-semibold ${favourite ? "border-red-200 bg-red-50 text-red-600" : "border-line"}`}
          >
            <Heart className={`size-4 ${favourite ? "fill-current" : ""}`} /> {favourite ? "Dalam Kegemaran" : "Tambah ke Kegemaran"}
          </button>
        </div>
      </BottomSheet>
      <ConfirmDialog open={confirmDelete} title="Padam pautan ini?" loading={saving} onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </>
  );
}

"use client";

import { useState } from "react";
import { useSession } from "@/components/layout/SessionProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/hooks/useData";
import { authErrorBM } from "@/lib/authErrors";
import { getSupabase } from "@/lib/supabase/client";

export function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const [name, setName] = useState(session.displayName);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const save = async () => {
    const value = name.trim();
    if (!value) return error("Nama tidak boleh kosong.");
    setSaving(true);
    try {
      const { error: err } = await getSupabase().from("profiles").update({ display_name: value }).eq("id", session.userId);
      if (err) throw err;
      await session.refreshProfile();
      success("Nama paparan dikemas kini.");
      onClose();
    } catch (e) {
      error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Tukar nama paparan" onSubmit={save} submitting={saving}>
      <Field label="Nama paparan" htmlFor="display-name">
        <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
      </Field>
    </BottomSheet>
  );
}

export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const save = async () => {
    if (password.length < 8) return error("Kata laluan mesti sekurang-kurangnya 8 aksara.");
    if (password !== confirm) return error("Pengesahan kata laluan tidak sama.");
    setSaving(true);
    try {
      const { error: err } = await getSupabase().auth.updateUser({ password });
      if (err) throw err;
      success("Kata laluan ditukar.");
      setPassword("");
      setConfirm("");
      onClose();
    } catch (e) {
      error(authErrorBM(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Tukar kata laluan" onSubmit={save} submitting={saving}>
      <div className="flex flex-col gap-4">
        <Field label="Kata laluan baharu" htmlFor="new-password" hint="Sekurang-kurangnya 8 aksara.">
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Sahkan kata laluan" htmlFor="confirm-password">
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
    </BottomSheet>
  );
}

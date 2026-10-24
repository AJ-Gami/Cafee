"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/Logo";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { authErrorBM } from "@/lib/authErrors";
import { getSupabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Kata laluan mesti sekurang-kurangnya 8 aksara.");
    if (password !== confirm) return setError("Pengesahan kata laluan tidak sama.");
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Auth session missing");
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(authErrorBM(err instanceof Error ? err.message : String(err)));
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <LogoMark className="size-16" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Set semula kata laluan</h1>
      <p className="mt-1 text-muted">Pilih kata laluan baharu untuk akaun anda.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <Field label="Kata laluan baharu" htmlFor="password" hint="Sekurang-kurangnya 8 aksara.">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Sahkan kata laluan" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold active:bg-accent-strong disabled:opacity-60"
        >
          {loading ? <Spinner className="size-4" /> : null}
          Simpan kata laluan
        </button>
      </form>
    </div>
  );
}

"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LogoMark } from "@/components/Logo";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { authErrorBM } from "@/lib/authErrors";
import { getSupabase } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Kata laluan mesti sekurang-kurangnya 8 aksara.");
    if (password !== confirm) return setError("Pengesahan kata laluan tidak sama.");
    setLoading(true);
    try {
      const { data, error: err } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (err) throw err;
      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }
      setSent(true);
    } catch (err) {
      setError(authErrorBM(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-accent-soft">
          <MailCheck className="size-8" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">Semak email anda</h1>
        <p className="mt-2 text-muted">
          Kami telah menghantar pautan pengesahan ke <strong className="text-ink">{email}</strong>. Ketik pautan itu untuk
          mengaktifkan akaun.
        </p>
        <Link href="/log-masuk" className="mt-8 font-semibold underline">
          Kembali ke log masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <LogoMark className="size-16" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Cipta akaun</h1>
      <p className="mt-1 text-muted">Simpan resit, jejak belanja dan pelepasan cukai.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <Field label="Nama paparan" htmlFor="name">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Aina" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Kata laluan" htmlFor="password" hint="Sekurang-kurangnya 8 aksara.">
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
          Daftar
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton />

      <p className="mt-8 text-center text-sm text-muted">
        Sudah ada akaun?{" "}
        <Link href="/log-masuk" className="font-semibold text-ink underline-offset-2 hover:underline">
          Log masuk
        </Link>
      </p>
    </div>
  );
}

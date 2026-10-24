"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { LogoMark } from "@/components/Logo";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { authErrorBM } from "@/lib/authErrors";
import { getSupabase } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? authErrorBM(params.get("error")) : null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(authErrorBM(err instanceof Error ? err.message : String(err)));
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <LogoMark className="size-16" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Selamat kembali</h1>
      <p className="mt-1 text-muted">Log masuk ke ResitKu untuk teruskan.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </Field>
        <Field label="Kata laluan" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="-mt-1 text-right">
          <Link href="/lupa-kata-laluan" className="text-sm font-semibold text-muted underline-offset-2 hover:underline">
            Lupa kata laluan?
          </Link>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold active:bg-accent-strong disabled:opacity-60"
        >
          {loading ? <Spinner className="size-4" /> : null}
          Log masuk
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton next={next} />

      <p className="mt-8 text-center text-sm text-muted">
        Belum ada akaun?{" "}
        <Link href="/daftar" className="font-semibold text-ink underline-offset-2 hover:underline">
          Daftar sekarang
        </Link>
      </p>
    </div>
  );
}

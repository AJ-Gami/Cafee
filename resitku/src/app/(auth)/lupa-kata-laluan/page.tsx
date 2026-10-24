"use client";

import { ChevronLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field, Input } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { authErrorBM } from "@/lib/authErrors";
import { getSupabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/set-semula-kata-laluan`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(authErrorBM(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Link href="/log-masuk" className="-ml-1 mb-6 grid size-10 place-items-center rounded-full bg-canvas" aria-label="Kembali">
        <ChevronLeft className="size-5" />
      </Link>
      {sent ? (
        <div className="flex flex-col items-start">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft">
            <MailCheck className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold">Semak email anda</h1>
          <p className="mt-2 text-muted">
            Jika <strong className="text-ink">{email}</strong> berdaftar, pautan untuk set semula kata laluan akan sampai
            sebentar lagi.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">Lupa kata laluan</h1>
          <p className="mt-1 text-muted">Masukkan email akaun anda. Kami akan hantar pautan untuk set semula.</p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold active:bg-accent-strong disabled:opacity-60"
            >
              {loading ? <Spinner className="size-4" /> : null}
              Hantar pautan
            </button>
          </form>
        </>
      )}
    </div>
  );
}

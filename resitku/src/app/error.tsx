"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-extrabold">Ada masalah berlaku</h1>
      <p className="mt-2 text-muted">Maaf, sesuatu tidak kena. Cuba muat semula halaman.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-2xl bg-accent px-5 py-3 font-semibold">
        Cuba lagi
      </button>
    </main>
  );
}

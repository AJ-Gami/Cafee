import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-muted">404</p>
      <h1 className="mt-2 text-2xl font-extrabold">Halaman tidak dijumpai</h1>
      <p className="mt-2 text-muted">Pautan mungkin salah atau rekod telah dipadam.</p>
      <Link href="/" className="mt-6 rounded-2xl bg-accent px-5 py-3 font-semibold">
        Kembali ke Home
      </Link>
    </main>
  );
}

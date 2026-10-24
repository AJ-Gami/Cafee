export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center bg-white px-6 py-10">
      {children}
    </main>
  );
}

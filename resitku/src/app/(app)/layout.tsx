import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { SessionProvider } from "@/components/layout/SessionProvider";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-masuk");

  const { data: profile } = await supabase.from("profiles").select("display_name, plan").eq("id", user.id).maybeSingle();

  return (
    <SessionProvider
      initial={{
        userId: user.id,
        email: user.email ?? "",
        displayName: profile?.display_name || user.email?.split("@")[0] || "Pengguna",
        createdAt: user.created_at,
        isAdmin: isAdminEmail(user.email),
        plan: profile?.plan ?? "free",
      }}
    >
      <div className="mx-auto min-h-dvh max-w-[480px] bg-canvas pb-[calc(env(safe-area-inset-bottom)+96px)]">{children}</div>
      <BottomNav />
    </SessionProvider>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getUser } from "@/lib/supabase/server";
import { AdminTaxScreen } from "./AdminTaxScreen";

export const metadata: Metadata = { title: "Admin kategori cukai" };

export default async function AdminTaxPage() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return <AdminTaxScreen />;
}

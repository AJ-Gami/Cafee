import { createElement } from "react";
import { categoryIcon } from "@/lib/categoryIcons";

/** Ikon kategori belanja berdasarkan nama ikon lucide yang disimpan dalam DB. */
export function CategoryIcon({ name, className = "size-5" }: { name: string | null | undefined; className?: string }) {
  return createElement(categoryIcon(name), { className, "aria-hidden": true });
}

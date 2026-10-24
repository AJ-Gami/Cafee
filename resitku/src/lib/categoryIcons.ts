import {
  Baby,
  BookOpen,
  Car,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  House,
  type LucideIcon,
  PawPrint,
  Plane,
  Receipt,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Tag,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-basket": ShoppingBasket,
  fuel: Fuel,
  car: Car,
  zap: Zap,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  smartphone: Smartphone,
  dumbbell: Dumbbell,
  shirt: Shirt,
  house: House,
  baby: Baby,
  "hand-heart": HandHeart,
  plane: Plane,
  "shield-check": ShieldCheck,
  tag: Tag,
  coffee: Coffee,
  gift: Gift,
  "paw-print": PawPrint,
  "shopping-bag": ShoppingBag,
  sparkles: Sparkles,
  wifi: Wifi,
  wrench: Wrench,
  receipt: Receipt,
};

/** Ikon yang boleh dipilih untuk kategori sendiri. */
export const PICKABLE_ICONS = Object.keys(CATEGORY_ICONS);

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Tag;
}

/**
 * Palet kategori carta (urutan tetap, disahkan untuk buta warna pada pasangan bersebelahan).
 * Maksimum 8 siri; selebihnya digabung sebagai "Lain-lain" dengan warna kelabu.
 */
export const CHART_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const CHART_OTHER = "#9ca3af";

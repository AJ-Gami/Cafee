"use client";

import { getSupabase } from "@/lib/supabase/client";

export type LinkFolder = { id: string; name: string };
export type SavedLink = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  folder_id: string | null;
  note: string | null;
  is_favourite: boolean;
  created_at: string;
};
export type Preview = { title: string | null; description: string | null; image: string | null; url: string };

export async function fetchLinks(): Promise<SavedLink[]> {
  const { data, error } = await getSupabase().from("links").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedLink[];
}

export async function fetchFolders(): Promise<LinkFolder[]> {
  const { data, error } = await getSupabase().from("link_folders").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkFolder[];
}

/** Normalkan input pengguna kepada URL http(s), atau null. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Cari URL pertama dalam teks (Share Target Android biasanya meletakkan URL dalam `text`). */
export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function fetchPreview(url: string): Promise<Preview | null> {
  try {
    const res = await fetch(`/api/links/preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as Preview;
  } catch {
    return null;
  }
}

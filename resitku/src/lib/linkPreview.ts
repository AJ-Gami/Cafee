import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LinkPreview = { title: string | null; description: string | null; image: string | null; url: string };

const MAX_BYTES = 600_000;
const MAX_REDIRECTS = 3;

/** Alamat IP peribadi / dalaman yang tidak boleh diakses dari pelayan (halang SSRF). */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
  if (url.username || url.password) throw new Error("credentials");
  if (url.port && !["80", "443", ""].includes(url.port)) throw new Error("port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) throw new Error("private");
  return url;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const key of keys) {
    for (const tag of tags) {
      const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
      if (content) return decodeEntities(content);
    }
  }
  return null;
}

/** Ambil halaman dan baca og:title, og:description, og:image. Timeout 5 saat. */
export async function fetchLinkPreview(raw: string): Promise<LinkPreview> {
  let url = await assertPublicUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    let res: Response | null = null;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ResitKuBot/1.0; +https://resitku.app)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ms-MY,ms;q=0.9,en;q=0.8",
        },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = await assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      break;
    }
    if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
      return { title: null, description: null, image: null, url: url.toString() };
    }

    // Baca sebahagian awal sahaja (tag meta berada dalam <head>).
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      await reader.cancel().catch(() => {});
    }

    const title = metaContent(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]!) : null);
    const description = metaContent(html, ["og:description", "twitter:description", "description"]);
    const rawImage = metaContent(html, ["og:image", "og:image:url", "twitter:image"]);
    let image: string | null = null;
    if (rawImage) {
      try {
        const abs = new URL(rawImage, url);
        if (abs.protocol === "https:" || abs.protocol === "http:") image = abs.toString();
      } catch {
        image = null;
      }
    }
    return {
      title: title?.slice(0, 300) ?? null,
      description: description?.slice(0, 600) ?? null,
      image: image?.slice(0, 2048) ?? null,
      url: url.toString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

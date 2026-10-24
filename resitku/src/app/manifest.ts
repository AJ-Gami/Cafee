import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ResitKu",
    short_name: "ResitKu",
    description: "Catat belanja, snap resit dan jejak pelepasan cukai LHDN.",
    lang: "ms",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F7F9",
    theme_color: "#FFD43B",
    categories: ["finance", "productivity"],
    // Kongsi pautan dari app lain terus ke ResitKu (Web Share Target).
    share_target: {
      action: "/kongsi",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    shortcuts: [
      { name: "Snap resit", url: "/belanja", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pautan", url: "/pautan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

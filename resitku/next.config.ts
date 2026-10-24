import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App ini kebanyakannya komponen klien yang bercakap terus dengan Supabase,
  // jadi model caching lama (tanpa Cache Components) lebih ringkas. Lihat DECISIONS.md.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

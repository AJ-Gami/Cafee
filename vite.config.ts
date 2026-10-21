import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Files from public/ that the service worker precaches alongside the build output. */
const PUBLIC_PRECACHE = [
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

function serviceWorkerSource(cacheName: string, files: string[]): string {
  return `// Generated at build time by vite.config.ts — do not edit.
const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('cafe-empire-') && key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first so updates arrive whenever online; cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Built files are content-hashed, so the cached copy is always correct.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
`;
}

/** Emits sw.js precaching every built file, with a cache name that changes whenever the build does. */
function serviceWorker(): Plugin {
  return {
    name: 'cafe-empire-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map') && file !== 'index.html' && file !== 'sw.js');
      const files = ['./', ...built.sort(), ...PUBLIC_PRECACHE];
      const html = bundle['index.html'];
      const htmlSource = html && html.type === 'asset' ? String(html.source) : '';
      let hash = 0x811c9dc5;
      for (const ch of files.join('|') + htmlSource) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(`cafe-empire-${(hash >>> 0).toString(36)}`, files) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  // Relative base so the production build works from any static host or sub-path.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

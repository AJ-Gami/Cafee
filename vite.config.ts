import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

function serviceWorkerSource(version: string, files: string[]): string {
  return `// Generated at build time by vite.config.ts — do not edit.
const SCOPE = self.registration.scope;
// Caches are namespaced by scope so other copies of the game on the same origin are left alone.
const PREFIX = 'cafe-empire:' + SCOPE + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const PRECACHE = ${JSON.stringify(files)};
const PRECACHE_URLS = new Set(PRECACHE.map((path) => new URL(path, SCOPE).href));
const SHELL = new URL('./', SCOPE).href;
const INDEX = new URL('index.html', SCOPE).href;
const ASSETS = new URL('assets/', SCOPE).href;

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so the shell always matches this build's chunks.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new Request(new URL(path, SCOPE), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          // Older builds of this deployment.
          if (key.startsWith(PREFIX)) return key === CACHE ? false : caches.delete(key);
          // Pre-namespacing cache name: remove it only if it holds this deployment's own shell,
          // so another copy of the game on the same origin keeps its offline cache.
          if (/^cafe-empire-[a-z0-9]+$/.test(key)) {
            return caches
              .open(key)
              .then((cache) => cache.match(SHELL, { ignoreVary: true }))
              .then((hit) => (hit ? caches.delete(key) : false));
          }
          return false;
        }),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.origin + url.pathname;

  // The game's own page: network first; offline, the shell precached with this build's chunks.
  // Other pages on the origin are not ours and are left to the browser.
  if (request.mode === 'navigate') {
    if (path !== SHELL && path !== INDEX) return;
    event.respondWith(fetch(request).catch(() => caches.match(SHELL, { ignoreVary: true }).then((cached) => cached || Response.error())));
    return;
  }

  // Only the game's own files. Hashed build files never change, so a cached copy is always right.
  // ignoreVary: the page requests scripts with an Origin header (crossorigin), the precache did not.
  const isBuildAsset = path.startsWith(ASSETS);
  if (!isBuildAsset && !PRECACHE_URLS.has(path)) return;
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (isBuildAsset && response.ok && response.type === 'basic') {
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

/**
 * Emits sw.js precaching every built file. Its version changes whenever any precached file
 * changes (built file names, index.html, or the contents of the public/ files above), so the
 * browser installs a new worker for every meaningful deploy.
 */
function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'cafe-empire-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map') && file !== 'index.html' && file !== 'sw.js');
      const files = ['./', ...built.sort(), ...PUBLIC_PRECACHE];
      const html = bundle['index.html'];
      const htmlSource = html && html.type === 'asset' ? String(html.source) : '';
      const publicSource = PUBLIC_PRECACHE.map((file) => readFileSync(resolve(publicDir, file)).toString('base64')).join('|');
      let hash = 0x811c9dc5;
      for (const ch of files.join('|') + htmlSource + publicSource) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource((hash >>> 0).toString(36), files) });
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

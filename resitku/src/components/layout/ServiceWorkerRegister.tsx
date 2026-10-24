"use client";

import { useEffect } from "react";

/** Daftar service worker (production sahaja, supaya tidak mengganggu dev). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Abaikan: app masih berfungsi tanpa service worker.
    });
  }, []);
  return null;
}

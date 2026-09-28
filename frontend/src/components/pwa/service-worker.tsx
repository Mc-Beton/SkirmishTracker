"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (production builds only – in `next dev` a caching worker would serve stale bundles).
 * Test offline behaviour with `next build && next start`.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

/** Drops data cached for offline use (API answers of the signed-in user); call on sign-out. */
export function clearOfflineUserData() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage("clear-user-data");
}

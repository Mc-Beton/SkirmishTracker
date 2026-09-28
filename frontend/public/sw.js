/* WarBracket service worker: app shell and data available offline.
 *
 * - /_next/static/* and icons: cache first (file names are content-hashed).
 * - Page navigations: network first, then the cached copy of that page, then /offline.
 * - Selected GET /api/* (tournament data, the signed-in user): network first, cached copy when offline.
 *   Responses served from the cache carry "X-WarBracket-Offline: 1".
 * - Everything else (mutations, auth, RSC payloads) goes straight to the network. Changes made offline are
 *   queued by the app itself (IndexedDB outbox), not here.
 * The page asks us to drop cached API data on sign-out ("clear-user-data"), so another person using the same
 * device never sees it.
 */

const VERSION = "v2";
const STATIC_CACHE = `wb-static-${VERSION}`;
const PAGE_CACHE = `wb-pages-${VERSION}`;
const API_CACHE = `wb-api-${VERSION}`;
const OFFLINE_URL = "/offline";
// "?v=2": the previous app on this domain served files under the same names with long cache lifetimes.
const PRECACHE = [OFFLINE_URL, "/", "/logo.png?v=2", "/icon-192.png?v=2", "/icon-512.png?v=2"];
const MAX_PAGES = 60;
const MAX_API = 200;
const NETWORK_TIMEOUT_MS = 6000;

// Data worth having at the table without a connection. Personal lists stay online-only on purpose.
const API_CACHEABLE = [
  /^\/api\/me$/,
  /^\/api\/content(\/armies)?$/,
  /^\/api\/tournaments\/mine$/,
  /^\/api\/tournaments\/[0-9a-f-]{36}$/i,
  /^\/api\/tournaments\/[0-9a-f-]{36}\/(participants|rounds|standings|challenges|teams|team-standings|leagues|judge-calls|warbands|warbands\/me)$/i,
  /^\/api\/tournaments\/[0-9a-f-]{36}\/matches\/[0-9a-f-]{36}\/game$/i,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, PAGE_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wb-") && !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data === "clear-user-data") {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (url.search === "" && API_CACHEABLE.some((re) => re.test(url.pathname))) {
      event.respondWith(networkFirst(request, API_CACHE, MAX_API, null));
    }
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, MAX_PAGES, OFFLINE_URL));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, maxEntries, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    // Only complete, successful answers are worth keeping (not redirects to /login, not errors).
    if (response.ok && response.type === "basic" && !response.redirected) {
      await cache.put(request, response.clone());
      trim(cache, maxEntries);
    }
    return response;
  } catch {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return markOffline(hit);
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ status: 503, code: "OFFLINE" }), {
      status: 503,
      headers: { "Content-Type": "application/problem+json", "X-WarBracket-Offline": "1" },
    });
  }
}

function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set("X-WarBracket-Offline", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

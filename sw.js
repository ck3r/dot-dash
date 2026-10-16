/*
 * ============================================================
 * SERVICE WORKER: makes dot-da.sh installable, and usable offline
 * ============================================================
 *
 * Network first, always: online you get exactly what's deployed
 * (no stale pages after an update). Every page and file that
 * loads is also kept in a cache, so with no signal the app opens
 * from what was there last time.
 *
 *   pages (/, /tx/)  kept by path, without the ?/… message,
 *                    since each page reads its message itself
 *   /og/…            the link-preview images: never cached here
 *   other sites      left alone
 *
 * Bump VERSION to clear the old cache after a big change.
 */

const VERSION = "dot-dash-2";

/* fetched on install, so the first offline open works too */
const CORE = [
  "/", "/tx/",
  "/style.css", "/tx/tx.css", "/switch.svg", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/js/main.js", "/js/morse.js", "/js/tree.js", "/js/message.js", "/js/overview.js", "/js/keyer.js",
  "/js/tx.js", "/js/tx-keyer.js", "/js/tx-sound.js", "/js/tx-player.js", "/js/tx-share.js", "/js/tx-outputs.js", "/js/tx-trace.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* one at a time, so a single missing file doesn't stop the install */
    await Promise.all(CORE.map(path => cache.add(path).catch(() => { })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/og/")) return;

  /* a page is kept under its path alone: /?/.-  →  / */
  const key = request.mode === "navigate" ? url.origin + url.pathname : request;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") cache.put(key, response.clone());
      return response;
    } catch {
      const kept = await cache.match(key);
      if (kept) return kept;
      if (request.mode === "navigate") return (await cache.match(url.origin + "/tx/")) ?? Response.error();
      return Response.error();
    }
  })());
});

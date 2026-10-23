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
 * "Network" means the server, not the browser's own cache: each
 * fetch asks the server whether the file has changed (a cheap "not
 * modified" when it hasn't). Without that, a page could arrive fresh
 * while its CSS or a module came from the browser's cache, minutes
 * old, and the two wouldn't match (new keys drawn with old styles).
 *
 *   pages (/, /ref/)  kept by path, without the ?/… message,
 *                    since each page reads its message itself
 *   /og/…            the link-preview images: never cached here
 *   other sites      left alone
 *
 * Bump VERSION to clear the old cache after a big change.
 */

const VERSION = "dot-dash-6";

/* fetched on install, so the first offline open works too */
const CORE = [
  "/", "/ref/",
  "/style.css", "/tx/tx.css", "/switch.svg", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/js/main.js", "/js/morse.js", "/js/tree.js", "/js/overview.js", "/js/keyer.js",
  "/js/tx-keyer.js", "/js/tx-sound.js", "/js/tx-player.js", "/js/tx-share.js", "/js/tx-files.js", "/js/tx-outputs.js", "/js/tx-trace.js",
  "/js/tx/main.js", "/js/tx/dom.js", "/js/tx/state.js", "/js/tx/keyboard.js", "/js/tx/about.js",
  "/js/tx/player.js", "/js/tx/share.js", "/js/tx/settings.js", "/js/tx/tree.js", "/js/tx/layer.js", "/js/tx/tape.js", "/js/tx/keys.js", "/js/tx/typing.js", "/js/tx/media.js", "/js/tx/tab.js",
  "/js/characters.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* each on its own, so a single missing file doesn't stop the
       install; from the server, never the browser's cache, so a new
       version starts with all its files from the same deploy */
    await Promise.all(CORE.map(path => cache.add(new Request(path, { cache: "reload" })).catch(() => { })));
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
      const response = await fetch(request, { cache: "no-cache" });   // checked with the server (above)
      if (response.ok && response.type === "basic") cache.put(key, response.clone());
      return response;
    } catch {
      const kept = await cache.match(key);
      if (kept) return kept;
      if (request.mode === "navigate") return (await cache.match(url.origin + "/")) ?? Response.error();
      return Response.error();
    }
  })());
});

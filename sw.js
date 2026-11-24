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

const VERSION = "dot-dash-25";

/* fetched on install, so the first offline open works too */
const CORE = [
  "/", "/ref/", "/manual/", "/design/", "/extension/", "/bookmarklet/", "/privacy/",
  "/css/base.css", "/css/station.css", "/css/prose.css", "/css/bookmarklet.css", "/js/bookmarklet/main.js", "/switch.svg", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/js/ref/main.js", "/js/shared/nav.js", "/js/shared/nav-tables.js", "/js/core/morse.js", "/js/core/tree.js", "/js/shared/overview.js", "/js/shared/play-marks.js", "/js/shared/tab-keyer.js", "/js/shared/logo.js",
  "/js/core/keyer.js", "/js/shared/sound.js", "/js/shared/playback.js", "/js/core/formats.js", "/js/core/where.js", "/js/shared/offline.js", "/js/shared/files.js", "/js/shared/outputs.js", "/js/shared/trace.js",
  "/js/station/main.js", "/js/shared/dom.js", "/js/station/state.js", "/js/shared/keyboard.js", "/js/station/about.js",
  "/js/station/player.js", "/js/station/share.js", "/js/station/settings.js", "/js/station/tree.js", "/js/station/layer.js", "/js/station/tape.js", "/js/station/keys.js", "/js/station/typing.js", "/js/station/suggest.js", "/js/station/undo.js", "/js/station/media.js", "/js/station/tab.js", "/js/station/stats.js", "/js/station/profile.js", "/js/station/practice.js", "/js/station/wear.js",
  "/js/core/characters.js", "/js/core/voice-times.js", "/js/core/voice-syllables.js", "/js/shared/voice.js", "/js/core/strokes.js", "/js/core/stair.js",
  /* hearing (RX): fetched the first time rx is chosen, kept here so that works offline too */
  "/js/station/rx.js", "/js/core/rx-decoder.js", "/js/station/rx-worklet.js", "/js/core/rx-light.js", "/js/station/rx-eye.js",
  /* key hero (/hero), and what it shares with the station */
  "/hero/", "/css/hero.css", "/js/hero/main.js", "/js/hero/road.js", "/js/hero/message.js", "/js/core/judge.js", "/js/core/keymap.js",
  "/js/game/store.js", "/js/game/clock.js", "/js/game/speed.js", "/js/game/look.js", "/js/game/paddles.js", "/js/game/strikes.js", "/js/game/texts.js", "/js/game/typing.js", "/js/game/chart.js", "/js/game/share.js", "/js/game/link.js",
  "/js/game/win.js",
  /* key dash (/dash): Key hero's page, its own run */
  "/dash/", "/css/dash.css", "/js/dash/main.js",
  /* a character's own page (/ref/k/): what every one of them needs; the pages and their
     pictures are kept as they're visited (there are dozens, and most are never opened) */
  "/css/ref-item.css", "/js/ref/item.js", "/js/ref/pages.js", "/js/ref/phrases.js", "/js/core/phrases.js"
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

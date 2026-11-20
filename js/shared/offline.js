/*
 * Installable, and usable offline: the service worker (/sw.js, which
 * has to sit at the top to look after every page), registered once
 * the page has loaded so it never slows the first visit.
 *
 * Not in the app (core/where.js): every file is on the phone already,
 * and the app's own server answers a folder's address with its
 * index.html (MainActivity) where a service worker's requests would
 * get the station's.
 */
import { inApp } from "../core/where.js";

export function keepOffline() {
  if (!("serviceWorker" in navigator) || inApp()) return;
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { }));
}

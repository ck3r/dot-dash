/*
 * Where this page is running: on the web (dot-da.sh, or a local copy
 * such as localhost:8080 for the checks), or inside the app
 * (apps/mobile: Capacitor puts the site on the phone and serves it
 * from https://localhost, with window.Capacitor beside it).
 *
 *   dot-da.sh, localhost:8080   inApp() false   links: the page's own address
 *   the app                     inApp() true    links: https://dot-da.sh
 *
 * Asked when called, not at import, so it loads with no page.
 */
export const SITE = "https://dot-da.sh";

export const inApp = () => !!globalThis.Capacitor?.isNativePlatform?.();

/* where a link should point: https://localhost means nothing to
   whoever the link is sent to, so from the app, the site */
export const siteOrigin = () => (inApp() ? SITE : globalThis.location?.origin ?? SITE);

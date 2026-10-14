/*
 * ============================================================
 * KEYER — the browser tab transmits the message
 * ============================================================
 *
 * The favicon switch closes on every mark, and the page
 * title types each character as it walks the tree:
 *
 *   signal   ███ █ ███ █
 *   title    T N K C        (each beat revises the guess)
 *
 * Morse timing (units):
 *
 *   dit          1
 *   dah          3
 *   symbol gap   1
 *   char gap     3
 *   word gap     7
 */

import { nodeAt, DECODE } from "./morse.js";


const IDLE_TITLE = "dot-da.sh";

const ACTIVE_FRAME_MS = 210;
const INACTIVE_FRAME_MS = 1000;
const TITLE_LATENCY_MS = 30;


/*
 * ============================================================
 * FAVICONS
 * ============================================================
 *
 * Embedded as data URLs so the browser doesn't fetch a file
 * every time the switch changes.
 */

const FAVICON_OPEN = `
<svg xmlns="http://www.w3.org/2000/svg" width="71" height="79" viewBox="0 0 71 79" fill="none">
  <circle cx="13.6603" cy="52.8063" r="7" transform="rotate(-60 13.6603 52.8063)" stroke="#000" stroke-width="6"/>
  <rect x="16.0214" y="47.2164" width="56" height="7" rx="3.5" transform="rotate(-30 16.0214 47.2164)" fill="#000" stroke="#000"/>
</svg>`;

const FAVICON_CLOSED = `
<svg xmlns="http://www.w3.org/2000/svg" width="71" height="79" viewBox="0 0 71 79" fill="none">
  <defs>
    <filter id="bloom" x="-400%" y="-400%" width="800%" height="800%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="halo" x="-300%" y="-300%" width="600%" height="600%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="2.5"/>
    </filter>
    <radialGradient id="led" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(13.66 52.81) rotate(90) scale(7)">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.18" stop-color="#fff9c4"/>
      <stop offset="0.42" stop-color="#ffe45c"/>
      <stop offset="0.70" stop-color="#ffbf00"/>
      <stop offset="1" stop-color="#e88900"/>
    </radialGradient>
    <radialGradient id="reflection" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
      gradientTransform="translate(13.66 52.81) rotate(90) scale(13)">
      <stop offset="0" stop-color="#ffbf00" stop-opacity="0.45"/>
      <stop offset="0.45" stop-color="#ff9d00" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ff9d00" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="13.6603" cy="52.8063" r="13" fill="#ff9d00" opacity="0.75" filter="url(#bloom)"/>
  <circle cx="13.6603" cy="52.8063" r="13" fill="url(#reflection)"/>
  <circle cx="13.6603" cy="52.8063" r="9" fill="#ffbf00" opacity="0.9" filter="url(#halo)"/>
  <circle cx="13.6603" cy="52.8063" r="8" fill="#000"/>
  <circle cx="13.6603" cy="52.8063" r="6" fill="url(#led)"/>
  <circle cx="11.4" cy="50.4" r="1.6" fill="#ffffff"/>
  <rect x="16.0214" y="47.2164" width="56" height="7" rx="3.5" fill="#000"/>
</svg>`;

const faviconURLs = {
  open:   "data:image/svg+xml," + encodeURIComponent(FAVICON_OPEN),
  closed: "data:image/svg+xml," + encodeURIComponent(FAVICON_CLOSED)
};

const favicon = document.querySelector("#favicon");

let faviconState = null;

function setFavicon(closed) {
  if (faviconState === closed) return;   // only touch the DOM on change
  faviconState = closed;
  favicon.href = closed ? faviconURLs.closed : faviconURLs.open;
}


/*
 * ============================================================
 * TITLE FRAMES
 * ============================================================
 *
 * A finished character stays in the title while the next one
 * traverses the tree. Every mark starts as a dit (go left);
 * a dah's second beat moves right, its third confirms.
 *
 *   dit = 1 frame · dah = 3 frames
 */

function getTitleFrames(words) {
  const frames = [];
  let decoded = "";

  for (const word of words) {
    for (const code of word) {
      let path = "";

      for (const symbol of code) {
        path += ".";
        frames.push(decoded + (nodeAt(path) ?? "�"));

        if (symbol === "-") {
          path = path.slice(0, -1) + "-";
          frames.push(decoded + (nodeAt(path) ?? "�"));
          frames.push(decoded + (nodeAt(path) ?? "�"));
        }
      }

      decoded += DECODE[code] ?? "�";
    }
    decoded += " ";
  }

  decoded = decoded.trimEnd();

  if (frames.length === 0 || frames[frames.length - 1] !== decoded) {
    frames.push(decoded);
  }

  return frames;
}


/*
 * ============================================================
 * KEYER EVENTS
 * ============================================================
 *
 * { state: "closed" | "open", units }
 */

function getKeyerEvents(words) {
  const events = [];

  words.forEach((word, w) => {
    word.forEach((code, c) => {
      [...code].forEach((symbol, s) => {
        events.push({ state: "closed", units: symbol === "." ? 1 : 3 });
        if (s < code.length - 1) events.push({ state: "open", units: 1 });
      });
      if (c < word.length - 1) events.push({ state: "open", units: 3 });
    });
    if (w < words.length - 1) events.push({ state: "open", units: 7 });
  });

  return events;
}


/*
 * ============================================================
 * PLAYBACK
 * ============================================================
 */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let timer = null;
let events = [];
let frames = [];
let eventIndex = 0;
let unit = 0;
let frameIndex = 0;

function frameInterval() {
  return document.hidden ? INACTIVE_FRAME_MS : ACTIVE_FRAME_MS;
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function tick() {

  /* Finished: open switch, final title. */
  if (eventIndex >= events.length) {
    stop();
    setFavicon(false);
    if (frames.length) document.title = frames[frames.length - 1];
    return;
  }

  const event = events[eventIndex];

  setFavicon(event.state === "closed");

  /* Title advances once per closed unit, so a dah holds 3 frames. */
  if (event.state === "closed") {
    const frame = frames[frameIndex++];
    setTimeout(() => {
      if (frame !== undefined) document.title = frame;
    }, TITLE_LATENCY_MS);
  }

  if (++unit >= event.units) {
    eventIndex++;
    unit = 0;
  }
}

function start() {
  stop();
  eventIndex = 0;
  unit = 0;
  frameIndex = 0;

  setFavicon(false);

  if (events.length === 0) {
    document.title = IDLE_TITLE;
    return;
  }

  if (reducedMotion.matches) {
    document.title = frames[frames.length - 1];
    return;
  }

  document.title = "​";   // zero-width: blank tab before the first mark
  tick();
  timer = setInterval(tick, frameInterval());
}


/*
 * Restart at the matching rate when the tab is shown/hidden
 * or the motion preference changes (same as the live site).
 */

document.addEventListener("visibilitychange", start);
reducedMotion.addEventListener("change", start);


export function play(words) {
  frames = getTitleFrames(words);
  events = getKeyerEvents(words);
  start();
}

export function stats() {
  return {
    tab: document.hidden ? "inactive" : "active",
    reducedMotion: reducedMotion.matches,
    titleFrames: frames.length,
    keyerEvents: events.length
  };
}

/*
 * ============================================================
 * KEYER — the browser tab transmits the message
 * ============================================================
 *
 * The site's one tab animation (the reference and the station both
 * use it). The favicon switch closes on every mark, and the page
 * title types each character as it walks the tree:
 *
 *   signal   ███ █ ███ █
 *   title    T N K C        (each beat revises the guess)
 *
 * A long message: the tab keys the first 13 characters, then the
 * switch rests and the title holds them with an ellipsis. (The
 * events carry on to the end, for whatever follows them.)
 *
 * No message (a visit with nothing in the address): the name keys
 * itself instead, in plain text, a dot and a dash at a time:
 *
 *   ▪      dot
 *   ▬      dot-
 *   ▬      dot-da
 *   ▪      dot-da.
 *   ▬      dot-da.sh            (· − − · −, a node with nothing in it)
 *
 * It also announces each step of a message (not the name), so
 * anything else (the trees, later sound or vibration) can follow:
 *
 *   keyer.on(event => …)
 *
 *   { type: "start" }
 *   { type: "beat",   path: ".-" }   every unit a mark is held
 *   { type: "letter", path: ".-" }   letter finished (gap begins)
 *   { type: "word" }                 word gap begins
 *   { type: "end",    path: "." }    message finished
 *   { type: "key",    down: true }   key closed / opened (the switch;
 *                                    name: true while the name keys)
 *
 *   keyer.play(words)   key a message ([] or · − − · − for the name)
 *   keyer.rest()        stop, and the tab says the name
 *   keyer.hold(down)    the station playing: the icon keys the name, on a loop
 *
 * Morse timing (units):
 *
 *   dit          1
 *   dah          3
 *   symbol gap   1
 *   char gap     3
 *   word gap     7
 */

import { nodeAt, DECODE, NAME_CODE } from "./morse.js";


const IDLE_TITLE = "dot-da.sh";

/* browsers redraw a tab's title and icon about this often at best
   (once a second in the background), whatever the page's own speed */
const ACTIVE_FRAME_MS = 210;
const INACTIVE_FRAME_MS = 1000;
const TITLE_LATENCY_MS = 30;

/* the tab keys this many characters, then rests with an ellipsis */
const TAB_CHARS = 13;

/* the name: its five marks (NAME_CODE), and the title as each starts */
const NAME_TITLES = ["dot", "dot-", "dot-da", "dot-da.", "dot-da.sh"];


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

/*
 * A single character also draws its signal as it's keyed:
 *
 *   E █
 *   I █˽˽˽█            dah, first beat: still a dot guess
 *   A █˽˽˽██           second beat: it's a dah after all
 *   A █˽˽˽███
 *   …
 *   J █˽˽˽███˽˽˽███˽˽˽███
 *
 * █ = one unit of key down; ˽˽˽ = the gap between marks
 * (three ˽ are about as wide as one █ in tab titles).
 */

const MARK = "█";
const GAP = "˽˽˽";

/*
 * Single-character titles use Unicode "Mathematical Monospace"
 * letters and digits (𝙰–𝚉, 𝟶–𝟿), so the signal after them
 * doesn't jitter as the letter changes width (I vs W).
 * Punctuation has no monospace version and stays as is.
 */
function mono(ch) {
  if (/^[A-Z]$/.test(ch)) return String.fromCodePoint(0x1D670 + ch.charCodeAt(0) - 65);
  if (/^[0-9]$/.test(ch)) return String.fromCodePoint(0x1D7F6 + ch.charCodeAt(0) - 48);
  return ch;
}

const monoText = str => [...str].map(mono).join("");

/*
 * Full messages: monospace too, and a visible word space.
 * A plain trailing space is trimmed from tab titles, so the
 * word gap used to show nothing; ˽˽ drops in as the gap
 * begins and stays as the separator:
 *
 *   𝙷𝙴𝙻𝙻𝙾  →  𝙷𝙴𝙻𝙻𝙾˽˽  →  𝙷𝙴𝙻𝙻𝙾˽˽𝙴  →  …  𝙷𝙴𝙻𝙻𝙾˽˽𝚆𝙾𝚁𝙻𝙳
 */
const WORD_SPACE = "˽˽";

function getTitleFrames(words) {
  const frames = [];
  const paths = [];
  let decoded = "";

  const single = words.length === 1 && words[0].length === 1;
  let signal = "";

  const frame = path => {
    const at = nodeAt(path) ?? "�";
    frames.push(single ? `${mono(at)} ${signal}` : monoText(decoded + at));
    paths.push(path);
  };

  for (const word of words) {
    for (const code of word) {
      let path = "";

      for (const symbol of code) {
        path += ".";
        signal += (signal ? GAP : "") + MARK;
        frame(path);

        if (symbol === "-") {
          path = path.slice(0, -1) + "-";
          signal += MARK;
          frame(path);
          signal += MARK;
          frame(path);
        }
      }

      decoded += DECODE[code] ?? "�";
    }
    decoded += WORD_SPACE;
  }

  decoded = decoded.slice(0, -WORD_SPACE.length);
  decoded = single ? `${mono(decoded)} ${signal}` : monoText(decoded);

  if (frames.length === 0 || frames[frames.length - 1] !== decoded) {
    frames.push(decoded);
  }

  return { frames, paths };
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
        events.push({ state: "closed", units: symbol === "." ? 1 : 3, code });
        if (s < code.length - 1) events.push({ state: "open", units: 1 });
      });
      if (c < word.length - 1) events.push({ state: "open", units: 3, code });
    });
    if (w < words.length - 1) events.push({ state: "open", units: 7, code: word[word.length - 1] });
  });

  return events;
}


/*
 * ============================================================
 * THE SWITCH
 * ============================================================
 */

let faviconState = null;
let held = false;    // the station playing: the icon keys the name, on a loop

/* the icon alone, nothing told (the playing loop) */
function showIcon(closed) {
  if (faviconState === closed) return;   // only touch the DOM on change
  faviconState = closed;
  const favicon = document.querySelector("#favicon");
  if (favicon) favicon.href = closed ? faviconURLs.closed : faviconURLs.open;
}

function setFavicon(closed) {
  if (held) return;                      // the playing loop has the icon
  if (faviconState === closed) return;
  showIcon(closed);
  emit({ type: "key", down: closed, name: quiet });   // anything else drawing the switch follows
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
let paths = [];
let eventIndex = 0;
let quiet = false;     // the name: no events for the trees
let capAt = -1;        // the event where the tab's 13 characters are done
let capped = false;

const listeners = [];

function emit(event) {
  if (quiet && event.type !== "key") return;
  for (const fn of listeners) fn(event);
}

function lastCode() {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].code) return events[i].code;
  return null;
}
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

/* the title, unless the tab has rested at its 13 characters */
function title(text) {
  if (capped) return;
  setTimeout(() => { if (!capped) document.title = text; }, TITLE_LATENCY_MS);
}

/* where the tab ends up: the last frame, or the 13 characters and … */
function lastTitle() {
  if (!frames.length) return IDLE_TITLE;
  if (capAt < 0) return frames[frames.length - 1];
  let n = 0;
  for (let i = 0; i < capAt; i++) if (events[i].state === "closed") n += events[i].units;
  return frames[n - 1] + "…";
}

function tick() {

  /* Finished: open switch, final title. */
  if (eventIndex >= events.length) {
    stop();
    setFavicon(false);
    if (frames.length && !capped) document.title = frames[frames.length - 1];
    emit({ type: "end", path: lastCode() });
    return;
  }

  /* 13 characters keyed: the switch rests, the title says there's more */
  if (eventIndex === capAt && unit === 0) {
    setFavicon(false);
    document.title = lastTitle();
    capped = true;
    if (!listeners.length) return stop();   // nothing else follows: done
  }

  const event = events[eventIndex];

  if (!capped) setFavicon(event.state === "closed");

  /*
   * The word space is painted once the last letter's own
   * 3-unit gap has passed (3 units into the 7-unit word gap),
   * the same rhythm as every other character.
   */
  if (event.state === "open" && event.units === 7 && unit === 3) {
    const shown = frames[frameIndex - 1];
    if (shown !== undefined) title(shown + WORD_SPACE);
  }

  /* A gap is announced as it begins. */
  if (event.state === "open" && unit === 0) {
    if (event.units >= 3) emit({ type: "letter", path: event.code });
    if (event.units === 7) emit({ type: "word" });
  }

  /* Title advances once per closed unit, so a dah holds 3 frames. */
  if (event.state === "closed") {
    const frame = frames[frameIndex];
    const path = paths[frameIndex];
    frameIndex++;

    emit({ type: "beat", path });
    if (frame !== undefined) title(frame);
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
  capped = false;

  setFavicon(false);
  emit({ type: "start" });

  if (events.length === 0) {
    document.title = IDLE_TITLE;
    emit({ type: "end", path: null });
    return;
  }

  /* reduced motion, or held (the station playing): the last title */
  if (reducedMotion.matches || held) {
    document.title = lastTitle();
    emit({ type: "end", path: lastCode() });
    return;
  }

  document.title = "\u200b";   // zero-width: blank tab before the first mark
  tick();
  timer = setInterval(tick, frameInterval());
}


/*
 * Restart at the matching rate when the tab is shown/hidden
 * or the motion preference changes (same as the live site).
 */

document.addEventListener("visibilitychange", start);
reducedMotion.addEventListener("change", start);


/* where the tab's 13 characters end: the gap after the 13th */
function findCap(evs) {
  let chars = 0;
  for (let i = 0; i < evs.length; i++) {
    if (evs[i].state === "open" && evs[i].units >= 3 && ++chars === TAB_CHARS) return i;
  }
  return -1;
}

export function play(words) {
  /* no message, or the name's own marks: the name keys itself */
  if (!words.length || (words.length === 1 && words[0].length === 1 && words[0][0] === NAME_CODE)) return greet();
  quiet = false;
  ({ frames, paths } = getTitleFrames(words));
  events = getKeyerEvents(words);
  capAt = findCap(events);
  start();
}

/* the name, keying itself: the marks of · − − · −, its own titles */
function greet() {
  quiet = true;
  events = getKeyerEvents([[NAME_CODE]]);
  frames = [];
  [...NAME_CODE].forEach((m, i) => { for (let u = 0; u < (m === "." ? 1 : 3); u++) frames.push(NAME_TITLES[i]); });
  paths = frames.map(() => null);
  capAt = -1;
  start();
}

/* stop, and the tab just says the name (the station: a new message) */
export function rest() {
  events = [];
  frames = [];
  capAt = -1;
  start();
}

/*
 * The station playing: the tab can't keep pace with the message
 * itself, so the icon keys the name instead, · − − · − and a word
 * space, round and round until it stops; the title stays as it is
 * (a greeting or a link still keying cuts to its last title).
 *
 *   ▮ ▮▮▮ ▮▮▮ ▮ ▮▮▮ _______  ▮ ▮▮▮ …
 */
const PLAYING = [...NAME_CODE].flatMap((m, i) => [...(i ? [false] : []), ...Array(m === "." ? 1 : 3).fill(true)])
  .concat(Array(7).fill(false));
let playTimer = null;

export function hold(down) {
  if (held === down) return;
  if (down) {
    if (timer) { stop(); document.title = lastTitle(); }
    held = true;
    let u = 0;
    showIcon(PLAYING[0]);
    playTimer = setInterval(() => showIcon(PLAYING[++u % PLAYING.length]), frameInterval());
  } else {
    clearInterval(playTimer);
    held = false;
    showIcon(false);
  }
}

export function on(fn) {
  listeners.push(fn);
}

export function stats() {
  return {
    tab: document.hidden ? "inactive" : "active",
    reducedMotion: reducedMotion.matches,
    titleFrames: frames.length,
    keyerEvents: events.length
  };
}

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
import { logoSVG } from "./logo.js";


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
 * The logo (js/logo.js), and its key: at rest a paper switch on a
 * bakelite disc, the lever up; a mark shuts it and flips the
 * colours, as the extension's toolbar icon does. site/switch.svg is
 * the open one, for the page as it loads. Data URLs, so the browser
 * doesn't fetch a file every time the switch changes.
 */

const FAVICON_OPEN = logoSVG();
const FAVICON_CLOSED = logoSVG({ closed: true });

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

/*
 * Title frames stop with the 13th character: past it the title
 * rests (lastTitle, below), so later frames were never shown, and
 * each holding the whole text so far made a long message (an
 * article brought in to practise on) cost seconds before the
 * station was ready. The paths go on to the end, one per beat, for
 * whatever follows them.
 */
function getTitleFrames(words) {
  const frames = [];
  const paths = [];
  let decoded = "";
  let chars = 0;          // characters done

  const single = words.length === 1 && words[0].length === 1;
  let signal = "";

  const frame = path => {
    const at = nodeAt(path) ?? "�";
    if (chars < TAB_CHARS) frames.push(single ? `${mono(at)} ${signal}` : monoText(decoded + at));
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

      if (++chars > TAB_CHARS) continue;
      decoded += DECODE[code] ?? "�";
    }
    if (chars <= TAB_CHARS) decoded += WORD_SPACE;
  }
  if (chars > TAB_CHARS) return { frames, paths };   // capped: no final title

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

/* the title, unless the tab has rested at its 13 characters (or is
   out of sight: a frame still on its way is dropped) */
function title(text) {
  if (capped || document.hidden) return;
  setTimeout(() => { if (!capped && !document.hidden) document.title = text; }, TITLE_LATENCY_MS);
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

  /*
   * Out of sight (another tab, the window minimised): no keying, the
   * tab just says the name, whole, among the others; back in view,
   * the message keys again from the start.
   *
   *   [ dot-da.sh ] [ mail ] [ docs ]      not   [ ..-  di ] [ mail ]
   */
  if (document.hidden) {
    document.title = IDLE_TITLE;
    emit({ type: "end", path: lastCode() });
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
 * Hidden, the tab rests on the name; shown, it starts again; and the
 * motion preference changing starts it again too.
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

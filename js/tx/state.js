/*
 * The station's shared state, in one object, so every part of the
 * station can read and change it (a module can't reassign another
 * module's variables, but it can change an object they share).
 *
 *   createState() → {
 *     tokens        the message being keyed, exactly what was pressed
 *     took          how each token was keyed, in step with tokens
 *     history       the tape: sent messages, oldest first
 *     mode          "key" (Morse) or "type" (text)
 *     typed         what's been typed, in type mode
 *     hidden        the eye: hide the row you're not entering
 *     collapsed     and hidden all the way: that row takes no room
 *     keyMode       tap, straight, bug, iambic-a / -b, ultimatic
 *     inputAway     read mode: the keys put away
 *     localCleared  a space was pressed: the tree starts fresh
 *     playKey       which message the player has loaded (or null)
 *     playEntry     and where it is: "current" or a history index
 *     lastInput     when the last key went in (the caret holds steady)
 *
 *     saveHistory()          keep the tape on this device
 *     entry()                the line as a tape entry (null if empty)
 *     addToHistory(entry)    onto the tape (the last 25), kept
 *     saveLine(), savedLine()  the unsent line, kept on this device
 *     record(type, detail)   add to the event log
 *     on(fn) → off           hear every event from now on
 *     events                 the last few hundred, oldest first
 *   }
 *
 * The message is a list of tokens:
 *
 *   .  -     a mark
 *   " "      letter space   (closes the letter being keyed)
 *   /        word space
 *
 *   [".", ".", ".", ".", " ", ".", "/", ".", "-", "-"]
 *        H                  E   /    W (so far: .--)
 *
 * so undo is simply "drop the last token". Everything shown is
 * worked out from the tokens on every change.
 *
 * Sent messages go on the tape (history): the last 25, kept on
 * this device, stored as Morse in the URL's canonical form
 * (lossless: prosigns and codes with no letter survive).
 */
import { DECODE, format } from "../morse.js";

const HISTORY_KEY = "dot-dash:tx-history";
const LINE_KEY = "dot-dash:tx-line";
export const HISTORY_MAX = 25;

export const isMark = t => t === "." || t === "-";

/*
 * How each token was actually keyed (timed modes): for a mark,
 * { on, gap } in ms; null for spaces and for anything tapped or
 * typed. Kept in step with tokens, so undo takes both, and saved
 * with the message so playback can replay YOUR timing.
 */

/* the recorded timing, one [on, gap] (or null) per mark; [] if none */
export function recOf(toks, times) {
  const rec = toks.map((t, i) => (isMark(t) ? times[i] : undefined)).filter(x => x !== undefined)
    .map(x => (x ? (x.unit ? [x.on, x.gap, x.unit] : [x.on, x.gap]) : null));
  return rec.some(Boolean) ? rec : [];
}

/* lay a recording back over tokens (recall from history) */
export function tookFor(toks, rec = []) {
  let k = 0;
  return toks.map(t => {
    if (!isMark(t)) return null;
    const r = rec[k++];
    return r ? { on: r[0], gap: r[1], unit: r[2] } : null;
  });
}

/* history entries: plain Morse, or { m: Morse, t: recording } */
export const morseOf = e => (typeof e === "string" ? e : e.m);
export const recOfEntry = e => (typeof e === "string" ? [] : e.t ?? []);

/* tokens → { done: finished words, word: letters of the word in
   progress, path: the letter being keyed, slash: ends in "/" } */
export function structure(toks) {
  const done = [];
  let word = [];
  let path = "";
  for (const t of toks) {
    if (t === "." || t === "-") path += t;
    else if (t === " ") { if (path) word.push(path); path = ""; }
    else if (t === "/") {
      if (path) word.push(path);
      path = "";
      if (word.length) done.push(word);
      word = [];
    }
  }
  return { done, word, path, slash: toks[toks.length - 1] === "/" };
}

/* the whole message as words of codes (the letter in progress counts) */
export function wordsOf(toks) {
  const { done, word, path } = structure(toks);
  const last = path ? [...word, path] : word;
  return last.length ? [...done, last] : done;
}

export function tokensOf(words) {
  const out = [];
  words.forEach((word, w) => {
    if (w) out.push("/");
    word.forEach((code, c) => {
      if (c) out.push(" ");
      out.push(...code);
    });
  });
  if (out.length) out.push(" ");   // the last letter is finished
  return out;
}

/* words as plain text, or null if it isn't cleanly typeable */
export function plainText(words) {
  const names = words.map(w => w.map(c => DECODE[c]));
  if (names.flat().some(n => !n || (n.length > 1 && !n.startsWith("<")))) return null;   // a prosign, <SK>, is one letter
  return names.map(w => w.join("")).join(" ");
}

/*
 * The event log: one place that records what happened, as it
 * happens:
 *
 *   mark    { mark, timing }    a dit or dah keyed (timing: null if tapped)
 *   letter / word / undo        a space, a word break, a step back
 *   word-back                   undo held: a word back
 *   erase                       the error prosign (HH) erased a word
 *   type    { char }            a key on the text keyboard
 *   send    { morse }           a message onto the tape
 *   play    { entry }           the player started
 *   clear                       the line, or the whole history, cleared
 *
 * Nothing on the page listens yet; the tape, the tree, the about
 * column and (later) a profile's metrics can, without touching the
 * code that keys.
 */
const LOG_MAX = 500;

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [];
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

/* one setting for both modes: "hide the row I'm not entering"
   (keying: the letters; typing: the Morse); an older version kept
   one per mode */
function loadHidden() {
  try {
    const saved = JSON.parse(localStorage.getItem("dot-dash:tx-hide"));
    if (saved === "collapsed") return { hidden: true, collapsed: true };
    return { hidden: typeof saved === "boolean" ? saved : !!(saved && (saved.key || saved.type)), collapsed: false };
  } catch { return { hidden: false, collapsed: false }; }
}

export function createState() {
  const listeners = new Set();
  const events = [];

  return {
    tokens: [],
    took: [],
    history: loadHistory(),
    mode: "key",
    typed: "",
    ...loadHidden(),   // hidden, collapsed
    keyMode: "tap",
    inputAway: false,
    localCleared: false,
    playKey: null,
    playEntry: null,
    lastInput: -Infinity,

    saveHistory() {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history)); } catch { /* storage blocked */ }
    },

    /* the line as the tape keeps it: plain Morse, or with the keying */
    entry() {
      const words = wordsOf(this.tokens);
      if (!words.length) return null;
      const rec = recOf(this.tokens, this.took);
      return rec.length ? { m: format(words), t: rec } : format(words);
    },

    addToHistory(entry) {
      this.history.push(entry);
      while (this.history.length > HISTORY_MAX) this.history.shift();
      this.saveHistory();
    },

    /*
     * The line not yet sent is kept too, as the tape is: a reload
     * doesn't lose it, and a link arriving over it (dot-da.sh/?/…)
     * puts it on the tape first, rather than wiping it out.
     */
    saveLine() {
      const entry = this.entry();
      try {
        if (entry) localStorage.setItem(LINE_KEY, JSON.stringify(entry));
        else localStorage.removeItem(LINE_KEY);
      } catch { /* storage blocked */ }
    },
    savedLine() {
      try {
        const entry = JSON.parse(localStorage.getItem(LINE_KEY));
        return typeof entry === "string" || typeof entry?.m === "string" ? entry : null;
      } catch { return null; }
    },

    events,
    record(type, detail = {}) {
      const event = { type, at: performance.now(), ...detail };
      events.push(event);
      if (events.length > LOG_MAX) events.shift();
      for (const fn of listeners) fn(event);
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

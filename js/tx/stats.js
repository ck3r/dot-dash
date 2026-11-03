/*
 * Your keying, counted: totals kept on this device, built only from
 * the event log (state.js), so nothing that keys knows it's here.
 *
 *   createStats({ state }) → {
 *     read()        the totals, and what's worked out from them
 *     clear()       start counting again from now
 *   }
 *
 * What it hears, and what it keeps:
 *
 *   mark ·  mark −      marks, and the letter being keyed
 *   letter / word       a letter closed: counted, by character;
 *                       timed, its speed too
 *   undo, word-back,    fixes
 *   erase (HH)
 *   send                a line returned, with something keyed on it
 *
 * Speed comes from timed keys only (straight, bug, a paddle): a
 * letter's marks and the gaps inside it, against the units it should
 * take. A tap has no timing, so tapping counts letters, not speed.
 *
 *        ─── ·   ───          K: 3 + 1 + 1 + 1 + 3 = 9 units
 *        └──── 540 ms ───┘    9 units in 540 ms: 60 ms a unit, 20 wpm
 *
 * Kept as one small record in localStorage; never sent anywhere.
 */
import { DECODE } from "../morse.js";

const KEY = "dot-dash:stats";

/* the last this many timed letters make "your speed" */
const RECENT = 50;

/* a gap longer than a word space (7 units) is a pause, not keying */
const PAUSE_UNITS = 7;

const fresh = () => ({ since: new Date().toISOString(), marks: 0, letters: 0, words: 0, lines: 0, fixes: 0, ms: 0, chars: {}, timed: {}, recent: [] });

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && typeof saved.marks === "number" ? { ...fresh(), ...saved } : fresh();
  } catch { return fresh(); }
}

/* the units a code takes, its own gaps included: K -.- is 9 */
const unitsOf = code => [...code].reduce((n, m) => n + (m === "-" ? 3 : 1), 0) + code.length - 1;

export function createStats({ state }) {
  let s = load();
  let path = "", times = [], inWord = 0, onLine = 0;

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  };

  /* a letter closed: counted, and timed if every mark was */
  function closeLetter() {
    if (!path) return;
    const ch = DECODE[path];
    s.letters++;
    inWord++;
    if (ch) s.chars[ch] = (s.chars[ch] ?? 0) + 1;
    if (times.length === path.length && times.every(Boolean)) {
      /* the first mark's gap is the space before the letter: not its own */
      const ms = times.reduce((n, t, i) => n + t.on + (i ? t.gap : 0), 0);
      const units = unitsOf(path);
      if (ms > 0) {
        s.recent.push(Math.round(1200 * units / ms));
        if (s.recent.length > RECENT) s.recent.shift();
        if (ch) {
          const [u, m, n] = s.timed[ch] ?? [0, 0, 0];
          s.timed[ch] = [u + units, m + ms, n + 1];
        }
      }
    }
    path = "";
    times = [];
    save();
  }

  state.on(event => {
    switch (event.type) {
      case "mark": {
        s.marks++;
        onLine++;
        path += event.mark;
        times.push(event.timing);
        const t = event.timing;
        if (t) s.ms += t.on + Math.min(t.gap ?? 0, PAUSE_UNITS * (t.unit || 60));
        break;
      }
      case "letter":
        closeLetter();
        break;
      case "word":
        closeLetter();
        if (inWord) s.words++;
        inWord = 0;
        save();
        break;
      case "undo": case "word-back": case "erase":
        s.fixes++;
        path = "";
        times = [];
        save();
        break;
      case "send":
        closeLetter();
        if (inWord) s.words++;
        if (onLine) s.lines++;
        inWord = onLine = 0;
        save();
        break;
    }
  });

  function read() {
    const sorted = [...s.recent].sort((a, b) => a - b);
    const speed = sorted.length >= 5 ? sorted[Math.floor(sorted.length / 2)] : null;
    const most = Object.entries(s.chars).sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
    /* the slowest, by time per unit, among letters keyed timed at
       least three times (fewer is luck, not a habit) */
    const slowest = Object.entries(s.timed)
      .filter(([, [, , n]]) => n >= 3)
      .map(([ch, [u, m]]) => [ch, m / u])
      .sort((a, b) => b[1] - a[1])
      .map(([ch]) => ch);
    return { ...s, speed, most, slowest };
  }

  function clear() {
    s = fresh();
    path = "";
    times = [];
    inWord = onLine = 0;
    save();
  }

  return { read, clear };
}

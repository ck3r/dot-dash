/*
 * ============================================================
 * TX KEYER — turns presses into timed marks
 * ============================================================
 *
 * Six ways to key (the "key" setting):
 *
 *   tap         untimed: each press is a mark (handled by the page)
 *   straight    one key; how long it's held decides . or -,
 *               how long you wait decides letter or word space
 *   bug         dit side repeats dits by itself while held;
 *               dah side is a straight key (you time it)
 *   iambic A    two paddles; hold = repeat, squeeze = alternate
 *               .-.-  ; let go and it stops after the current mark
 *   iambic B    like A, but letting go of a squeeze sends one
 *               more opposite mark
 *   ultimatic   squeeze = the paddle pressed LAST wins, repeating
 *
 * Paddle modes remember a press of the other paddle made during
 * a mark ("paddle memory") and send it next.
 *
 * Timing (PARIS standard): one unit = 1200 / wpm ms.
 *
 *   dit 1 · dah 3 · gap inside a letter 1
 *   letter gap 3 · word gap 7      (stretched by Farnsworth)
 *
 * The keyer decides at the midpoints:
 *
 *   held   ├── . ──┼── - ───────▶        2 units
 *   wait   ├─ 1 ─┼─ ˽ ─┼─ / ────▶        between 1 and the letter gap,
 *                                         between letter and word gap
 *
 * The page gives it callbacks; the keyer never touches the DOM:
 *
 *   mark(m, took)      a mark was keyed ("." or "-"), with how it was
 *                      actually keyed: { on, gap } in ms (gap = the
 *                      wait since the previous mark ended, null if
 *                      none), so playback can replay YOUR timing
 *   gap(kind)          "letter" or "word": the wait was long enough
 *   signal(down)       the key is closed / open (logo, later sound)
 *   train(event)       for the timing bar: { phase, t0, ... }
 *   timing()           current { unit, letterAt, wordAt, ... } in ms
 */

/* Farnsworth: letters at `wpm`, gaps stretched so the overall
   speed is `fwpm` (ARRL formula). Returns ms. */
export function timing(wpm, fwpm = wpm) {
  const unit = 1200 / wpm;
  let letter = 3 * unit;
  let word = 7 * unit;
  if (fwpm < wpm) {
    const ta = (60 * wpm - 37.2 * fwpm) / (wpm * fwpm);   // seconds of spacing per word
    letter = (3 * ta / 19) * 1000;
    word = (7 * ta / 19) * 1000;
  }
  return {
    unit,
    letter,
    word,
    dahAt: 2 * unit,                    // held longer than this = dah
    letterAt: (unit + letter) / 2,      // waited longer = letter ends
    wordAt: (letter + word) / 2         // waited longer = word ends
  };
}

export const MODES = ["tap", "straight", "bug", "iambic-a", "iambic-b", "ultimatic"];

const other = m => (m === "." ? "-" : ".");


const realClock = {
  now: () => performance.now(),
  set: (fn, ms) => setTimeout(fn, ms),   // wrapped: the browser's timers must be called unbound
  clear: id => clearTimeout(id)
};

export function createKeyer(cb, clock = realClock) {
  let mode = "tap";

  const held = { ".": false, "-": false };
  let lastPressed = null;

  /* straight key (and the bug's dah side) */
  let downAt = null;

  /* paddle / bug element loop */
  let busy = false;
  let current = null;
  let squeezed = false;
  const memory = { ".": false, "-": false };

  let gapTimers = [];
  let loopTimer = null;

  /* when the last mark ended (to measure the gap before the next) */
  let lastEnd = null;
  const gapFrom = start => (lastEnd === null ? null : Math.round(start - lastEnd));

  function clearGaps() {
    gapTimers.forEach(clock.clear);
    gapTimers = [];
  }

  /* after the last mark ends: wait to see if it's a letter or word space */
  function startGaps(from) {
    const t = cb.timing();
    const elapsed = clock.now() - from;
    gapTimers.push(clock.set(() => cb.gap("letter"), Math.max(0, t.letterAt - elapsed)));
    gapTimers.push(clock.set(() => cb.gap("word"), Math.max(0, t.wordAt - elapsed)));
    cb.train({ phase: "gap", t0: from });
  }

  /* ---------- straight key ---------- */

  function closeStraight() {
    downAt = clock.now();
    cb.signal(true);
    cb.train({ phase: "hold", t0: downAt });
  }

  function openStraight() {
    if (downAt === null) return;
    const now = clock.now();
    const mark = now - downAt >= cb.timing().dahAt ? "-" : ".";
    const took = { on: Math.round(now - downAt), gap: gapFrom(downAt) };
    downAt = null;
    lastEnd = now;
    cb.signal(false);
    cb.mark(mark, took);
    startGaps(now);
  }

  /* ---------- generated marks (bug dits, paddles) ---------- */

  function element(m) {
    busy = true;
    current = m;
    memory[m] = false;
    squeezed = held["."] && held["-"];
    const t = cb.timing();
    const on = m === "." ? t.unit : 3 * t.unit;
    const start = clock.now();

    cb.signal(true);
    cb.mark(m, { on: Math.round(on), gap: gapFrom(start) });
    cb.train({ phase: "send", t0: start, mark: m, length: on });

    loopTimer = clock.set(() => {
      cb.signal(false);
      const end = clock.now();
      lastEnd = end;
      /* the 1-unit space inside a letter, then decide what's next */
      loopTimer = clock.set(() => next(end), t.unit);
    }, on);
  }

  function next(markEnd) {
    const both = held["."] && held["-"];
    let n = null;

    if (mode === "bug") {
      n = held["."] ? "." : null;
    } else if (memory[other(current)]) {
      /* paddle memory comes first: the other paddle was tapped
         during this mark, so it goes next even if this one is held */
      n = other(current);
    } else if (mode === "ultimatic") {
      n = both ? lastPressed : held["."] ? "." : held["-"] ? "-" : null;
    } else {
      /* iambic: squeeze alternates */
      n = both ? other(current) : held["."] ? "." : held["-"] ? "-" : null;
    }

    if (!n && mode === "iambic-b" && squeezed) n = other(current);   // the B-mode bonus mark

    if (n) {
      element(n);
    } else {
      busy = false;
      current = null;
      startGaps(markEnd);
    }
  }

  /* ---------- presses ---------- */

  function down(side) {
    if (held[side]) return;
    held[side] = true;
    lastPressed = side;
    clearGaps();

    if (mode === "straight") {
      if (downAt === null) closeStraight();   // either pad is the key
      return;
    }

    if (mode === "bug" && side === "-") {
      if (!busy) closeStraight();
      return;
    }

    /* bug dits and paddles */
    if (busy) {
      if (held["."] && held["-"]) squeezed = true;
      if (side !== current) memory[side] = true;
      return;
    }
    element(side);
  }

  function up(side) {
    if (!held[side]) return;
    held[side] = false;

    if (mode === "straight") {
      if (!held["."] && !held["-"]) openStraight();
      return;
    }
    if (mode === "bug" && side === "-") openStraight();
  }

  /* stop waiting for a letter / word space (undo, a space key):
     the timing of the message so far is kept */
  function cancel() {
    clearGaps();
    cb.train({ phase: null });
  }

  /* drop everything (mode change, page hidden, message sent) */
  function reset() {
    lastEnd = null;
    clearGaps();
    if (loopTimer) clock.clear(loopTimer);
    loopTimer = null;
    busy = false;
    current = null;
    downAt = null;
    held["."] = held["-"] = false;
    memory["."] = memory["-"] = false;
    cb.signal(false);
    cb.train({ phase: null });
  }

  function setMode(next) {
    reset();
    mode = next;
  }

  return { down, up, cancel, reset, setMode, get mode() { return mode; } };
}

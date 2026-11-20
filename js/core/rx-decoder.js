/*
 * ============================================================
 * RX — hearing Morse   (dot-da.sh)
 * ============================================================
 *
 * Sound in, marks and spaces out. No page, no microphone in here:
 * samples arrive as numbers and what's heard leaves as ".", "-",
 * "letter" and "word", so the station, a file and a check all use
 * the same ears.
 *
 *   samples ─► detector ─► key down / up ─► reader ─► . - ˽ /
 *              (is the tone on?)            (which mark? which space?)
 *
 *   createDetector({ sampleRate, key, tick, level })   the tone, on or off
 *   createReader({ unit, expect, mark, space })        on and off, read as Morse
 *   createHearing({ sampleRate, unit, … })             the two, joined
 *   hear(samples, sampleRate, { unit })                a whole recording → { morse, wpm, fwpm, pitch, wave }
 *
 * Times are milliseconds counted from the samples themselves, never
 * the clock: a busy page hears late, not wrong.
 */

/*
 * THE DETECTOR
 *
 * A Goertzel filter answers one question cheaply: how much of this
 * pitch is in these samples? A row of them, 300 to 1200 Hz, finds
 * the strongest pitch (nobody tells us what the sender's is), and
 * that one is followed.
 *
 * The tone's loudness isn't known either, and it fades. So two
 * levels are followed: the floor (how loud "nothing" is) and the
 * peak (how loud the tone is, lately). The key is down above about
 * half way between them, up again under a third: the space between
 * stops a wavering tone from chattering.
 *
 *   peak  ─────────╮      ╭────────────
 *                  │      │
 *   on    ┄┄┄┄┄┄┄┄┄│┄┄┄┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄   half way
 *   off   ┄┄┄┄┄┄┄┄┄│┄┄┄┄┄┄│┄┄┄┄┄┄┄┄┄┄┄┄   a third
 *   floor ─────────╯      ╰────────────
 *
 * A clap or a knock is loud at every pitch at once; a tone is loud
 * at one. So the key only goes down when a fair share of ALL the
 * sound is at the pitch followed ("pure" below).
 *
 * The tone's shape, too (`wave`): a sine is its pitch and nothing
 * else; the others carry it again at twice and three times the
 * pitch, each in its own measure:
 *
 *              at 2x     at 3x
 *   sine         0         0
 *   triangle     0        1/9
 *   square       0        1/3
 *   sawtooth    1/2       1/3
 *
 * measured while the key's down, less what's there while it's up
 * (noise has something at every pitch). A guess: a small speaker and
 * a microphone both colour a tone on the way.
 */
const WINDOW_MS = 8;        // each look: short enough for a 40 wpm dit (30 ms)
const HOP_MS = 4;           // looks overlap by half: edges land within 4 ms
const SETTLE = 3;           // looks in a row before the key changes (12 ms): a crackle isn't a mark
const PITCHES = [];
for (let f = 300; f <= 1200; f += 50) PITCHES.push(f);
const PURE = 0.05;          // the pitch's share of all the sound, to go down
const STAND_OUT = 3;        // the peak over the floor, for there to be a signal at all
const QUIET = 1e-4;         // under this, it's silence whatever the ratio

export function createDetector({ sampleRate, key = () => { }, tick = () => { }, level = () => { } }) {
  const size = Math.max(16, Math.round(sampleRate * WINDOW_MS / 1000));
  const hop = Math.max(8, Math.round(sampleRate * HOP_MS / 1000));
  const hopMs = hop * 1000 / sampleRate;
  const coeff = PITCHES.map(f => 2 * Math.cos(2 * Math.PI * f / sampleRate));
  const ring = new Float32Array(size);
  const score = new Float64Array(PITCHES.length);   // each pitch's power, lately
  let at = 0, filled = 0, sinceLook = 0, seen = 0;  // seen: samples so far
  let pitch = 0;                                    // index into PITCHES
  let floor = 0, peak = 0;
  let down = false, run = 0, runFrom = 0;

  /* the pitch and its next two, each look, through a window that
     fades in and out (a plain one lets a strong pitch spill into
     its neighbours, which is exactly what's being measured) */
  const fade = Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const partsDown = [0, 0, 0], partsUp = [0, 0, 0];
  let downLooks = 0;
  function parts(into) {
    for (let k = 0; k < 3; k++) {
      const f = PITCHES[pitch] * (k + 1);
      if (f > sampleRate * 0.45) { into[k] += (0 - into[k]) * 0.05; continue; }
      const c = 2 * Math.cos(2 * Math.PI * f / sampleRate);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < size; i++) {
        const s0 = ring[(at + i) % size] * fade[i] + c * s1 - s2;
        s2 = s1; s1 = s0;
      }
      into[k] += (s1 * s1 + s2 * s2 - c * s1 * s2 - into[k]) * 0.05;
    }
  }

  function look() {
    const now = seen * 1000 / sampleRate;
    let energy = 0, best = 0, bestPower = 0, power = 0;
    for (let i = 0; i < size; i++) { const x = ring[(at + i) % size]; energy += x * x; }
    for (let p = 0; p < PITCHES.length; p++) {
      let s1 = 0, s2 = 0;
      const c = coeff[p];
      for (let i = 0; i < size; i++) {
        const s0 = ring[(at + i) % size] + c * s1 - s2;
        s2 = s1; s1 = s0;
      }
      const pw = s1 * s1 + s2 * s2 - c * s1 * s2;
      score[p] = score[p] * 0.997 + pw;
      if (score[p] > bestPower) { bestPower = score[p]; best = p; }
      if (p === pitch) power = pw;
    }
    /* another pitch takes over only when it's clearly the stronger */
    if (best !== pitch && score[best] > 1.5 * score[pitch]) {
      pitch = best;
      partsDown.fill(0); partsUp.fill(0); downLooks = 0;
      return;                       // this look was measured at the old pitch: the next one counts
    }
    const a = 2 * Math.sqrt(Math.max(power, 0)) / size;               // the tone's amplitude
    const pure = energy > 0 ? 2 * power / (size * energy) : 0;        // 1: nothing but the tone
    /* the floor falls fast and rises slowly; the peak, the other way */
    floor += (a - floor) * (a < floor ? 0.1 : 0.002);
    /* (a tone that's fading is followed down while it's on: the next
       mark is measured against this one, not one from seconds ago) */
    peak += (a - peak) * (a > peak ? 0.2 : down ? 0.08 : 0.0015);
    const span = peak - floor;
    const there = peak > QUIET && peak > floor * STAND_OUT;
    const want = there && (down ? a > floor + span * 0.3 : a > floor + span * 0.45 && pure > PURE);
    if (want !== down) {
      if (!run) runFrom = now - hopMs;       // it changed somewhere in the hop just heard
      if (++run >= SETTLE) {
        down = want;
        run = 0;
        key(down, Math.max(0, runFrom));
      }
    } else {
      run = 0;
      if (there) { parts(down ? partsDown : partsUp); if (down) downLooks++; }
    }
    tick(now);
    level({ at: now, level: there && span > 0 ? Math.max(0, Math.min(1, (a - floor) / span)) : 0, down });
  }

  return {
    /* a Float32Array (or anything indexed) of samples, any length */
    feed(samples) {
      for (let i = 0; i < samples.length; i++) {
        ring[at] = samples[i];
        at = (at + 1) % size;
        seen++;
        if (filled < size) filled++;
        if (++sinceLook >= hop && filled === size) { sinceLook = 0; look(); }
      }
    },
    /* the pitch, to the nearest 10 Hz: between the row's own steps,
       by how its two neighbours compare */
    get pitch() {
      const l = score[pitch - 1], c = score[pitch], r = score[pitch + 1];
      if (!(l > 0 && c > 0 && r > 0)) return PITCHES[pitch];
      const bend = Math.log(l) - 2 * Math.log(c) + Math.log(r);
      const lean = bend < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (Math.log(l) - Math.log(r)) / bend)) : 0;
      return Math.round((PITCHES[pitch] + lean * 50) / 10) * 10;
    },
    /* "sine", "triangle", "square", "sawtooth", or null: not enough heard */
    get wave() {
      const tone = partsDown[0] - partsUp[0];
      if (downLooks < 25 || tone <= 0) return null;
      const share = k => Math.sqrt(Math.max(0, partsDown[k] - partsUp[k]) / tone);
      const second = share(1), third = share(2);
      return second > 0.25 ? "sawtooth" : third > 0.2 ? "square" : third > 0.055 ? "triangle" : "sine";
    },
    get down() { return down; },
    get now() { return seen * 1000 / sampleRate; }
  };
}

/*
 * THE READER
 *
 * Key down for so long, up for so long: which marks, which spaces?
 * A set speed can't say: a hand isn't a metronome, and nobody told
 * us the speed anyway. But whatever the hand, its marks fall in two
 * heaps (dits and dahs) and its gaps in three (inside a letter,
 * between letters, between words):
 *
 *   marks   ▂█▂              ▂█▂
 *           dit              dah            the line between: half way
 *
 *   gaps    ▂█▂        ▂█▂            ▂█▂
 *          inside     letter          word
 *
 * So it learns from what it hears. Until it has heard both a short
 * mark and a long one it can't tell which it has (S ... at 10 wpm is
 * O --- at 30), so it holds the first marks back, a moment only:
 * the first dah after a dit settles it, or else a pause does, and it
 * goes with the speed it was given (`unit`, the dit expected, in ms).
 * Then everything held is read at once, and each mark as it ends.
 *
 * Spaces come from silence as it lasts: a letter space once the gap
 * outgrows a gap inside a letter, a word space (after it) once it
 * outgrows the letter gaps heard so far. A sender who stretches the
 * spaces (Farnsworth) is followed the same way.
 *
 * A sender already known (`known`: what a reader `learned`, or just
 * { dit } in ms, from a pairing) is read from the first mark, nothing
 * held.
 *
 * A sender only expected (`expect`: { dit, dah, inside }, your own
 * fist from the profile) is a better first guess than a set speed,
 * and no more than that: the marks are still held until both kinds
 * are heard, because it may well be someone else keying. It's what a
 * lone heap is measured against, and how long a dah is to a dit.
 *
 *   mark(m, { on, gap, unit, sure, dah, at })   "." or "-": how long it
 *                                      was, the silence before it, the
 *                                      dit then, whether it was a clear
 *                                      call, how likely it was a dah
 *                                      (0..1), and when it ended
 *   space(kind)                        "letter", then maybe "word"
 */
const TWO_HEAPS = 2.2;      // longest over shortest: both a dit and a dah are in there
const HEAP_GAP = 1.7;       // and the step between the heaps is at least this
const BLIP_MS = 20;         // shorter than a 60 wpm dit: not a mark
const RECENT = 16;          // marks the dit and the dah are worked out from
const GAPS = 20;            // letter and word gaps remembered

const mean = list => list.reduce((n, x) => n + x, 0) / list.length;

/* a sorted list cut at its biggest step: [step, lower part, upper part] */
function cut(sorted) {
  let at = 0, step = 0;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const r = sorted[i + 1] / sorted[i];
    if (r > step) { step = r; at = i; }
  }
  return [step, sorted.slice(0, at + 1), sorted.slice(at + 1)];
}

export function createReader({ unit = 60, mark = () => { }, space = () => { }, known = null, expect = null } = {}) {
  const prior = known?.dit ?? expect?.dit ?? unit;
  const ratio = expect ? Math.max(2, Math.min(4.5, expect.dah / expect.dit)) : 3;   // a dah to a dit, when only one kind is heard
  let dit = prior, dah = known?.dah ?? prior * 3;
  let inside = known?.inside ?? prior;   // the gap inside a letter, lately
  let settled = !!known;      // a sender whose timing we hold needs no holding back
  let held = [];              // before it's settled: { on, gap }
  let recent = [];            // the last marks' lengths
  let gaps = [...(known?.gaps ?? [])];   // the last letter and word gaps
  let downAt = null, lastUp = null;
  let given = 0;              // spaces since the last mark: 0, 1 letter, 2 word

  const edge = () => (dit + dah) / 2;               // between a dit and a dah
  const letterAt = () => inside + dit;              // textbook: 1 + 1, half way to 3
  function wordAt() {
    if (gaps.length >= 6) {
      const sorted = [...gaps].sort((a, b) => a - b);
      const [step, low, high] = cut(sorted);
      if (step >= 1.4) return Math.sqrt(low.at(-1) * high[0]);
      /* one heap: letter gaps (a run of one-letter words is rarer
         than a long word) */
      return Math.max(letterAt() * 2, Math.exp(mean(sorted.map(Math.log))) * 1.7);
    }
    /* few gaps heard yet. Textbook: between 3 and 7. But a sender
       who stretches the spaces has letter gaps longer than that, so
       a word space is also well beyond the shortest gap heard so
       far: only the very first can be called too soon */
    return Math.max(dit * 5, gaps.length ? Math.min(...gaps) * 1.7 : 0);
  }

  /* the dit and the dah, from the marks heard lately */
  function learn(on, was) {
    recent.push(on);
    if (recent.length > RECENT) recent.shift();
    const sorted = [...recent].sort((a, b) => a - b);
    const [step, low, high] = sorted.length > 1 ? cut(sorted) : [0];
    if (step >= HEAP_GAP && sorted.at(-1) / sorted[0] >= TWO_HEAPS) {
      dit += (mean(low) - dit) * 0.5;
      dah += (mean(high) - dah) * 0.5;
    } else if (was === ".") dit += (on - dit) * 0.2;
    else dah += (on - dah) * 0.2;
    /* a dah is never close to a dit, nor far beyond it: one stray
       mark can't drag the line between them away */
    dah = Math.max(dit * 2, Math.min(dit * 4.5, dah));
  }

  function read(on, gap, at) {
    if (gap !== null) {
      if (given < 1 && gap >= letterAt()) { given = 1; space("letter"); }
      if (given < 2 && gap >= wordAt()) { given = 2; space("word"); }
      if (given === 0) inside += (gap - inside) * 0.2;
      /* a long pause is nobody's word space: left out of the count */
      else if (gap < wordAt() * 6) { gaps.push(gap); if (gaps.length > GAPS) gaps.shift(); }
    }
    const m = on < edge() ? "." : "-";
    const sure = Math.abs(on - edge()) > edge() * 0.25;
    /* how likely a dah: even at the line between the two, surer the
       further from it, against how far apart this hand's dit and dah
       are (a call that's clear, by the line above, is 80% or more) */
    const dahOdds = 1 / (1 + Math.exp(-(on - edge()) / ((dah - dit) * 0.18)));
    mark(m, { on: Math.round(on), gap: gap === null ? null : Math.round(gap), unit: Math.round(dit * 10) / 10, sure, dah: Math.round(dahOdds * 1000) / 1000, at });
    learn(on, m);
    given = 0;
  }

  /* both heaps heard (or `force`: a pause, go with what there is) */
  function settle(force) {
    if (!held.length) return;
    const sorted = held.map(h => h.on).sort((a, b) => a - b);
    const [step, low, high] = sorted.length > 1 ? cut(sorted) : [0];
    if (step >= HEAP_GAP && sorted.at(-1) / sorted[0] >= TWO_HEAPS) {
      dit = mean(low);
      dah = mean(high);
    } else if (!force) return;
    else {
      /* one heap: all dits, or all dahs? Marks much longer than the
         gaps between them are dahs; otherwise, whichever is nearer
         the speed we were told */
      const m = sorted[Math.floor(sorted.length / 2)];
      const between = held.slice(1).map(h => h.gap);
      const dahs = between.length && m / Math.min(...between) > 2
        ? true
        : Math.abs(Math.log(m / 3 / prior)) < Math.abs(Math.log(m / prior));
      dit = dahs ? m / ratio : m;
      dah = dit * ratio;
    }
    dah = Math.max(dit * 2, Math.min(dit * 4.5, dah));
    inside = expect ? dit * expect.inside / expect.dit : dit;
    settled = true;
    recent = sorted.slice(-RECENT);
    const waiting = held;
    held = [];
    const keep = recent;
    for (const h of waiting) { read(h.on, h.gap, h.at); recent = keep.slice(); }
  }

  return {
    down(at) { downAt = at; },
    up(at) {
      if (downAt === null) return;
      const on = at - downAt, gap = lastUp === null ? null : downAt - lastUp;
      downAt = null;
      /* a crackle: as if it never happened (the silence runs on) */
      if (on < (settled ? Math.max(BLIP_MS, dit * 0.3) : BLIP_MS)) return;
      lastUp = at;
      if (!settled) {
        held.push({ on, gap, at });
        settle(held.length >= 8);
        return;
      }
      read(on, gap, at);
    },
    /* time passing: silence turns into spaces */
    tick(at) {
      if (downAt !== null || lastUp === null) return;
      const quiet = at - lastUp;
      if (!settled) {
        const longest = Math.max(...held.map(h => h.on));
        if (quiet > Math.max(600, longest * 8)) settle(true);
        if (!settled) return;
      }
      if (given < 1 && quiet >= letterAt()) { given = 1; space("letter"); }
      if (given < 2 && quiet >= wordAt()) { given = 2; space("word"); }
    },
    /* the end of a recording: what's held is read, the last letter closed */
    flush() {
      if (!settled) settle(true);
      if (lastUp !== null && given < 1) { given = 1; space("letter"); }
    },
    get settled() { return settled; },
    get unit() { return dit; },
    get wpm() { return 1200 / dit; },
    /* the speed the spaces are sent at, when they're stretched
       (Farnsworth: letters at one speed, the room between them at a
       slower one); the same as wpm when they aren't. A word of 50
       units: 31 of them marks and the gaps inside letters, 19 spaces */
    get fwpm() {
      if (gaps.length < 4) return 1200 / dit;
      const sorted = [...gaps].sort((a, b) => a - b);
      const [step, low] = cut(sorted);
      const space = mean(step >= 1.4 ? low : sorted) / 3;    // a letter space is three
      return space > dit * 1.4 ? 60000 / (31 * dit + 19 * space) : 1200 / dit;
    },
    /* this sender's timing, to start another reader from (`known`) */
    get learned() { return { dit, dah, inside, gaps: [...gaps] }; }
  };
}

/* the detector and the reader, joined: samples in, Morse out */
export function createHearing({ sampleRate, unit, known, expect, mark, space, key = () => { }, level = () => { } }) {
  const reader = createReader({ unit, known, expect, mark, space });
  const detector = createDetector({
    sampleRate,
    key(down, at) { if (down) reader.down(at); else reader.up(at); key(down, at); },
    tick: at => reader.tick(at),
    level
  });
  return {
    feed: samples => detector.feed(samples),
    flush() {
      if (detector.down) { reader.up(detector.now); key(false, detector.now); }
      reader.flush();
    },
    get pitch() { return detector.pitch; },
    get wave() { return detector.wave; },
    get settled() { return reader.settled; },
    get wpm() { return reader.wpm; },
    get fwpm() { return reader.fwpm; },
    get unit() { return reader.unit; },
    get learned() { return reader.learned; }
  };
}

/*
 * A whole recording at once: { morse: ".... .. / -", wpm, fwpm, pitch, wave }.
 *
 * Heard twice. Live, the first spaces are called before the sender's
 * spacing is known (stretched spaces start out as word spaces); a
 * recording can be listened through once to learn the hand, then
 * read from the start knowing it. The second time costs nothing:
 * only the key's ups and downs are gone over again, not the sound.
 */
export function hear(samples, sampleRate, { unit = 60, expect = null, mark = () => { }, space = () => { }, level = () => { } } = {}) {
  const keyed = [];
  const first = createHearing({ sampleRate, unit, expect, level, key: (down, at) => keyed.push([down, at]) });
  first.feed(samples);
  first.flush();
  let morse = "";
  const reader = createReader({
    known: first.learned,
    mark(m, how) { morse += m; mark(m, how); },
    space(kind) { morse = kind === "word" ? morse.replace(/ $/, "") + " / " : morse + " "; space(kind); }
  });
  for (const [down, at] of keyed) { if (down) reader.down(at); else reader.up(at); }
  reader.flush();
  return { morse: morse.trim().replace(/ \/$/, ""), wpm: first.wpm, fwpm: reader.fwpm, pitch: first.pitch, wave: first.wave };
}

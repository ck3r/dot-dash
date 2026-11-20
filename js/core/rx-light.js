/*
 * ============================================================
 * RX — seeing Morse   (dot-da.sh)
 * ============================================================
 *
 * Light in, marks and spaces out: a lamp, a torch, a screen that
 * flashes. No page and no camera in here: how bright the watched
 * spot is arrives as a number for each picture the camera took, and
 * what's seen leaves as ".", "-", "letter" and "word", read by the
 * same reader the ears use (js/core/rx-decoder.js createReader).
 *
 *   pictures ─► how bright? ─► lamp on / off ─► reader ─► . - ˽ /
 *
 *   brightOf(pixels)                        a patch of picture → 0..1
 *   createRest()                            …or how far it is from rest (a blink)
 *   createSeeing({ unit, mark, space, … })  either in, Morse out
 *
 * A camera is slow ears: 30 pictures a second is one every 33 ms,
 * and a dit wants two of them at least, so about 15 wpm is the most
 * it can follow (twice that at 60 pictures a second). Slow, a lamp
 * is easy.
 */
import { createReader } from "./rx-decoder.js";

/*
 * HOW BRIGHT: the watched patch has the lamp in it somewhere and a
 * margin around it (the hand holding the camera isn't a tripod). So
 * not the patch's average, which the margin waters down and which
 * changes as the lamp wanders in it, but its brightest twentieth:
 * wherever in the patch the lamp is, that's the lamp.
 *
 *   ┌─────────┐      ┌─────────┐
 *   │         │      │      ●  │     the same answer:
 *   │    ●    │      │         │     the lamp, not where it is
 *   │         │      │         │
 *   └─────────┘      └─────────┘
 *
 * `pixels` is what a canvas gives: r, g, b, a, r, g, b, a…
 */
const TOP = 0.05;
export function brightOf(pixels) {
  const n = pixels.length >> 2;
  if (!n) return 0;
  const light = new Float32Array(n);
  for (let i = 0; i < n; i++) light[i] = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255;
  light.sort();
  const top = Math.max(1, Math.round(n * TOP));
  let sum = 0;
  for (let i = n - top; i < n; i++) sum += light[i];
  return sum / top;
}

/*
 * A BLINK: an eye has no lamp in it. A lid coming down over it
 * barely changes how bright the brightest of the patch is (skin for
 * the white of the eye, about as light), so brightOf misses it. What
 * does change is the look of the patch: so this one says how far the
 * patch is from how it looks at rest, colour and all.
 *
 *   at rest  ┌─────────┐    lid down ┌─────────┐
 *            │  ( ◉ )  │             │  ‿‿‿‿‿  │    its pixels against
 *            └─────────┘             └─────────┘    the resting picture
 *
 * The resting picture is the patch's own slow average (a second and
 * a half): it follows the light in the room and the camera settling,
 * but not a blink. While the eye's read as shut it's followed far
 * more slowly still, so a long dah isn't learnt as rest; but it is
 * followed, so a camera knocked aside comes right in the end.
 *
 * A camera that moves changes every pixel: this wants it propped up.
 * The answer is the mean of the most-changed quarter of the patch,
 * so the eye needn't fill the ring.
 *
 *   createRest() → { change(pixels, dt, shut) → 0..1, reset() }
 */
const REST = 1500;          // ms: how slowly "at rest" follows the picture…
const REST_SHUT = 8000;     // …and while the eye's read as shut
const MOST = 0.25;
export function createRest() {
  let rest = null;
  return {
    change(pixels, dt, shut = false) {
      const n = pixels.length >> 2;
      if (!n) return 0;
      if (!rest || rest.length !== n * 3) {
        rest = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) rest[i * 3 + c] = pixels[i * 4 + c];
        return 0;
      }
      const ease = dt > 0 ? 1 - Math.exp(-dt / (shut ? REST_SHUT : REST)) : 0;
      const far = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let d = 0;
        for (let c = 0; c < 3; c++) {
          const v = pixels[i * 4 + c], r = rest[i * 3 + c];
          d += Math.abs(v - r);
          rest[i * 3 + c] = r + (v - r) * ease;
        }
        far[i] = d / 765;
      }
      far.sort();
      const top = Math.max(1, Math.round(n * MOST));
      let sum = 0;
      for (let i = n - top; i < n; i++) sum += far[i];
      return sum / top;
    },
    /* the ring moved, or the zoom: what's at rest is learnt again */
    reset() { rest = null; }
  };
}

/*
 * THE LAMP, ON OR OFF
 *
 * As with the tone, nobody says how bright "on" is, and it changes:
 * a camera turns its own exposure down a moment after a lamp comes
 * on. So the same two levels are followed, the floor (how bright
 * "off" is) and the peak (how bright the lamp is, lately), and the
 * lamp is on above about half way between them, off again under a
 * third.
 *
 * Unlike a tone, "off" isn't nothing: the room is lit. So what makes
 * a signal isn't the peak being many times the floor but there being
 * a clear step between them (STEP, of the whole way from black to
 * white). And a lamp comes on at once: the lamp is only taken as on
 * when the spot got brighter within a picture or two, so a picture
 * that drifts (a cloud, the hand turning) is nobody's dah.
 *
 * Pictures are far apart, and each is the light of a whole moment
 * (the camera's shutter stays open through most of it). So a picture
 * the lamp came on in the middle of is half as bright, and says when:
 *
 *   lamp     ░░░░░░░░████████████████░░░░░░░
 *   pictures │  0   │ 0.5  │  1   │ 0.3  │  0
 *                   └ on half way through   └ off a third of the way in
 *
 * which is how an edge is timed to better than a picture: by how
 * bright the pictures either side of it were.
 *
 * Times are those of the pictures themselves (`at`, ms), counted
 * from the first one seen.
 */
const STEP = 0.06;          // the peak over the floor, for there to be a lamp at all
const FLOOR_DOWN = 60;      // ms: the floor falls fast…
const FLOOR_UP = 3000;      // …and rises slowly
const PEAK_UP = 30;         // the peak, the other way;
const PEAK_ON = 400;        // while the lamp's on it's followed down (the camera's exposure settling)
const PEAK_DOWN = 4000;

/*
 * `shortest` (ms): a mark shorter than this isn't one. For blinks:
 * everyone blinks, a tenth to a fifth of a second, without meaning
 * to; a dit meant has to be held longer. So a mark is only passed on
 * once it has lasted that long (from when it began: its length is
 * kept), and the reader is told nothing of the ones that didn't.
 *
 *   eye    ‾‾‾‾‾\__/‾‾‾‾‾‾‾‾\______/‾‾‾‾
 *                └ a blink   └ a dit: held past `shortest`
 */
export function createSeeing({ unit, known, expect, mark, space, shortest = 0, key = () => { }, level = () => { } } = {}) {
  const reader = createReader({ unit, known, expect, mark, space });
  let t0 = null, last = 0, was = 0, before = 0, share = 0, every = 0, seen = 0;
  let floor = 0, peak = 0, down = false;
  let waiting = null;         // when a mark began that isn't yet long enough to be one
  return {
    /* how bright the spot is in this picture (0..1), and when it was taken */
    see(value, at) {
      if (t0 === null) { t0 = at; floor = peak = was = before = value; return; }
      const now = at - t0, dt = now - last;
      if (!(dt > 0)) return;                 // the same picture twice
      every += (dt - every) * (seen++ < 8 ? 0.5 : 0.05);
      const ease = ms => 1 - Math.exp(-dt / ms);
      floor += (value - floor) * ease(value < floor ? FLOOR_DOWN : FLOOR_UP);
      peak += (value - peak) * ease(value > peak ? PEAK_UP : down ? PEAK_ON : PEAK_DOWN);
      const span = peak - floor, there = span > STEP;
      const lit = there ? Math.max(0, Math.min(1, (value - floor) / span)) : 0;   // how much of this picture the lamp was on for
      const sudden = value - Math.min(was, before) > Math.max(STEP, span * 0.3);
      const want = there && (down ? lit > 0.3 : lit > 0.45 && sudden);
      if (want !== down) {
        /* on: it came on before the end of this picture by as much as
           this one and the last were lit; off: the same, from the
           start of the last */
        const when = Math.max(0, down ? now - 2 * dt + (share + lit) * dt : now - (share + lit) * dt);
        down = want;
        if (down) waiting = when;
        else if (waiting !== null) waiting = null;     // too short: a blink, as if it never was
        else { reader.up(when); key(false, when); }
      }
      if (waiting !== null && now - waiting >= shortest) {
        reader.down(waiting);
        key(true, waiting);
        waiting = null;
      }
      /* (while a mark waits, the quiet before it ends where it began:
         a wait mustn't be taken for a letter's space) */
      reader.tick(waiting ?? now);
      level({ at: now, level: lit, down, ms: Math.min(100, dt) });
      before = was;
      was = value;
      share = lit;
      last = now;
    },
    flush() {
      if (down && waiting === null) { reader.up(last); key(false, last); }
      down = false;
      waiting = null;
      reader.flush();
    },
    /* seen as on (or shut) now, a mark or not yet: what a resting
       picture mustn't learn from (createRest) */
    get down() { return down; },
    /* pictures a second, as they've been coming */
    get rate() { return every > 0 ? 1000 / every : 0; },
    get settled() { return reader.settled; },
    get wpm() { return reader.wpm; },
    get fwpm() { return reader.fwpm; },
    get unit() { return reader.unit; },
    get learned() { return reader.learned; }
  };
}

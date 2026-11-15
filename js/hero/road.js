/*
 * The road: two lanes tipped back to a far end, the notes coming
 * down them to the bar, and on under the keys.
 *
 *              ●   ▬
 *              ╱ │ ╲
 *             ╱  │▄▄╲
 *          K ╱ ■ │▀▀ ╲         a letter rides the left edge, level
 *           ╱┄┄┄┄┄┄┄┄┄╲        with its first mark; a dotted line
 *     ━━━━━━━━━━○╱━━━━━━━━━    where it ends. The bar, and the switch
 *          ╱     │     ╲       on it (the station's box edge)
 *
 * Two dotted lines to a letter, a dot's length before its first mark
 * and a dot's length after its last (MARGIN: room for a hand that's
 * a little early or late), so the spaces show as what they are: the
 * road between one letter's end and the next one's start is empty,
 * and a key down there is a strike (main.js). Farnsworth's longer
 * spaces are just longer stretches of it.
 *
 *    ┄┄┄┄┄┄  K starts
 *
 *     ▓▓▓ ▓ ▓▓▓
 *
 *    ┄┄┄┄┄┄  K ends
 *            (keys up)
 *    ┄┄┄┄┄┄  M starts
 *
 * A letter is drawn by its marks (strokes.js), lying on the road
 * like the notes: a thin letter with its dots and dashes along it,
 * each filling as its note is keyed. Past its dotted line it's done,
 * and the thin line goes as thick as the marks: a whole bold letter,
 * paper if it was keyed, brass if every mark landed, grey if not.
 *
 * Distance is time: a unit of time is a fixed length of road (--u),
 * so a dit is one long and a dah three. The notes are laid out once
 * on one long strip, like the tape, and the strip slides toward you:
 * one transform a frame, and little else moves.
 *
 * A press is drawn where it happened, as long as it was held, over
 * the note it was for. So the road shows the hand, not a verdict:
 *
 *    ░░░           ┌┄┄┄┐
 *   ┌███┐          ┆   ┆        ┌───┐
 *   │███│          │███│        │   │
 *   └───┘          └───┘        └───┘
 *   held too long  let go early  never keyed
 *   (a ghost past  (a dotted     (the outline)
 *    the end)       border)
 *
 * A press that starts on time is brass while it's held, and stays so
 * if it ends on time too (landed); if not, it goes back to its own
 * colour.
 *
 * A letter sticks above the bar while its marks go by, as a heading
 * does at the top of a list, until its dotted line comes down and
 * pushes it on:
 *
 *    K                 ┄┄┄┄┄
 *   ━━━━━    then      ━K━━━      and away under the keys
 *
 *   createRoad({ element }) → {
 *     load(chart, timing, windows)   lay a chart out (chart.js; the
 *                                judge's windows say what's on time)
 *     draw(now)                  slide to this time (ms)
 *     down(lane, at, note)       a key went down (note: the one the
 *                                judge gave it, or null, a stray)
 *     up(lane, at)               and came up
 *     grade(note)                show a note's grade (the judge's)
 *     lit(on)                    the bar and its switch, with a key down
 *     measure()                  the road's size changed
 *   }
 *
 * It reads the grades the judge and the page write on the notes and
 * the letters, and keeps a keyed note's press on it (note.press).
 */
import { el } from "../tx/dom.js";
import { STROKES, WEIGHT, createLetter } from "../strokes.js";

export const MARGIN = 1;  // units: a letter's dotted lines stand this far off its marks
export const SPAN = 30;   // units of road in view, the bar to the far end: about a word
const STICK = 0.5;        // units above the bar where a letter waits
const DRAWN_TALL = 1.8;   // hero.css draws a letter this much taller than wide (.letter's scaleY)
const INK = 114 / 128;    // how far up its box a letter's drawing reaches (strokes.js: the room left round it)

export function createRoad({ element }) {
  const stage = element.parentElement;
  const plane = element.querySelector(".plane");
  const strip = element.querySelector(".strip");
  const line = element.querySelector(".line");
  const bar = element.querySelector(".bar");
  const key = bar.querySelector(".switch");
  /* a stand-in the size of a letter: never seen, only measured, for
     how tall a letter is on the road */
  const probe = plane.appendChild(el("b", "letter probe"));
  probe.style.setProperty("--stick", STICK);
  let notes = [], letters = [], unit = 100, landed = 0;
  let waiting = 0;        // letters before this one are past the bar for good
  let u = 10;             // px of road to a unit
  let tall = 2;           // a letter's height on the road, in units: to the top of its drawing
  const held = { ".": null, "-": null };

  /*
   * The bar is flat on the screen, where the road's own line comes
   * out once it's tipped: asked of the browser, not worked out. And
   * it sits as far over the keys as the station's box edge does over
   * its pad (--drop): the road this side of the line is made as long
   * as that takes, by trying (tipped, a length of road isn't a fixed
   * length of screen).
   */
  function measure() {
    u = plane.clientHeight / SPAN;
    plane.style.setProperty("--u", u + "px");
    tall = probe.offsetHeight * DRAWN_TALL * INK / u;
    const box = element.getBoundingClientRect();
    const drop = parseFloat(getComputedStyle(stage).getPropertyValue("--drop")) || 0;
    let near = 3;
    for (let i = 0; drop && i < 4; i++) {
      plane.style.setProperty("--near-u", near);
      const got = box.bottom - line.getBoundingClientRect().bottom;
      if (got <= 0) break;
      near *= drop / got;
    }
    const at = line.getBoundingClientRect();
    bar.style.top = `${at.top + at.height / 2 - box.top}px`;
    bar.style.left = `${at.left - box.left}px`;
    bar.style.width = `${at.width}px`;
    stage.style.setProperty("--bar", `${box.bottom - at.bottom}px`);
  }

  function load(chart, timing, windows) {
    notes = chart.notes;
    letters = chart.letters;
    unit = timing.unit;
    landed = windows.landed;
    waiting = 0;
    held["."] = held["-"] = null;
    strip.textContent = "";
    measure();
    for (const note of notes) {
      note.el = el("i", "note " + (note.lane === "." ? "dot" : "dash"));
      note.ink = note.el.appendChild(el("s"));
      note.el.style.setProperty("--at", note.t0 / unit);
      note.el.style.setProperty("--len", note.len);
      strip.append(note.el);
    }
    for (const letter of letters) {
      const start = el("i", "sep"), end = el("i", "sep");
      letter.over = letter.end + MARGIN * unit;          // its closing line
      start.style.setProperty("--at", letter.t0 / unit - MARGIN);
      end.style.setProperty("--at", letter.over / unit);
      const strokes = STROKES[letter.ch];
      letter.passed = false;
      letter.glyph = strokes ? createLetter(strokes, letter.notes.map(n => ({ mark: n.lane, start: n.t0, end: n.t1 }))) : null;
      if (letter.glyph) {
        letter.notes.forEach((_, i) => letter.glyph.mark(i, 0));
        letter.el = el("b", "letter");
        letter.el.style.setProperty("--w", strokes.weight ?? WEIGHT);
        letter.el.append(letter.glyph.el);
      } else {
        letter.el = el("b", "letter plain", letter.ch);      // no drawing for it: as type
      }
      /* level with its first mark, or lower if its dotted line is
         nearer than it is tall (E: one dit, then the line) */
      letter.at = Math.min(letter.t0, letter.over - tall * unit);
      letter.el.style.setProperty("--at", letter.at / unit);
      strip.append(start, end, letter.el);
    }
    lit(false);
    draw(0);
  }

  /* a press, as far as it's got: its own length, and how much of its
     note it covers */
  function grow(press, now) {
    const to = Math.max(now, press.at);
    press.el.style.setProperty("--len", (to - press.at) / unit);
    const { note } = press;
    if (!note) return;
    const from = Math.max(press.at, note.t0), until = Math.min(to, note.t1), all = note.t1 - note.t0;
    note.ink.style.bottom = `${100 * (from - note.t0) / all}%`;
    note.ink.style.height = `${100 * Math.max(0, until - from) / all}%`;
  }

  function draw(now) {
    strip.style.transform = `translate3d(0, ${(now / unit) * u}px, 0)`;
    for (const press of Object.values(held)) if (press) grow(press, now);
    while (waiting < letters.length && letters[waiting].passed && now - letters[waiting].over > 8 * unit) waiting++;
    for (let i = waiting; i < letters.length; i++) {
      const letter = letters[i];
      const at = (letter.at - now) / unit;             // where it is, in units above the bar
      if (at > STICK + 1) break;                       // still on its way, and so are the rest
      if (!letter.passed) ink(letter, now);
      if (at > STICK) continue;
      const want = Math.min(STICK, (letter.over - now) / unit - tall);
      letter.el.style.setProperty("--lift", `${(at - want) * u}px`);
    }
  }

  /* a letter's marks as the hand has them: full if keyed, empty if
     missed, filling while the key is down. Past its dotted line, and
     graded, it's done: bold, in its grade's colour (hero.css) */
  function ink(letter, now) {
    for (const [i, note] of letter.notes.entries()) {
      const done = note.grade ? (note.grade === "missed" ? 0 : 1)
        : note.press ? (now - note.press.at) / (note.t1 - note.t0) : 0;
      letter.glyph?.mark(i, done);
    }
    if (now < letter.over || !letter.grade) return;
    letter.passed = true;
    letter.el.classList.add("passed", letter.grade);
  }

  function down(lane, at, note) {
    const press = { at, note, el: el("i", "press " + (lane === "." ? "dot" : "dash")) };
    press.el.style.setProperty("--at", at / unit);
    press.el.style.setProperty("--len", 0);
    strip.append(press.el);
    held[lane] = press;
    if (!note) return press.el.classList.add("stray");
    note.press = press;
    note.el.classList.add("taken");
    note.el.classList.toggle("gold", Math.abs(at - note.t0) <= landed);
  }

  function up(lane, at) {
    const press = held[lane];
    held[lane] = null;
    if (press) grow(press, at);
  }

  function grade(note) {
    note.el.classList.remove("taken", "gold");
    note.el.classList.add(note.grade);
    if (!note.err) return note.el.classList.add("unkeyed");
    if (note.grade === "landed") return note.press?.el.remove();   // on time: nothing over, nothing under
    note.el.classList.toggle("under", note.err.length < -landed);
  }

  function lit(on) {
    bar.classList.toggle("down", on);
    key.classList.toggle("down", on);
  }

  return { load, draw, down, up, grade, lit, measure };
}

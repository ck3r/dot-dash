/*
 * ============================================================
 * OVERVIEW — everything about one character
 * ============================================================
 *
 * The card: the station's (i) opens it in a popup; the reference
 * shows it under the tree for the selected character.
 *
 * Down the left, the station's about column as it is (the tree
 * around it, the marks, the name as a stair, the cut, ~); across
 * from each part, more about it:
 *
 *     _      path      ● → T → M → O → _ → 0
 *     |      depth     5
 *    [0]     parent    _            (greyed: nothing there)
 *    / \     twin      9            (the other way from the parent)
 *   _   _    children  _ _
 *            reverse   0  (-----)
 *            inverse   5  (.....)
 *
 *     ▬     ┌num──────-----┐
 *     ▬     │      ⬭       │   a note: a prosign, another reading,
 *     ▬     │22       0 .  │   something worth knowing (Q starts
 *     ▬     └─────────5 −──┘   every Q code)
 *
 *    Z      dah-dah-dah-dah-dah
 *     E     ███ ███ ███ ███ ███
 *    R      ‾‾‾‾‾‾‾‾0‾‾‾‾‾‾‾‾
 *     O
 *
 *   cut
 *    T      ░░░ ░░░ ░░░ ░░░ ███     the marks a cut leaves unsent, grey
 *                           T
 *    ~       ˄
 *    M      1/8  ███ ███   ███ ███ ███    each way it could be misheard,
 *    O       ˅     M           O          in turn (no cut: no cut row)
 *
 * The glyph and the timelines play once as the card opens (and the
 * misheard one again for each reading). Every character mentioned
 * links to its own card (a[data-code]: the page decides what a tap
 * does; both show that character's card).
 */

import { DECODE, TREE, cost, CUT, SHARED, NAME_CODE } from "./morse.js";
import { PHONETIC, PROSIGNS_BY_CODE, splits } from "./characters.js";
import { STROKES, CUT_STROKES, createLetter } from "./strokes.js";
import { STRESS, spokenOf, syllablesOf, layStair } from "./stair.js";
export { PHONETIC, PROSIGNS_BY_CODE, splits };   // (they used to live here)


/* the site's own marks (morse.js): empty, but not nothing */
const OWN = "this site's name, dot-da.sh, keying itself (À / Å in some alphabets)";

/* English letter frequency, most common first (from the project notes) */
const FREQUENCY = "ETAOINSHRDLCUMWFGYPBVKJXQZ";

/* a few things worth knowing, beside the card */
const TIDBITS = {
  E: "the shortest of all: one dot",
  T: "the shortest dash: one",
  K: "alone, it means over: go ahead",
  R: "alone, it means received",
  S: "the dots of SOS",
  O: "the dashes of SOS",
  C: "CQ: calling any station",
  Q: "starts every Q code: QTH, QSL, QRZ …",
  V: "VVV: a test, before sending",
  5: "all dots",
  0: "all dashes",
  "?": "after a Q code, it asks: QTH? is where are you?",
  "/": "in a call sign: /P portable, /M mobile"
};

const UNIT = 90;    // ms a unit, as the card plays (about 13 wpm)

/* the cut numbers both ways: a digit's cut letter, a letter's digit */
const CUT_OF = Object.fromEntries(Object.entries(CUT).filter(([c, d]) => DECODE[c] !== d).map(([c, d]) => [d, c]));


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

/* single tree character at a code, or null for an empty node */
function treeChar(code) {
  const row = TREE[code.length - 1];
  if (!row) return null;
  const ch = row[parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2)];
  return ch && ch !== "*" ? ch : null;
}

/* every node that holds a character, and every node on the way to
   one: past these the tree is empty all the way down, so the card
   doesn't link there (following children past $ went on forever) */
const LEADS = new Set([""]);
for (const code of Object.keys(DECODE)) {
  for (let k = 1; k <= code.length; k++) LEADS.add(code.slice(0, k));
}

function kindOf(name) {
  if (!name) return "—";
  if (name.startsWith("<")) return "pro";
  if (/[A-Z]/.test(name)) return "char";
  if (/[0-9]/.test(name)) return "num";
  return "sym";
}

/* how it's said: di-di-dah, with a final dot as "dit" */
function spoken(code) {
  return [...code]
    .map((s, i) => (s === "-" ? "dah" : i === code.length - 1 ? "dit" : "di"))
    .join("-");
}

const reverseOf = code => [...code].reverse().join("");
const inverseOf = code => code.replaceAll(".", "x").replaceAll("-", ".").replaceAll("x", "-");
const markOf = code => (code.endsWith(".") ? "dot" : "dash");

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function make(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/* a character, as a link to its card; greyed if nothing lives there,
   and not a link at all if nothing lives below it either */
function ref(code, { label, cls = "" } = {}) {
  const name = DECODE[code] ?? treeChar(code);
  label ??= name ?? "_";
  if (!LEADS.has(code)) return make("span", `${cls} na`, label);
  const a = make("a", `${cls}${name ? "" : " na"}`, label);
  a.href = `/ref/?/_${code}_`;
  a.dataset.code = code;
  a.title = code;
  return a;
}

/* the marks as text, each in its colour: (-.-) */
function marksText(code) {
  const e = make("span", "card-code");
  for (const m of code) e.append(make("span", m === "." ? "dot" : "dash", m));
  return e;
}

/*
 * A timeline: the marks along a wire, as long as they sound, filling
 * in as they're played; under each stretch a line and its letter.
 *
 *   ███ █ ███ █   ███ ███
 *   ‾‾‾‾‾C‾‾‾‾‾   ‾‾‾M‾‾‾
 *
 *   parts   the stretches, as marks ("-.-.", "--")
 *   join    units between them: 3 a letter gap, 1 run together
 *   labels  one per part: a node (text, link) or null
 *   gone    marks (by index) not sent: grey, never filled
 */
function timeline(parts, { join = 3, labels = [], gone = new Set() } = {}) {
  const tl = make("span", "tl");
  const marks = make("span", "tl-marks");
  const under = make("span", "tl-labels");
  const units = n => `calc(var(--u) * ${n})`;
  let t = 0, i = 0;
  parts.forEach((part, p) => {
    if (p) {
      marks.append(Object.assign(make("i", "gap"), { style: `width:${units(join)}` }));
      under.append(Object.assign(make("span", ""), { style: `width:${units(join)}` }));
      t += join;
    }
    let width = 0;
    [...part].forEach((m, k) => {
      if (k) { marks.append(Object.assign(make("i", "gap"), { style: `width:${units(1)}` })); t++; width++; }
      const n = m === "." ? 1 : 3;
      const mark = make("i", `m ${m === "." ? "dot" : "dash"}${gone.has(i) ? " gone" : ""}`);
      mark.style.width = units(n);
      mark.style.setProperty("--t", `${t * UNIT}ms`);
      mark.style.setProperty("--d", `${n * UNIT}ms`);
      marks.append(mark);
      t += n; width += n; i++;
    });
    const label = labels[p];
    const cell = make("span", label ? "tl-label" : "");
    cell.style.width = units(width);
    if (label) cell.append(label);
    under.append(cell);
  });
  tl.style.setProperty("--n", t);
  tl.append(marks, under);
  return tl;
}

/* where a code's marks sound, in ms (for the stroke glyph) */
function played(code) {
  let t = 0;
  return [...code].map((mark, i) => {
    if (i) t += UNIT;
    const start = t;
    t += (mark === "." ? 1 : 3) * UNIT;
    return { mark, start, end: t };
  });
}

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;


/*
 * The tile alone, like a periodic table's: what it is and its marks
 * at the top, the glyph (drawn by its strokes, where it has them),
 * and at the foot its weight in units, its dots and its dashes.
 *
 *   ┌num──────-----┐
 *   │      ⬭       │
 *   │22       0 .  │
 *   └─────────5 −──┘
 *
 *   renderTile(code, { name, strokes, cut })   → { el, letter }
 *     name      what to call it (<AR> for .-.-. in the prosigns)
 *     strokes   draw the glyph, if it has strokes (letter: to play it)
 *     cut       a number as cut (code: its cut code; drawn cut)
 */
export function renderTile(code, { name = DECODE[code] ?? null, strokes = true, cut = false } = {}) {
  const kind = kindOf(name);
  const tile = make("div", "card-tile");
  const types = make("span", "tile-type");
  types.append(make("span", "", kind));
  if (cut || (CUT[code] && kind === "char" && CUT[code] !== name)) types.append(make("span", "also", "cut"));
  if (SHARED[code]) types.append(make("span", "also", kind === "pro" ? "sym" : "pro"));
  const dits = [...code].filter(s => s === ".").length, dahs = code.length - dits;
  const stats = make("span", "tile-stats");
  stats.append(make("span", "", `${dits} `), make("span", "dot", "."), "\n", make("span", "", `${dahs} `), make("span", "dash", "−"));
  const weight = make("span", "tile-weight", String(cost(code)));
  weight.title = `${cost(code)} units: its marks and the gaps inside them, and a letter gap`;
  const glyph = make("span", "tile-glyph");
  let letter = null;
  const drawn = (cut ? CUT_STROKES : STROKES)[name];
  if (strokes && drawn) {
    letter = createLetter(drawn, played(code));
    glyph.append(make("span", "char", name), letter.el);   // the character too, unseen, to read and find
  } else {
    glyph.append(make("span", `char${kind === "pro" ? " pro" : ""}${name ? "" : " na"}`, name ?? "_"));
  }
  const marks = marksText(code);
  marks.classList.add("tile-code");
  tile.append(types, marks, glyph, weight, stats);
  return { el: tile, letter };
}


/*
 * ============================================================
 * THE CARD
 * ============================================================
 */
export function renderCard(element, code) {
  element._stop?.();
  element.textContent = "";
  element.classList.add("card");
  const name = DECODE[code] ?? null;
  const isName = code === NAME_CODE;
  const prosign = PROSIGNS_BY_CODE[code];
  const sign = name?.startsWith("<") ? name : prosign ? `<${prosign[0]}>` : null;

  /* the grid: the column's part at the left, what goes with it at
     the right, a row each */
  const row = (cls, left, right) => {
    const l = make("div", `card-left ${cls}`), r = make("div", `card-right ${cls}`);
    if (left) l.append(...[left].flat());
    if (right) r.append(...[right].flat());
    element.append(l, r);
    return [l, r];
  };

  /* ---- the tree around it, and its place in the whole ---- */
  const parent = code.slice(0, -1);
  const twin = parent + (code.endsWith(".") ? "-" : ".");
  const short = c => treeChar(c) ?? (c === code && name ? "◆" : "_");
  const tree = make("span", "card-tree");
  const line = (...parts) => { const e = make("span", "tree-line"); e.append(...parts); tree.append(e); };
  line(code.length > 1 ? ref(parent, { label: short(parent) }) : make("span", "root", "●"));
  line(make("span", markOf(code), "|"));
  line(make("b", "here char", name ?? "_"));
  line(make("span", "dot", "/"), " ", make("span", "dash", "\\"));
  line(ref(code + ".", { label: short(code + ".") }), "   ", ref(code + "-", { label: short(code + "-") }));

  const place = make("dl", "card-place");
  const fact = (label, value, na = false) => {
    place.append(make("dt", na ? "na" : "", label));
    const dd = make("dd");
    dd.append(...[value].flat());
    place.append(dd);
  };
  const has = c => !!(DECODE[c] ?? treeChar(c));
  const path = [make("span", "root", "●")];
  for (let k = 1; k <= code.length; k++) {
    const step = make("span", "step", "→ ");   // a step breaks before its arrow, never after
    step.append(ref(code.slice(0, k), { cls: markOf(code.slice(0, k)) }));
    path.push(" ", step);
  }
  fact("path", path);
  fact("depth", String(code.length));
  fact("parent", code.length > 1 ? ref(parent) : make("span", "na", "● (the start)"), code.length > 1 && !has(parent));
  fact("twin", ref(twin, { cls: has(twin) ? markOf(twin) : "" }), !has(twin));
  const kids = [code + ".", code + "-"];
  fact("children", [ref(kids[0], { cls: has(kids[0]) ? "dot" : "" }), " ", ref(kids[1], { cls: has(kids[1]) ? "dash" : "" })], !kids.some(has));
  const rev = reverseOf(code), inv = inverseOf(code);
  fact("reverse", [ref(rev), "  (", marksText(rev), ")"], !has(rev));
  fact("inverse", [ref(inv), "  (", marksText(inv), ")"], !has(inv));
  row("r-tree", tree, place);

  /* ---- the marks, and the card: what it is, what it costs ---- */
  const marks = make("span", "card-marks");
  for (const m of code) marks.append(make("i", m === "." ? "dot" : "dash"));

  const { el: tile, letter } = renderTile(code);

  /* beside it, anything more to say */
  const note = make("div", "card-note");
  const say = (...parts) => { const p = make("p"); p.append(...parts); note.append(p); };
  const letterRefs = letters => letters.split(" ").flatMap((l, i) => {
    const c = Object.keys(DECODE).find(k => DECODE[k] === l);
    return i ? [" ", ref(c, { label: l })] : [ref(c, { label: l })];
  });
  if (prosign) {
    const [abbr, parts, meaning] = prosign;
    say(make("b", "", `<${abbr}>`), ` ${meaning}`);
    say("a prosign: ", ...letterRefs(parts), ", run together, no gap");
    if (SHARED[code]) say(`the same marks as ${name}: with prosigns on, they read <${abbr}>`);
  }
  if (isName) say(OWN);
  else if (!name) say("nothing lives here");
  const rank = FREQUENCY.indexOf(name);
  if (rank >= 0) say(`the ${ordinal(rank + 1)} most common letter in English`);
  if (TIDBITS[name]) say(TIDBITS[name]);
  const tileRow = make("div", "card-tile-row");
  tileRow.append(tile, note);
  row("r-marks", marks, tileRow);

  /* ---- its name, and how it sounds ---- */
  const said = isName ? "dot-da.sh" : name && spokenOf(name);
  let nameEl = null;
  if (said) {
    nameEl = make("span", "card-name");
    layStair(nameEl, isName ? ["dot", "-da", ".sh"] : syllablesOf(name, said), STRESS[name]);
  } else if (sign || name) {
    nameEl = make("span", "card-sign", sign ?? name);
  }
  const sound = [make("p", "card-sounds", spoken(code))];
  if (name?.startsWith("<") && prosign) {
    const letters = prosign[1].split(" ").map(l => Object.keys(DECODE).find(k => DECODE[k] === l));
    sound.push(timeline(letters, { join: 1, labels: letters.map(c => ref(c)) }));
  } else {
    sound.push(timeline([code], { labels: [make("span", name ? "" : "na", name ?? "_")] }));
  }
  row("r-name", nameEl, sound);

  /* ---- cut: the digit's marks, the ones the cut drops grey ---- */
  const cutFor = CUT[code] && CUT[code] !== name ? CUT[code] : null;     // a letter, standing for a digit
  const digit = cutFor ?? (CUT_OF[name] ? name : null);
  if (digit) {   /* none: no row at all */
    row("r-label", make("span", "card-label", "cut"), null);
    const full = Object.keys(DECODE).find(k => DECODE[k] === digit);
    const short = CUT_OF[digit];
    const early = Number(digit) >= 1 && Number(digit) <= 5;   // 1–5 keep their start, 6–0 their end
    const dropped = full.length - short.length;
    const gone = new Set(Array.from({ length: dropped }, (_, k) => early ? short.length + k : k));
    const parts = early ? [full.slice(0, short.length), full.slice(short.length)] : [full.slice(0, dropped), full.slice(dropped)];
    const labels = early ? [ref(short)] : [null, ref(short)];
    row("r-cut", ref(cutFor ? full : short, { cls: "card-big" }),
      timeline(parts, { join: 1, labels, gone }));
  }

  /* ---- ~: what the same marks could be heard as, each in turn ---- */
  const alt = name ? splits(code) : [];
  row("r-label", make("span", `card-label${alt.length ? "" : " na"}`, "~"), null);
  if (alt.length) {
    const left = make("span", "card-stack");
    const right = make("div", "card-heard");
    const held = make("span", "heard-line");
    const turn = make("span", "card-turn");
    const up = make("button", "", "˄"), down = make("button", "", "˅"), count = make("span", "", "");
    up.type = down.type = "button";
    up.title = "the reading before"; down.title = "the next reading";
    turn.append(up, count, down);
    if (alt.length < 2) turn.classList.add("one");
    right.append(turn, held);   // first, so it stays put whatever the reading's length
    let at = 0;
    const show = () => {
      const parts = alt[at];
      left.replaceChildren(...parts.map(c => ref(c, { cls: "card-big" })));
      held.replaceChildren(timeline(parts, { labels: parts.map(c => ref(c)) }));
      count.textContent = `${at + 1}/${alt.length}`;
    };
    up.addEventListener("click", () => { at = (at + alt.length - 1) % alt.length; show(); });
    down.addEventListener("click", () => { at = (at + 1) % alt.length; show(); });
    show();
    row("r-heard", left, right);
  } else {
    row("r-heard", null, make("p", "na", name ? "can't be misheard: no shorter pieces add up to it" : "—"));
  }

  /* the glyph draws itself as the marks go by, once */
  if (letter) {
    if (still()) { letter.at(Infinity); return; }
    let frame = 0;
    const t0 = performance.now();
    const tick = now => {
      letter.at(now - t0);
      if (now - t0 < played(code).at(-1).end + UNIT) frame = requestAnimationFrame(tick);
    };
    letter.at(0);
    frame = requestAnimationFrame(tick);
    element._stop = () => cancelAnimationFrame(frame);
  }
}

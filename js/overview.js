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
 * The little tree, the glyph and the timelines play once as the
 * card opens (and the misheard one again for each reading): the
 * tree from the root, a step down as each mark sounds, as the
 * station's column goes. A tap on a timeline plays it again; on
 * the tile, the whole card. Every character mentioned links to its
 * own card (a[data-code]: the page decides what a tap does; both
 * show that character's card).
 *
 * The parts of the column do what they do in the station's column:
 * the marks copy, so does how it sounds (di-di-dit); and, where the
 * page has them (renderCard's options), the name says itself, cut
 * and ~ open what they are.
 */

import { DECODE, TREE, cost, CUT, SHARED, NAME_CODE } from "./morse.js";
import { PHONETIC, PROSIGNS_BY_CODE, splits } from "./characters.js";
import { STROKES, CUT_STROKES, createLetter } from "./strokes.js";
import { STRESS, spokenOf, syllablesOf, layStair } from "./stair.js";
import { symbolWord, codeSaid } from "./tx/voice.js";
export { PHONETIC, PROSIGNS_BY_CODE, splits };   // (they used to live here)


/* the site's own marks (morse.js): empty, but not nothing */
const OWN = "this site's name, *dot-da.sh*, keying itself (À / Å in some alphabets)";

/* English letter frequency, most common first (from the project notes) */
const FREQUENCY = "ETAOINSHRDLCUMWFGYPBVKJXQZ";

/* a few things worth knowing, beside the card; *the key words* lit
   (the note is grey, they're paper: what to take away at a glance) */
const TIDBITS = {
  E: "the *shortest* of all: one dot",
  T: "the *shortest dash*: one",
  K: "alone, it means *over*: go ahead",
  R: "alone, it means *received*",
  S: "the dots of *SOS*",
  O: "the dashes of *SOS*",
  C: "*CQ*: calling any station",
  Q: "starts every *Q code*: QTH, QSL, QRZ …",
  V: "*VVV*: a test, before sending",
  5: "*all dots*",
  0: "*all dashes*",
  "?": "after a Q code, it *asks*: QTH? is where are you?",
  "/": "in a call sign: */P* portable, */M* mobile"
};

/* a note's line: its *key words* as <b>, the rest as it is */
const lit = text => text.split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? make("b", "", part) : part)).filter(p => p !== "");

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
  /* tapped (not on a letter: that's its card): it plays again */
  tl.title = "play it again";
  tl.addEventListener("click", event => { if (!event.target.closest("a")) replay(tl); });
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

/* a tile's letter played through to its end (strokes.js "keyed"): its
   border lights paper a moment, as the letter itself is lit */
document.addEventListener("keyed", event => {
  const tile = event.target.closest?.(".card-tile");
  if (!tile || still()) return;
  tile.classList.remove("landed");
  void tile.offsetWidth;   // (from the start again, if it's still going)
  tile.classList.add("landed");
});
document.addEventListener("animationend", event => {
  if (event.animationName === "tile-landed") event.target.classList.remove("landed");
});

/* the CSS animations in a part, from the start again */
function replay(part) {
  for (const a of part.getAnimations({ subtree: true })) { a.cancel(); a.play(); }
}

/* the reading dial's ˄ ˅, drawn (the typed ones sit high in their line) */
function chevron(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 6");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
  return svg;
}

/* a part of the card that does something when tapped */
function tap(cls, what, act, text) {
  const b = make("button", `${cls} card-tap`.trim(), text);
  b.type = "button";
  b.title = what;
  b.setAttribute("aria-label", what);
  b.addEventListener("click", act);
  return b;
}

/* copied, with a word over it (the page's flash, if it has one) */
async function copy(text, part, flash) {
  try { await navigator.clipboard.writeText(text); flash?.(part, "copied"); }
  catch { flash?.(part, "can't copy"); }
}


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
 *   renderTile(code, { name, strokes, cut, round })   → { el, letter }
 *     name      what to call it (<AR> for .-.-. in the prosigns)
 *     strokes   draw the glyph, if it has strokes (letter: to play it)
 *     cut       a number as cut (code: its cut code; drawn cut)
 *     round     its dots drawn as circles (strokes.js)
 */
export function renderTile(code, { name = DECODE[code] ?? null, strokes = true, cut = false, round = false } = {}) {
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
    letter = createLetter(drawn, played(code), { round });
    glyph.append(make("span", "char", name), letter.el);   // the character too, unseen, to read and find
  } else if (kind === "pro") {
    /* <AR>: brackets and letters apart, so the reference's "bar" can
       drop the brackets and put the bar over the letters, as its list does */
    const char = make("span", "char pro");
    char.append(make("span", "br", "<"), make("span", "pro-letters", name.slice(1, -1)), make("span", "br", ">"));
    glyph.append(char);
  } else {
    glyph.append(make("span", `char${name ? "" : " na"}`, name ?? "_"));
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
/*
 *   renderCard(element, code, { say, openCut, openHeard, flash })
 *     say(ch, part)    the name, spoken (a tap on it)
 *     openCut(code)    what cut numbers are (a tap on cut)
 *     openHeard()      why marks get misheard (a tap on ~)
 *     flash(part, w)   a moment's word over a part ("copied")
 *   Each one left out: that part stays as it is.
 */
export function renderCard(element, code, { say: speak, openCut, openHeard, flash } = {}) {
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
  /* it plays as the marks do, as the station's column does: from the
     root, a step down the tree as each mark starts, to rest on it

                       E                 A
                       |                 |
       [●]    .       [E]      -        [A]
       / \    →       / \      →        / \
      E   T          I   A             R   W   */
  const marksAt = played(code);
  const end = marksAt.at(-1).end;
  const tree = make("span", "card-tree");
  /* tapped (not on a character: that's its card), it walks down again */
  tree.title = "walk it again";
  tree.addEventListener("click", event => { if (!event.target.closest("a")) walkTree(); });
  const has = c => !!(DECODE[c] ?? treeChar(c));
  const kids = [code + ".", code + "-"];
  function drawTree(at) {
    const up = at.slice(0, -1);
    const line = (...parts) => {
      const e = make("span", "tree-line");
      e.append(...parts);
      return e;
    };
    const below = [at + ".", at + "-"];
    tree.replaceChildren(
      line(!at ? " " : up ? ref(up, { label: short(up) }) : make("span", "root", "●")),
      line(at ? make("span", markOf(at), "|") : " "),
      line(!at ? make("b", "here root", "●") : at === code ? make("b", "here char", name ?? "_") : make("b", "here", short(at))),
      line(make("span", "dot", "/"), " ", make("span", "dash", "\\")),
      line(ref(below[0], { label: short(below[0]), cls: has(below[0]) ? "dot" : "" }), "   ",
        ref(below[1], { label: short(below[1]), cls: has(below[1]) ? "dash" : "" })));
  }
  let steps = [];
  function walkTree() {
    steps.forEach(clearTimeout);
    if (still()) return drawTree(code);
    drawTree("");
    steps = marksAt.map(({ start }, k) => setTimeout(() => drawTree(code.slice(0, k + 1)), start));
  }

  const place = make("dl", "card-place");
  const fact = (label, value, na = false) => {
    place.append(make("dt", na ? "na" : "", label));
    const dd = make("dd");
    dd.append(...[value].flat());
    place.append(dd);
  };
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
  fact("children", [ref(kids[0], { cls: has(kids[0]) ? "dot" : "" }), " ", ref(kids[1], { cls: has(kids[1]) ? "dash" : "" })], !kids.some(has));
  const rev = reverseOf(code), inv = inverseOf(code);
  fact("reverse", [ref(rev), "  (", marksText(rev), ")"], !has(rev));
  fact("inverse", [ref(inv), "  (", marksText(inv), ")"], !has(inv));
  row("r-tree", tree, place);

  /* ---- the marks, and the card: what it is, what it costs ---- */
  const marks = tap("card-marks", `copy ${code}`, () => copy(code, marks, flash));
  for (const m of code) marks.append(make("i", m === "." ? "dot" : "dash"));

  /* the tile, tapped: the whole card plays again */
  const { el: tile, letter } = renderTile(code);
  tile.classList.add("card-tap");
  tile.title = "play the card again";
  tile.addEventListener("click", () => { replay(element); drawGlyph(); walkTree(); });

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
    say("a prosign: ", ...letterRefs(parts), ", run together, ", make("b", "", "no gap"));
    if (SHARED[code]) say(...lit(`the same marks as *${name}*: with prosigns on, they read *<${abbr}>*`));
  }
  if (isName) say(...lit(OWN));
  else if (!name) say("nothing lives here");
  const rank = FREQUENCY.indexOf(name);
  if (rank >= 0) say(...lit(`the *${ordinal(rank + 1)}* most common letter in English`));
  if (TIDBITS[name]) say(...lit(TIDBITS[name]));
  const tileRow = make("div", "card-tile-row");
  tileRow.append(tile, note);
  row("r-marks", marks, tileRow);

  /* ---- its name, and how it sounds ---- */
  const said = isName ? "dot-da.sh" : name && spokenOf(name);
  let nameEl = null;
  if (said && speak && !isName) {
    nameEl = tap("card-name", `say ${codeSaid(name) ?? said}`, () => speak(name, nameEl));
    layStair(nameEl, syllablesOf(name, said), STRESS[name]);
  } else if (said) {
    nameEl = make("span", "card-name");
    layStair(nameEl, isName ? ["dot", "-da", ".sh"] : syllablesOf(name, said), STRESS[name]);
  } else if (!sign && name && speak && symbolWord(name)) {
    /* a symbol: itself, bold, a tap says its word (as in the column) */
    nameEl = tap("card-sign card-symbol", `say ${codeSaid(name) ?? symbolWord(name).toLowerCase()}`, () => speak(name, nameEl), name);
  } else if (sign || name) {
    nameEl = make("span", "card-sign", sign ?? name);
  }
  const sounds = make("p", "card-sounds");
  const sounded = tap("", `copy ${spoken(code)}`, () => copy(spoken(code), sounded, flash), spoken(code));
  sounds.append(sounded);
  const sound = [sounds];
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
    const what = "what are cut numbers?";
    row("r-label", openCut ? tap("card-label", what, () => openCut(code), "cut") : make("span", "card-label", "cut"), null);
    const full = Object.keys(DECODE).find(k => DECODE[k] === digit);
    const short = CUT_OF[digit];
    const early = Number(digit) >= 1 && Number(digit) <= 5;   // 1–5 keep their start, 6–0 their end
    const dropped = full.length - short.length;
    const gone = new Set(Array.from({ length: dropped }, (_, k) => early ? short.length + k : k));
    const parts = early ? [full.slice(0, short.length), full.slice(short.length)] : [full.slice(0, dropped), full.slice(dropped)];
    const labels = early ? [ref(short)] : [null, ref(short)];
    const big = cutFor ? full : short;
    row("r-cut", openCut ? tap("card-big", what, () => openCut(code), DECODE[big]) : ref(big, { cls: "card-big" }),
      timeline(parts, { join: 1, labels, gone }));
  }

  /* ---- ~: what the same marks could be heard as, each in turn ---- */
  const alt = name ? splits(code) : [];
  const why = "why could it be misheard?";
  row("r-label", alt.length && openHeard ? tap("card-label", why, () => openHeard(), "~") : make("span", `card-label${alt.length ? "" : " na"}`, "~"), null);
  if (alt.length) {
    const left = openHeard ? tap("card-stack", why, () => openHeard()) : make("span", "card-stack");
    const right = make("div", "card-heard");
    const held = make("span", "heard-line");
    const turn = make("span", "card-turn");
    const up = make("button"), down = make("button"), count = make("span", "", "");
    up.type = down.type = "button";
    up.append(chevron("M1 5 6 1l5 4")); down.append(chevron("M1 1l5 4 5-4"));
    up.title = "the reading before"; down.title = "the next reading";
    turn.append(up, count, down);
    if (alt.length < 2) { turn.classList.add("one"); up.disabled = down.disabled = true; }   // greyed: nowhere to turn
    right.append(turn, held);   // first, so it stays put whatever the reading's length
    let at = 0;
    const show = () => {
      const parts = alt[at];
      left.replaceChildren(...parts.map(c => openHeard ? make("span", "card-big", DECODE[c]) : ref(c, { cls: "card-big" })));
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

  /* the glyph draws itself as the marks go by, once (again with the card) */
  let frame = 0;
  function drawGlyph() {
    if (!letter) return;
    cancelAnimationFrame(frame);
    if (still()) { letter.at(Infinity); return; }
    const t0 = performance.now();
    const tick = now => {
      letter.at(now - t0);
      if (now - t0 < end + UNIT) frame = requestAnimationFrame(tick);
    };
    letter.at(0);
    frame = requestAnimationFrame(tick);
  }
  drawGlyph();
  walkTree();
  element._stop = () => { cancelAnimationFrame(frame); steps.forEach(clearTimeout); };
}

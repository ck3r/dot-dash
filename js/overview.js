/*
 * ============================================================
 * OVERVIEW — everything about one character
 * ============================================================
 *
 * The card: the station's (i) opens it in a popup; the reference
 * shows it under the tree for the selected character.
 *
 *   A   .-
 *       ·—
 *       █░███
 *       di-dah
 *       dot dash
 *
 *   depth / path / parent / children / reverse / twin / ...
 *   a small tree around the character
 *   cost, symbols, and how the same marks could be misheard
 *
 * Every character mentioned links to its own card.
 */

import { DECODE, TREE, PROSIGNS, cost, CUT, NAME_CODE } from "./morse.js";
import { PHONETIC, PROSIGNS_BY_CODE, splits } from "./characters.js";
export { PHONETIC, PROSIGNS_BY_CODE, splits };   // (they used to live here)


/* the site's own marks (morse.js): empty, but not nothing */
const OWN = " (but it's dot-da.sh, this site's name, keying itself; À / Å in some alphabets)";

/* English letter frequency, most common first (from the project notes) */
const FREQUENCY = "ETAOINSHRDLCUMWFGYPBVKJXQZ";



const CUT_OF = Object.fromEntries(Object.entries(CUT));


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

function nameOf(code) {
  return DECODE[code] ?? null;
}

/* every node that holds a character, and every node on the way to
   one: past these the tree is empty all the way down, so the card
   doesn't link there (following children past $ went on forever) */
const LEADS = new Set([""]);
for (const code of Object.keys(DECODE)) {
  for (let k = 1; k <= code.length; k++) LEADS.add(code.slice(0, k));
}

function kindOf(name) {
  if (!name) return "unassigned";
  if (name.startsWith("<")) return "prosign";
  if (/[A-Z]/.test(name)) return "letter";
  if (/[0-9]/.test(name)) return "number";
  return "symbol";
}

const middle = code => code.replaceAll(".", "·").replaceAll("-", "—");

/* timing bar: █ = key down for one unit, ░ = key up */
function bar(codes, letterGap = 3) {
  return codes
    .map(code => [...code].map(s => (s === "." ? "█" : "███")).join("░"))
    .join("░".repeat(letterGap));
}

/* the same, drawn: spans of spaces one character wide per unit,
   the marks filled (tx/style: .bar .on). Same length as bar(), so
   columns line up; no block characters for a font to get wrong */
function barNode(codes, letterGap = 3) {
  const seg = (cls, n) => {
    const e = document.createElement("span");
    e.className = cls;
    e.textContent = " ".repeat(n);
    return e;
  };
  const wrap = document.createElement("span");
  wrap.className = "bar";
  codes.forEach((code, ci) => {
    if (ci) wrap.append(seg("gap", letterGap));
    [...code].forEach((s, i) => {
      if (i) wrap.append(seg("gap", 1));
      wrap.append(seg("on", s === "." ? 1 : 3));
    });
  });
  return wrap;
}

/* how it's said: di-di-dah, with a final dot as "dit" */
function spoken(code) {
  return [...code]
    .map((s, i) => (s === "-" ? "dah" : i === code.length - 1 ? "dit" : "di"))
    .join("-");
}

const words = code => [...code].map(s => (s === "." ? "dot" : "dash")).join(" ");

const reverseOf = code => [...code].reverse().join("");
const twinOf = code => code.replaceAll(".", "x").replaceAll("-", ".").replaceAll("x", "-");

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}


/*
 * ============================================================
 * THE CARD: everything, folded to fit a popup or a box
 * ============================================================
 *
 *  A   .-         di-dah
 *      ·—         dot dash
 *      █░███
 *      symbols    2  (1 dit, 1 dah)
 *      cost       8 units
 *                 (4 on + 1 gap + 3 letter gap)
 *
 *  ~   █░░░███    could be misheard as
 *      E   T      (same marks, longer gaps)
 *
 *      type       letter
 *      phonetic   Alfa
 *
 *        E        depth      2
 *       / \       path       ● → E → A
 *      I   A      parent     E
 *         / \     children   R  W
 *        R   W    reverse    N  (-.)  backwards
 *                 twin       N  (-.)  inverted
 *
 * Characters are links carrying data-code: the page that shows the
 * card decides what a tap does (both: show that character's card).
 * Nodes with nothing at or below them aren't links.
 */
export function renderCard(element, code) {
  element.textContent = "";
  const name = nameOf(code);
  const kind = kindOf(name);
  const make = (tag, s, cls) => {
    const e = document.createElement(tag);
    e.textContent = s;
    if (cls) e.className = cls;
    return e;
  };
  const ref = (c, label = nameOf(c) ?? treeChar(c) ?? "_") => {
    if (c === null || c === undefined) return "—";
    if (!LEADS.has(c)) return make("span", label, "empty");   // nothing here or below: no link
    const a = make("a", label);
    a.href = `/ref/?/_${c}_`;
    a.dataset.code = c;
    a.title = c;
    return a;
  };
  const width = parts => parts.reduce((n, p) => n + (typeof p === "string" ? p : p.textContent).length, 0);
  const sp = n => " ".repeat(Math.max(0, n));
  const COL = 11;
  const lines = [];
  const line = (...parts) => lines.push(parts);

  /* the character and its spellings, then what it costs */
  const head = name ?? "_";
  const ind = Math.max(4, head.length + 2);
  line(make("b", head, "char"), sp(ind - head.length), code.padEnd(COL), spoken(code));
  line(sp(ind), middle(code).padEnd(COL), words(code));
  line(sp(ind), barNode([code]));
  const dits = [...code].filter(s => s === ".").length;
  const dahs = code.length - dits;
  const gaps = code.length - 1;
  line(sp(ind), "symbols".padEnd(COL), `${code.length}  (${dits} dit${dits === 1 ? "" : "s"}, ${dahs} dah${dahs === 1 ? "" : "s"})`);
  line(sp(ind), "cost".padEnd(COL), `${cost(code)} units`);
  line(sp(ind + COL), `(${dits + 3 * dahs} on + ${gaps} gap${gaps === 1 ? "" : "s"} + 3 letter gap)`);
  line();

  /* how it could be misheard: the first reading drawn, each of its
     letters under its own stretch of the bar; any others listed */
  const alt = splits(code);
  if (alt.length) {
    const first = alt[0];
    const drawn = bar(first);
    const at = Math.max(drawn.length + 2, COL);
    /* a line over each letter's stretch of the bar, so which marks
       make which letter shows at a glance:
         ‾‾‾‾‾   ‾‾‾
         █░███░░░███      (A ~ E T: ‾ over · −, then over −) */
    const over = [];
    first.forEach((part, i) => {
      if (i) over.push(sp(3));
      over.push(make("span", " ".repeat(bar([part]).length), "over"));
    });
    line(sp(ind), ...over);
    line("~".padEnd(ind), barNode(first), sp(at - drawn.length), "could be misheard as");
    const under = [];
    let start = 0, cursor = 0;
    for (const part of first) {
      const a = ref(part);
      under.push(sp(start - cursor), a);
      cursor = start + a.textContent.length;
      start += bar([part]).length + 3;              // its marks, then a letter gap
    }
    line(sp(ind), ...under, sp(at - width(under)), "(same marks, longer gaps)");
    const more = alt.slice(1, 4).map(parts => parts.map(c => DECODE[c] ?? "_").join(""));
    if (more.length) line(sp(ind + at), `also ${more.join(", ")}${alt.length > 4 ? " …" : ""}`);
  } else {
    line("~".padEnd(ind), "can't be misheard: no shorter pieces add up to it");
  }
  line();

  /* what it is */
  const row = (label, ...value) => line(sp(ind), label.padEnd(COL), ...value);
  row("type", kind === "unassigned" ? "unassigned" + (code === NAME_CODE ? OWN : " (nothing lives here)") : kind);
  const prosign = PROSIGNS_BY_CODE[code];
  if (prosign) {
    const [abbr, parts, meaning] = prosign;
    row("prosign", make("b", `<${abbr}>`), `  ${meaning}`);
    row("sent as", ...parts.split(" ").flatMap((letter, i) => {
      const c = Object.keys(DECODE).find(k => DECODE[k] === letter);
      return i ? [" + ", ref(c, letter)] : [ref(c, letter)];
    }), "  run together");
  }
  if (PHONETIC[name]) row("phonetic", PHONETIC[name]);
  const rank = FREQUENCY.indexOf(name);
  if (rank >= 0) row("frequency", `${ordinal(rank + 1)} most common letter in Eng.`);
  if (CUT_OF[code] && kind !== "number") row("cut number", CUT_OF[code]);
  if (kind === "number") {
    const cutCode = Object.keys(CUT_OF).find(c => CUT_OF[c] === name);
    if (!cutCode || cutCode === code) row("cut letter", "itself");
    else row("cut letter", ref(cutCode), `  (${cutCode})  ${code.length - cutCode.length} shorter`);
  }
  line();

  /* the little tree, beside its place in the big one */
  const parent = code.slice(0, -1);
  const sibling = parent + (code.endsWith(".") ? "-" : ".");
  const isDot = code.endsWith(".");
  const L = isDot ? code : sibling, R = isDot ? sibling : code;
  const short = c => treeChar(c) ?? (c === code && name ? "◆" : "_");
  const node = c => (c === code ? make("b", short(c), "here") : ref(c, short(c)));
  const side = (s, cls) => make("span", s, cls);
  const at = isDot ? 4 : 2;
  const tree = [
    [sp(at + (isDot ? 2 : 0)), parent ? ref(parent, short(parent)) : "●"],
    [sp(at + (isDot ? 1 : -1)), side("/", "dot"), " ", side("\\", "dash")],
    [sp(at + (isDot ? 0 : -2)), node(L), sp(3), node(R)],
    [sp(at + (isDot ? -1 : 1)), side("/", "dot"), " ", side("\\", "dash")],
    [sp(at + (isDot ? -2 : 0)), ref(code + ".", short(code + ".")), sp(3), ref(code + "-", short(code + "-"))]
  ];
  const rev = reverseOf(code), twin = twinOf(code);
  const place = [
    ["depth", String(code.length)],
    ["path", "●", ...Array.from({ length: code.length }, (_, i) => [" → ", ref(code.slice(0, i + 1))]).flat()],
    ["parent", parent ? ref(parent) : "● (the start)"],
    ["children", ref(code + "."), "  ", ref(code + "-")],
    ["reverse", ref(rev), `  (${rev})  backwards`],
    ["twin", ref(twin), `  (${twin})  inverted`]
  ];
  const TW = 12;
  for (let i = 0; i < Math.max(tree.length, place.length); i++) {
    const left = tree[i] ?? [];
    const [label, ...value] = place[i] ?? [""];
    line(...left, sp(TW - width(left)), label ? label.padEnd(COL) : "", ...value);
  }

  for (const parts of lines) {
    element.append(...parts, "\n");
  }
}

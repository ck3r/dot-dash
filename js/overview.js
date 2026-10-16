/*
 * ============================================================
 * OVERVIEW — everything about one character
 * ============================================================
 *
 * Shown when the message is a single character:
 *   dot-da.sh/?/.-   or   dot-da.sh/?/_.-_
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
 * Every character mentioned links to its own overview.
 */

import { DECODE, TREE, PROSIGNS, cost } from "./morse.js";
import { CUT } from "./tree.js";


/* English letter frequency, most common first (from the project notes) */
const FREQUENCY = "ETAOINSHRDLCUMWFGYPBVKJXQZ";

export const PHONETIC = {
  A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
  M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
  S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu"
};

/*
 * Prosigns: letters run together with no letter gap. Four of
 * them share a code with a symbol, so the same marks mean
 * different things depending on context.
 *
 *   code      prosign  sent as  meaning                  also
 */
export const PROSIGNS_BY_CODE = {
  "...---...": ["SOS", "S O S", "distress"],
  "...-.-":    ["SK",  "S K",   "end of contact"],
  "........":  ["HH",  "H H",   "error"],
  "-.-..-..":  ["CL",  "C L",   "closing down"],
  "-...-.-":   ["BK",  "B K",   "break"],
  "-..---":    ["DO",  "D O",   "shift to Wabun (Japanese) code"],
  "...-.":     ["SN",  "S N",   "understood (also written VE)"],
  "-.-.-":     ["KA",  "K A",   "attention / start of message (also written CT)"],
  ".-.-":      ["AA",  "A A",   "new line"],
  ".-.-.":     ["AR",  "A R",   "end of message (new page)"],
  "-...-":     ["BT",  "B T",   "new paragraph / pause"],
  "-.--.":     ["KN",  "K N",   "over, to the named station only"],
  ".-...":     ["AS",  "A S",   "wait"]
};

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
 * Every way to cut the same marks into other characters
 * (what you'd hear if the gaps inside it came out too long).
 */

export function splits(code) {
  const out = [];
  (function walk(rest, parts) {
    if (!rest) {
      if (parts.length > 1) out.push(parts);
      return;
    }
    for (let i = 1; i <= rest.length; i++) {
      const piece = rest.slice(0, i);
      const name = nameOf(piece);
      if (name && !name.startsWith("<")) walk(rest.slice(i), [...parts, piece]);
    }
  })(code, []);
  return out.sort((a, b) => a.length - b.length);
}


/*
 * ============================================================
 * RENDER
 * ============================================================
 */

export function renderOverview(element, code) {
  element.textContent = "";

  const name = nameOf(code);
  const kind = kindOf(name);
  const text = s => element.append(s);

  /* single-width name for the small tree (prosigns aren't tree nodes) */
  const short = c => treeChar(c) ?? (c === code && name ? "◆" : "_");

  /* a character that links to its own overview */
  const link = (c, label = nameOf(c) ?? treeChar(c) ?? "_") => {
    if (c === null || c === undefined) return text("—");
    const a = document.createElement("a");
    a.href = `?/_${c}_`;
    a.textContent = label;
    a.title = c;
    element.append(a);
  };

  const strong = (s, cls = "") => {
    const b = document.createElement("b");
    b.textContent = s;
    if (cls) b.className = cls;
    element.append(b);
  };

  const row = (label, fill) => {
    text("  " + label.padEnd(11));
    fill();
    text("\n");
  };


  /* ---------- header: the character and its spellings ---------- */

  const head = name ?? "_";
  const indent = Math.max(4, head.length + 2);
  strong(head, "char");
  text(" ".repeat(indent - head.length) + code + "\n");
  for (const line of [middle(code), barNode([code]), spoken(code), words(code)]) {
    text(" ".repeat(indent));
    element.append(line, "\n");
  }
  text("\n");


  /* ---------- identity ---------- */

  const prosign = PROSIGNS_BY_CODE[code];

  row("type", () => {
    text(kind);
    if (kind === "unassigned") text(" (nothing lives here)");
  });

  /* the same marks as a prosign: either it IS one, or a symbol shares
     its code. Written the usual way, in angle brackets: <AR> */
  if (prosign) {
    const [abbr, parts, meaning] = prosign;
    row("prosign", () => {
      strong(`<${abbr}>`);
      text(`  ${meaning}`);
    });
    row("sent as", () => {
      parts.split(" ").forEach((letter, i) => {
        if (i) text(" + ");
        const c = Object.keys(DECODE).find(k => DECODE[k] === letter);
        link(c, letter);
      });
      text("  run together, no letter gap");
    });
  }

  if (PHONETIC[name]) row("phonetic", () => text(PHONETIC[name]));

  const rank = FREQUENCY.indexOf(name);
  if (rank >= 0) {
    row("frequency", () => text(`${ordinal(rank + 1)} most common letter in English`));
  }

  if (CUT_OF[code] && kind !== "number") row("cut number", () => text(CUT_OF[code]));

  /* numbers: which (shorter) letter stands in for it in cut numbers */
  if (kind === "number") {
    const cutCode = Object.keys(CUT_OF).find(c => CUT_OF[c] === name);
    row("cut letter", () => {
      if (!cutCode || cutCode === code) {
        text("itself (no shorter letter stands in for it)");
        return;
      }
      link(cutCode);
      text(`  (${cutCode})  sent instead of ${name} in cut numbers, ${code.length - cutCode.length} symbol${code.length - cutCode.length === 1 ? "" : "s"} shorter`);
    });
  }

  text("\n");


  /* ---------- place in the tree ---------- */

  row("depth", () => text(String(code.length)));

  row("path", () => {
    text("● ");
    for (let i = 1; i <= code.length; i++) {
      text("→ ");
      link(code.slice(0, i));
      text(" ");
    }
  });

  const parent = code.slice(0, -1);
  row("parent", () => (parent ? link(parent) : text("● (the start)")));

  row("children", () => {
    link(code + ".");
    text("  ");
    link(code + "-");
  });

  const rev = reverseOf(code);
  row("reverse", () => {
    link(rev);
    text(`  (${rev})  read backwards`);
  });

  const twin = twinOf(code);
  row("twin", () => {
    link(twin);
    text(`  (${twin})  dots and dashes swapped`);
  });

  text("\n");


  /* ---------- small tree around it ---------- */

  const sibling = parent + (code.endsWith(".") ? "-" : ".");
  const isDot = code.endsWith(".");
  const L = isDot ? code : sibling;
  const R = isDot ? sibling : code;
  const pad = n => text(" ".repeat(n));
  const node = c => (c === code ? strong(short(c), "here") : link(c, short(c)));
  const slash = (s, side) => {
    const sp = document.createElement("span");
    sp.className = side;
    sp.textContent = s;
    element.append(sp);
  };

  /*
   *  isDot:           P          not isDot:   P
   *                  / \                     / \
   *                 X   s                   s   X
   *                / \                         / \
   *               a   b                       a   b
   */
  const at = isDot ? 8 : 6;
  pad(at + (isDot ? 2 : 0)); parent ? link(parent, short(parent)) : text("●"); text("\n");
  pad(at + (isDot ? 1 : -1)); slash("/", "dot"); text(" "); slash("\\", "dash"); text("\n");
  pad(at + (isDot ? 0 : -2)); node(L); pad(3); node(R); text("\n");
  pad(at + (isDot ? -1 : 1)); slash("/", "dot"); text(" "); slash("\\", "dash"); text("\n");
  pad(at + (isDot ? -2 : 0)); link(code + ".", short(code + ".")); pad(3); link(code + "-", short(code + "-")); text("\n\n");


  /* ---------- cost ---------- */

  const dits = [...code].filter(s => s === ".").length;
  const dahs = code.length - dits;
  const on = dits + 3 * dahs;
  const gaps = code.length - 1;

  row("signal", () => element.append(barNode([code])));
  row("symbols", () => text(`${code.length}  (${dits} dit${dits === 1 ? "" : "s"}, ${dahs} dah${dahs === 1 ? "" : "s"})`));
  row("cost", () => text(`${cost(code)} units = ${on} on + ${gaps} gap${gaps === 1 ? "" : "s"} + 3 letter gap`));

  text("\n");


  /* ---------- how it could be misheard ---------- */

  const alt = splits(code);
  text("  could be misheard as");
  if (!alt.length) {
    text("  nothing else; no shorter pieces add up to it\n");
    return;
  }
  text(" (same marks, longer gaps):\n");
  const SHOW = 10;
  const width = Math.max(...alt.slice(0, SHOW).map(parts => bar(parts).length));
  for (const parts of alt.slice(0, SHOW)) {
    text("    ");
    element.append(barNode(parts));
    text(" ".repeat(width + 2 - bar(parts).length));
    parts.forEach((p, i) => {
      if (i) text(" ");
      link(p);
    });
    text("\n");
  }
  if (alt.length > SHOW) text(`    … and ${alt.length - SHOW} more\n`);
}


/*
 * ============================================================
 * THE CARD: the same facts, folded for a popup (tx's about)
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
 * card decides what a tap does (tx: show that character's card).
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
    const a = make("a", label);
    a.href = `/?/_${c}_`;
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
  row("type", kind === "unassigned" ? "unassigned (nothing lives here)" : kind);
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

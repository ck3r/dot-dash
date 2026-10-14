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

const PHONETIC = {
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
const PROSIGNS_BY_CODE = {
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

function splits(code) {
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
  for (const line of [middle(code), bar([code]), spoken(code), words(code)]) {
    text(" ".repeat(indent) + line + "\n");
  }
  text("\n");


  /* ---------- identity ---------- */

  const prosign = PROSIGNS_BY_CODE[code];

  row("type", () => {
    text(kind);
    if (kind === "prosign" && prosign) text(` (${prosign[2]})`);
    if (kind === "unassigned") text(" (nothing lives here)");
  });

  /* the same marks as a prosign: either it IS one, or a symbol shares its code */
  if (prosign) {
    const [abbr, parts, meaning] = prosign;
    if (kind !== "prosign") {
      row("also", () => text(`prosign ${abbr}: ${meaning}`));
    }
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

  row("signal", () => text(bar([code])));
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
    text("    " + bar(parts).padEnd(width + 2));
    parts.forEach((p, i) => {
      if (i) text(" ");
      link(p);
    });
    text("\n");
  }
  if (alt.length > SHOW) text(`    … and ${alt.length - SHOW} more\n`);
}

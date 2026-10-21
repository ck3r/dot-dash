/*
 * ============================================================
 * MORSE — the core
 * ============================================================
 *
 * Knows Morse. Knows nothing about the page.
 *
 * The tree IS the code. Each level is a string in heap order:
 * a node's code is its path from the root (dot = left = 0,
 * dash = right = 1), so its position on the level is that
 * path read as a binary number.
 *
 *                   .E│T-
 *              ┌──────┴──────┐
 *            .I│A-         .N│M-
 *
 *   level 2, index 1 → binary 01 → .-  → A
 *
 * '*' marks an empty node.
 */

export const TREE = [
  "ET",
  "IANM",
  "SURWDKGO",
  "HVF*L*PJBXCYZQ**",
  "54*3***2&*+****16=/***(*7***8*90",
  "************?_****\"**.****@***'**-********;!*)*****,****:*******",
  "*********$" + "*".repeat(118)
];

const EMPTY = "*";


/*
 * Prosigns whose codes aren't already a character in the tree.
 * (AR, BT, KN and AS share codes with + = ( and &.)
 */

export const PROSIGNS = {
  "...---...": "<SOS>",
  "...-.-":    "<SK>",    // end of contact
  "........":  "<HH>",    // error
  "-.-..-..":  "<CL>",    // closing
  "-...-.-":   "<BK>",    // break
  "-..---":    "<DO>",    // shift to Wabun
  "...-.":     "<SN>",    // understood
  "-.-.-":     "<KA>",    // attention
  ".-.-":      "<AA>"     // new line
};


/*
 * ============================================================
 * LOOKUP TABLES (built from the tree)
 * ============================================================
 */

export const DECODE = {};   // ".-"  → "A"
export const ENCODE = {};   // "A"   → ".-"

TREE.forEach((row, depth) => {
  [...row].forEach((char, index) => {
    if (char === EMPTY) return;

    const code = index
      .toString(2)
      .padStart(depth + 1, "0")
      .replaceAll("0", ".")
      .replaceAll("1", "-");

    DECODE[code] = char;
    ENCODE[char] = code;
  });
});

for (const [code, sign] of Object.entries(PROSIGNS)) {
  DECODE[code] = sign;
  ENCODE[sign] = code;
}


/*
 * Character at a node, or null for an empty node.
 * Used to walk the tree one signal at a time.
 */

export function nodeAt(code) {
  return DECODE[code] ?? null;
}


/*
 * ============================================================
 * MESSAGES
 * ============================================================
 *
 * A message is an array of words; a word is an array of codes.
 *
 *   [[".-", "-"], ["."]]   →   AT E
 */

export function decode(words) {
  return words
    .map(word => word.map(code => DECODE[code] ?? "�").join(""))
    .join(" ");
}

/* a prosign is written in its brackets, <SK>, one letter */
export function encode(text) {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map(word => (word.match(/<[A-Z]+>|./g) ?? []).map(char => ENCODE[char]).filter(Boolean))
    .filter(word => word.length);
}


/*
 * ============================================================
 * URL FORMATS
 * ============================================================
 *
 *                 letter   word
 *   slash          /        //      ?/../-.-//.        (legacy)
 *   underscore     _        _/_     ?/_.._-.-_/_._     (canonical)
 *
 * Slash format never contains "_", so any "_" (or space)
 * means underscore format. A single letter reads the same
 * in both.
 */

export function parse(raw) {
  let s = raw;

  try {
    s = decodeURIComponent(raw);
  } catch {
    /* malformed %-escape: use as-is */
  }

  s = s.replace(/\s+/g, "_");

  const underscore = s.includes("_");

  const words = underscore
    ? s.split("/").map(w => w.split("_"))
    : s.split("//").map(w => w.split("/"));

  return words
    .map(word => word.filter(Boolean))
    .filter(word => word.length);
}


/*
 * Canonical form, wrapped in "_" so a trailing . or - isn't
 * dropped by chat apps that trim punctuation from links.
 */

export function format(words) {
  if (!words.length) return "";
  return "_" + words.map(w => w.join("_")).join("_/_") + "_";
}


/*
 * Human-readable: ".. -.- / ."
 */

export function pretty(words) {
  return words.map(w => w.join(" ")).join(" / ");
}


export function looksLikeMorse(str) {
  return /^[.\-_/\s]+$/.test(str.trim());
}


/*
 * ============================================================
 * COST
 * ============================================================
 *
 * Time units to send one character inside a message:
 * marks + gaps within the letter + the trailing letter gap.
 *
 *   dit 1 · dah 3 · gap 1 · letter gap 3
 *
 *   cost = 2·dits + 4·dahs + 2
 *
 *   PARIS = 14 + 8 + 10 + 6 + 8 = 46, + 4 (word gap) = 50 ✓
 */

export function cost(code) {
  let units = 2;
  for (const s of code) units += s === "." ? 2 : 4;
  return units;
}


/*
 * Cut numbers: digits sent as shorter letters (contest style).
 * Same nodes, different reading. 4 and 6 keep their codes.
 */

export const CUT = {
  ".": "5", "-": "0",
  ".-": "1", "-.": "9",
  "..-": "2", "-..": "8",
  "...-": "3", "-...": "7",
  "....-": "4", "-....": "6"
};


/*
 * The site's own: · − − · −, a dot and a dash and so on, is dot-da.sh
 * keying its name (the tab does it on a visit with no message). The
 * node is empty here; in some alphabets it's À / Å, which can still
 * have it later. Keyed, it greets; its about names it.
 */
export const NAME_CODE = ".--.-";

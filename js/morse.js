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

/* <AR> and the rest can be typed too, though the node reads + (SHARED, below) */
ENCODE["<AR>"] = ".-.-.";
ENCODE["<BT>"] = "-...-";
ENCODE["<KN>"] = "-.--.";
ENCODE["<AS>"] = ".-...";


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

/*
 * ============================================================
 * READINGS: one code, more than one character
 * ============================================================
 *
 * A few nodes read two ways, and the reader picks (the tray's
 * "prosigns" and "cut", tx/settings.js):
 *
 *   prosigns   .-.-.  +  or <AR>     -...-  =  or <BT>
 *              -.--.  (  or <KN>     .-...  &  or <AS>
 *
 *   cut        T 0  A 1  U 2  V 3  E 5  B 7  D 8  N 9 (CUT, below),
 *              but only in a word that already has a digit in it,
 *              as a contest exchange: 5NN is 599, 1TT is 100, and
 *              TEN stays TEN
 *
 * That guess is for what's keyed. What's typed needs none, we know
 * which key it was: with cut on, a digit goes out cut and a letter
 * stays a letter, in any word. The marks can't tell 9 from N, so the
 * text comes along (typed, below):
 *
 *   typed  A 9        sent  .- -.        read  A 9
 *
 * A reading is { pro, cut, typed } (off: the tree's own characters;
 * typed: the words as typed, if they hold cut digits). READING is the
 * one being written now (the tray keeps it); a sent message keeps the
 * one it went with (tx/state.js readingOf).
 */

export const SHARED = {
  ".-.-.": "<AR>",
  "-...-": "<BT>",
  "-.--.": "<KN>",
  ".-...": "<AS>"
};

export const PLAIN = { pro: false, cut: false };
export const READING = { ...PLAIN };

/* a word's characters, as the reading reads them (null: no character) */
export function namesOf(word, { pro = false, cut = false } = READING) {
  const numbers = cut && word.some(code => /^\d$/.test(DECODE[code] ?? ""));
  return word.map(code =>
    (pro && SHARED[code]) || (numbers && CUT[code]) || (DECODE[code] ?? null));
}

/* a whole message's characters, word by word: as typed, where that's
   what these marks came from, and otherwise as namesOf reads them */
export function namesFor(words, reading = READING) {
  return words.map((word, w) => {
    const typed = reading.typed?.[w]?.match(LETTERS) ?? [];
    if (typed.length !== word.length || typed.some((ch, i) => codeOf(ch, { cut: true }) !== word[i])) return namesOf(word, reading);
    return namesOf(word, { ...reading, cut: false }).map((name, i) => (/\d/.test(typed[i]) ? typed[i] : name));
  });
}

/* a character's code, as the reading sends it (a digit may go cut) */
export const codeOf = (ch, { cut = false } = READING) => (cut && CUT_OF[ch]) || ENCODE[ch];

/* a prosign is written in its brackets, <SK>, one letter */
const LETTERS = /<[A-Z]+>|./g;

export function encode(text, reading = PLAIN) {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map(word => (word.match(LETTERS) ?? []).map(char => codeOf(char, reading)).filter(Boolean))
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
 * What a link says, after "?/": Morse in either format, or, with
 * anything in it that isn't Morse, plain text to encode. A "+" is
 * a space, as in a form (a real + is %2B).
 *
 *   ?/_...._._/_.--_        Morse
 *   ?/hello+world           HELLO WORLD
 *   ?/hello%20world         HELLO WORLD
 */

export function readLink(raw) {
  let s = raw.replace(/\+/g, " ");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* malformed %-escape: use as-is */
  }
  if (/^[.\-_/\s]*$/.test(s)) return parse(s);
  return encode(s);
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
const CUT_OF = Object.fromEntries(Object.entries(CUT).map(([code, digit]) => [digit, code]));


/*
 * The site's own: · − − · −, a dot and a dash and so on, is dot-da.sh
 * keying its name (the tab does it on a visit with no message). The
 * node is empty here; in some alphabets it's À / Å, which can still
 * have it later. Keyed, it greets; its about names it.
 */
export const NAME_CODE = ".--.-";

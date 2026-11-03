/*
 * ============================================================
 * TX SHARE — paste in, copy / save / share out
 * ============================================================
 *
 * Paste: if it starts with . or - it's Morse, in any common
 * spelling; otherwise it's text to encode.
 *
 *   ".... . .-.. .-.. --- / .-- --- .-. .-.. -.."   spaces and slashes
 *   "_...._._/_.--_"                               the site's URL form
 *   "•••• • •–•• / •––"                            pretty marks
 *   "https://dot-da.sh/?/_..._"                    a dot-da.sh link
 *   "hello world"                                  plain text
 *
 * Out: the message as Morse text, plain text, or a link. The files
 * (.txt, .sh, .wav, the .gif) are made in tx-files.js, loaded the
 * first time one is saved.
 */

import { encode, breaks, parse, readLink, format, pretty, namesFor, READING } from "./morse.js";


/* ---------- in ---------- */

const DOTS = /[•·∙●⋅]/g;
const DASHES = /[–—−‒―]/g;

export function readPaste(raw) {
  const s = raw.trim();

  /* a dot-da.sh link: the message is after "?/" (Morse or text), up
     to any settings after "#" */
  const link = s.match(/\?\/([^\s#]+)/);
  if (link) return { words: clean(readLink(link[1])), morse: true };

  const n = s.replace(DOTS, ".").replace(DASHES, "-")
    .replace(/\s*\|\s*/g, " / ")      // "|" between words
    .replace(/[ \t]{3,}/g, " / ");     // a wide gap (3+ spaces) between words
  if (!/^[._-]/.test(n)) return { words: encode(breaks(s)), morse: false };   // its paragraphs as <BT>, lines as <AA>

  /* parse() reads every spacing: "a b / c", "_a_b_/_c_", "a/b//c" */
  return { words: clean(parse(n)), morse: true };
}

/* keep only real marks; drop anything else that came along */
function clean(words) {
  return words
    .map(w => w.map(c => c.replace(/[^.-]/g, "")).filter(Boolean))
    .filter(w => w.length);
}


/* ---------- out ---------- */

export const morseText = words => pretty(words);

/* as the reading reads it (morse.js READING: the tray's prosigns, cut) */
export function plainText(words, reading = READING) {
  return namesFor(words, reading).map(w => w.map(n => n ?? "�").join("")).join(" ");
}

export function linkTo(words, origin = location.origin) {
  return `${origin}/?/${format(words)}`;
}

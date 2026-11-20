/*
 * ============================================================
 * REF ALIAS: the other names a reference page answers to
 * ============================================================
 *
 * Each character has one page, named as an address can be (/ref/r/,
 * /ref/dollar/). Someone typing an address reaches for whatever they
 * call it, so these find the same page:
 *
 *   /ref/romeo        its spelling name        ┐
 *   /ref/R            in capitals              │
 *   /ref/_.-._        its marks, as a ?/ link   ├──►  /ref/r/
 *   /ref/.-.          its marks, bare           ┘
 *
 *   /ref/%24          the character, escaped   ┐
 *   /ref/dollar-sign  its name, said longer     ├──►  /ref/dollar/
 *   /ref/_...-..-_    its marks                 ┘
 *
 *   /ref/ar           a prosign by its letters ──►  /ref/plus/#prosign
 *   /ref/one          a number in words        ──►  /ref/1/
 *
 * And Morse at the root, with no ?/ before it, is a page's address
 * too (rootAlias): the reference is what reads it.
 *
 *   /_.-._            a character's marks      ──►  /ref/r/
 *   /_...._.._        a word with a page (HI)  ──►  /ref/hi/
 *   /_...._.._/_-.-_  a message, no page of its own:
 *                     the station, playing it  ──►  /?/_...._.._/_-.-_
 *
 * Pure (an address in, an address or null out), so the 404 page and
 * the Worker ask the same thing: the Worker answers 301, the 404 page
 * moves on by itself where there's no Worker (Pages alone, npm run
 * serve). A page that exists is never asked: it was found.
 */
import { ENCODE, parse, format } from "../core/morse.js";
import { PHONETIC, PROSIGNS_BY_CODE } from "../core/characters.js";
import { PAGES } from "./pages.js";
import { GROUPS } from "../shared/nav-tables.js";

/* the pages: each character's, and the ones that gather them */
const SLUGS = new Set([...Object.values(PAGES), ...Object.keys(GROUPS), "chart", "phrases", "how-it-works"]);

/* every name the reference's tables give, in capitals: "QRL", "<AR>", "$" */
const LABELS = {};
for (const rows of Object.values(GROUPS))
  for (const [href, label] of rows) LABELS[label.toUpperCase()] ??= href;

/* words for the characters, past their page's own name */
const WORDS = {
  ...Object.fromEntries(Object.entries(PHONETIC).map(([ch, w]) => [w.toLowerCase(), ch])),
  alpha: "A", juliet: "J", xray: "X", whisky: "W",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", niner: "9",
  "full-stop": ".", stop: ".", dot: ".", point: ".", "decimal-point": ".",
  question: "?", query: "?", exclamation: "!", bang: "!",
  "forward-slash": "/", stroke: "/", oblique: "/",
  "open-paren": "(", "left-paren": "(", "open-parenthesis": "(", "left-parenthesis": "(", "left-bracket": "(", "open-round-bracket": "(",
  "close-paren": ")", "right-paren": ")", "close-parenthesis": ")", "right-parenthesis": ")", "right-bracket": ")", "close-round-bracket": ")",
  and: "&", amp: "&", equal: "=", minus: "-",
  "double-quote": '"', quotation: '"', quotes: '"', "single-quote": "'",
  "at-sign": "@", "commercial-at": "@", dollars: "$", "dollar-sign": "$"
};

const page = ch => PAGES[ENCODE[ch]] && `/ref/${PAGES[ENCODE[ch]]}/`;

export function refAlias(pathname) {
  const m = /^\/ref\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  let raw = m[1];
  try { raw = decodeURIComponent(raw); } catch { /* as it came */ }

  /* a page that is, only asked for in capitals */
  const low = raw.toLowerCase();
  if (SLUGS.has(low)) return low === raw ? null : `/ref/${low}/`;

  /* the character itself: /ref/$, /ref/%3B, /ref/K */
  if ([...raw].length === 1) return page(raw.toUpperCase());

  /* its marks: _.-._ (a link's own form), .-. , a few letters run together */
  if (/^[._\-\s]+$/.test(raw) && /[.-]/.test(raw)) {
    const words = parse(raw);
    if (words.length !== 1) return null;
    /* a prosign's letters, sent apart: _..._---_..._ is SOS */
    const code = words[0].join(" "), run = words[0].join("");
    const at = PAGES[code] ?? (PROSIGNS_BY_CODE[run] && PAGES[run]);
    return at ? `/ref/${at}/` : null;
  }

  /* a name from the tables: QRL, AR (a prosign, by its letters) */
  const up = raw.toUpperCase().replace(/^<(.*)>$/, "$1");
  if (LABELS[up]) return LABELS[up];
  if (LABELS[`<${up}>`]) return LABELS[`<${up}>`];

  /* in words: romeo, dollar sign, question_mark, exclamation-point */
  const word = low.trim().replace(/[\s_+]+/g, "-");
  for (const w of [word, word.replace(/-(sign|mark|point|symbol)$/, "")]) {
    if (SLUGS.has(w)) return `/ref/${w}/`;
    if (WORDS[w]) return page(WORDS[w]);
  }
  return null;
}

/* the root's: only an address that's all marks (no page of the site's
   is named in dots and dashes), else null */
export function rootAlias(pathname) {
  const raw = pathname.replace(/^\/+|\/+$/g, "");
  if (!/^[._\-/]+$/.test(raw) || !/[.-]/.test(raw)) return null;
  const words = parse(raw);
  if (!words.length) return null;
  if (words.length === 1) {
    const page = refAlias(`/ref/${format(words)}`);   // as Morse: /- is T, not the hyphen
    if (page) return page;
  }
  return `/?/${format(words)}`;
}

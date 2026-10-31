/*
 * Suggestions: chips in the row under the player, between settings
 * and the input modes, that finish what you've started.
 *
 *   ⌃ settings  [R.] [W-] [L..] │ [AGN] [ANT] │ [<AA>] [<AR>]  ♪ ☼ ≋ .- ⇄ A  ⌄
 *               letters           words          prosigns
 *
 * They sit on the edge of a dial: one chip at a time faces you, the
 * rest turn away into the shade either side (tx.css .chips). So the
 * first one rests in the middle, and a wheel turns it a chip at a time.
 *
 * Always in that order, a thin rule between the groups:
 *
 *   letters    keying: what the letter being keyed could still
 *              become, the three nearest down the tree (with the
 *              marks still to key)
 *   words      the word, finished: the operators' words first
 *              (abbreviations and Q codes, as on /ref), then a few
 *              common ones
 *   prosigns   only with the tray's "prosigns" on, in brackets as
 *              everywhere (<SK>): keying, the ones further down the
 *              tree from the marks so far; typing, the ones whose
 *              letters start the word
 *
 * A tap keys it (a letter or prosign goes in as if keyed, so a
 * prosign does its job) or, typing, replaces the partial word.
 *
 * Behind a setting (the tray's "suggest"), on until switched off:
 * predictions work against practice, and its note says so.
 *
 *   createSuggest({ state, retype, update, press }) → { draw }
 */
import { DECODE, encode } from "../morse.js";
import { PROSIGNS_BY_CODE } from "../characters.js";
import { structure, tokensOf } from "./state.js";
import { $, el } from "./dom.js";

/* the operators' words, the most used first (the lists on /ref) */
const HAM = [
  "CQ", "DE", "73", "TU", "TNX", "UR", "RST", "5NN", "QTH", "NAME", "OP", "ES", "FB", "HR", "PSE", "AGN",
  "K", "R", "GM", "GA", "GE", "OM", "YL", "88", "CUL", "HI", "WX", "RIG", "ANT", "BK", "GL",
  "QSL", "QSO", "QRZ", "QRT", "QRS", "QRQ", "QRM", "QRN", "QRP", "QRO", "QRX", "QSY", "QRL", "QRV", "QRU", "QSB", "QSK", "QTR"
];
/* and a few everyday ones */
const COMMON = [
  "THE", "AND", "YOU", "THAT", "FOR", "ARE", "WITH", "THIS", "HAVE", "FROM", "NOT", "BUT", "WHAT", "ALL",
  "WERE", "WHEN", "WE", "THERE", "CAN", "YOUR", "WHICH", "THEIR", "SAID", "WILL", "EACH", "ABOUT", "HOW",
  "UP", "OUT", "THEM", "THEN", "SHE", "MANY", "SOME", "SO", "THESE", "WOULD", "OTHER", "INTO", "HAS",
  "MORE", "HER", "TWO", "LIKE", "HIM", "SEE", "TIME", "COULD", "NO", "MAKE", "THAN", "FIRST", "BEEN",
  "CALL", "WHO", "NOW", "PEOPLE", "MY", "MADE", "OVER", "DID", "DOWN", "ONLY", "WAY", "FIND", "USE",
  "MAY", "WATER", "LONG", "LITTLE", "VERY", "AFTER", "WORDS", "WHERE", "MOST", "KNOW", "HELLO", "WORLD",
  "THANKS", "PLEASE", "GOOD", "MORNING", "NIGHT", "HOME", "LOVE", "HELP", "STOP", "SIGNAL", "RADIO",
  "STATION", "MESSAGE", "RECEIVED", "WEATHER", "TODAY", "TOMORROW", "YES", "OK"
];
const WORDS = [...HAM, ...COMMON];
const LETTERS = 3, MAX_WORDS = 8;
const TURN = 60;      // px: a wheel's notch, about a chip (the snap finishes it)

/* the words that start with what's there (not what's there already) */
const completing = start => WORDS.filter(w => w !== start && w.startsWith(start)).slice(0, MAX_WORDS);

/*
 * The prosigns, by code, as they're written (<SK>), the shortest
 * first, and what typing puts in for one: AR, BT, KN and AS share
 * their codes with + = ( &, so they're typed as the symbol (as the
 * prosign keyboard does).
 */
const PRO = Object.entries(PROSIGNS_BY_CODE).map(([code, [name]]) => ({ code, name: `<${name}>`, letters: name }))
  .sort((a, b) => a.code.length - b.code.length);
const typedAs = p => (DECODE[p.code]?.startsWith("<") ? p.name : DECODE[p.code]);

/* every code further down the tree, a level at a time: the nearest first */
function below(path, depth = 9) {
  const out = [];
  let level = [path];
  for (let d = 0; d < depth && level.length; d++) {
    level = level.flatMap(c => [c + ".", c + "-"]).filter(c => c.length <= 9);
    out.push(...level);
  }
  return out;
}

export function createSuggest({ state, retype, update, press }) {
  const box = $("#chips");
  const KEY = "dot-dash:tx-suggest";
  const flag = $("#opt-suggest");
  const prosignsOn = () => $("#opt-prosigns").checked;
  try { flag.checked = localStorage.getItem(KEY) !== "0"; } catch { }
  flag.addEventListener("change", () => {
    try { localStorage.setItem(KEY, flag.checked ? "1" : "0"); } catch { }
    draw();
  });
  $("#opt-prosigns").addEventListener("change", () => draw());

  /* a mouse wheel only goes up and down: here, that turns the dial
     (a trackpad's sideways swipe scrolls by itself) */
  box.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    box.scrollBy({ left: Math.sign(event.deltaY) * TURN, behavior: "smooth" });
  }, { passive: false });

  /* the marks still to key, in their colours */
  const marks = code => {
    const m = el("span", "marks");
    for (const s of code) m.append(el("span", s === "." ? "dot" : "dash", s));
    return m;
  };

  function chip(label, act, rest = "") {
    const b = el("button", "chip");
    b.type = "button";
    b.append(el("span", "chip-name", label));
    if (rest) b.append(marks(rest));
    b.addEventListener("click", act);
    return b;
  }

  /* typing: the partial word, swapped for the whole one (and a space) */
  function typed() {
    const partial = state.typed.match(/\S*$/)[0].toUpperCase();
    if (!partial || partial.includes("<")) return [];
    const put = w => () => retype(state.typed.slice(0, state.typed.length - partial.length) + w + " ");
    const words = completing(partial).map(w => chip(w, put(w)));
    const pros = prosignsOn() ? PRO.filter(p => p.letters.startsWith(partial)).map(p => chip(p.name, put(typedAs(p)))) : [];
    return [[], words, pros];
  }

  /* keying: the letter's next branches, words, prosigns further down */
  function keyed() {
    const { word, path } = structure(state.tokens);
    const t = state.tokens;
    /* where the current letter, and the current word, start */
    let letterAt = t.length;
    while (letterAt && (t[letterAt - 1] === "." || t[letterAt - 1] === "-")) letterAt--;
    let wordAt = t.length;
    while (wordAt && t[wordAt - 1] !== "/") wordAt--;
    if (word.some(c => !DECODE[c])) return [];
    const done = word.map(c => DECODE[c]).join("");
    /* a letter (or prosign) as if keyed: its marks, then the letter
       space, which closes it (and lets a prosign do its job) */
    const keyIn = code => () => {
      state.tokens.splice(letterAt, Infinity, ...code);
      state.took.splice(letterAt, Infinity, ...[...code].map(() => null));
      state.lastInput = performance.now();
      press("letter");
    };
    /* with prosigns on, + = ( & are AR BT KN AS: prosigns, not letters */
    const isPro = code => prosignsOn() && PROSIGNS_BY_CODE[code];
    const isChar = code => DECODE[code] && !DECODE[code].startsWith("<") && !isPro(code);
    const down = path ? below(path) : [];
    const letters = down.filter(isChar).slice(0, LETTERS)
      .map(c => chip(DECODE[c], keyIn(c), c.slice(path.length)));
    /* words: what's keyed so far, then a letter it could still be */
    const starts = path ? [path, ...below(path, 2)].filter(isChar).map(c => done + DECODE[c]) : done ? [done] : [];
    const seen = new Set();
    const words = [];
    for (const s of starts) for (const w of completing(s)) {
      if (seen.has(w) || words.length >= MAX_WORDS) continue;
      seen.add(w);
      words.push(chip(w, () => {
        const toks = tokensOf(encode(w));
        toks[toks.length - 1] = "/";    // the word, and a word space after it
        state.tokens.splice(wordAt, Infinity, ...toks);
        state.took.splice(wordAt, Infinity, ...toks.map(() => null));
        state.lastInput = performance.now();
        update();
      }));
    }
    const pros = down.filter(isPro).map(c => chip(PRO.find(p => p.code === c).name, keyIn(c), c.slice(path.length)));
    return [letters, words, pros];
  }

  function draw() {
    const groups = flag.checked ? (state.mode === "type" ? typed() : keyed()) : [];
    /* the groups in their order, a rule between those that are there */
    const out = [];
    for (const g of groups.filter(g => g.length)) {
      if (out.length) out.push(el("span", "chip-rule", "│"));
      out.push(...g);
    }
    box.replaceChildren(...out);
    box.scrollLeft = 0;
  }

  return { draw };
}

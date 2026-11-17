/*
 * Suggestions: chips in the row under the player, between settings
 * and the input modes, that finish what you've started.
 *
 *   ⌃ settings  [R.] [W-] [L..] │ [AGN] [ANT] │ [<AA>] [<AR>]  ♪ ☼ ≋ .- ⇄ A  ⌄
 *               letters           words          prosigns
 *
 * They sit in a row from the left, solid, a shade at the right while
 * there are more that way (tx.css .chips.more); a drag or a wheel
 * scrolls them sideways, and once they've moved a shade comes in at
 * the left too (.chips.scrolled), where the ones that went are.
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
 * Transmitting, the row is never empty: on an empty line, a few to
 * start a message with; at the start of each word after that (after
 * a word space, before its first mark or letter), a few that carry
 * one on, what an exchange is made of. A whole word each. Receiving,
 * with nothing heard to follow yet, empty boxes stand in their place,
 * waiting, so the row looks the same either way.
 *
 *   tx, empty line    [CQ] [PARIS] [SOS] [73]
 *   tx, a new word    [DE] [K] [TU] [73]
 *   rx, nothing yet   [  ] [  ] [  ] [  ] [  ] [  ] …
 *
 * Receiving (rx), they follow what's coming in the same way, whichever
 * input mode was left behind: the letter being heard, the word it's
 * heading for, right above the scope. A tap takes it, as a fix.
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
/* to start a message with: a call, the word speed is timed by, the
   distress call (as a word: the prosign is <SOS>), best regards */
const STARTERS = ["CQ", "PARIS", "SOS", "73"];
/* and between words: from, over, thanks, best regards */
const BETWEEN = ["DE", "K", "TU", "73"];
const BLANKS = 8;     /* rx, nothing heard yet: enough empty boxes to fill the row, and run on under its shade */
const LETTERS = 3, MAX_WORDS = 8;
const TURN = 60;      // px: a wheel's notch, about a chip

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
  /* two switches, each remembered: finish (what's begun: the letter,
     the word; the tray's box) and next (the starters, and a few
     between words). Practice wants finish off; next can stay */
  const KEY = "dot-dash:tx-suggest", NEXT_KEY = "dot-dash:tx-next";
  const flag = $("#opt-suggest"), next = $("#opt-next");
  const prosignsOn = () => $("#opt-prosigns").checked;
  try { flag.checked = localStorage.getItem(KEY) !== "0"; next.checked = localStorage.getItem(NEXT_KEY) !== "0"; } catch { }
  flag.addEventListener("change", () => {
    try { localStorage.setItem(KEY, flag.checked ? "1" : "0"); } catch { }
    draw();
  });
  next.addEventListener("change", () => {
    try { localStorage.setItem(NEXT_KEY, next.checked ? "1" : "0"); } catch { }
    draw();
  });
  $("#opt-prosigns").addEventListener("change", () => draw());

  /* a mouse wheel only goes up and down: here, that scrolls the row
     (a trackpad's sideways swipe scrolls by itself) */
  box.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    box.scrollBy({ left: Math.sign(event.deltaY) * TURN, behavior: "smooth" });
  }, { passive: false });
  /* moved from the start: the shade at the left; more to come: the right's */
  const shade = () => {
    box.classList.toggle("scrolled", box.scrollLeft > 1);
    box.classList.toggle("more", box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
  };
  box.addEventListener("scroll", shade, { passive: true });
  new ResizeObserver(shade).observe(box);

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
    if (!state.typed && !state.rx) return next.checked ? [STARTERS.map(w => chip(w, () => retype(w + " ")))] : [];
    if (/\s$/.test(state.typed) && !state.rx) return next.checked ? [BETWEEN.map(w => chip(w, () => retype(state.typed + w + " ")))] : [];
    if (!flag.checked) return [];
    const partial = state.typed.match(/\S*$/)[0].toUpperCase();
    if (!partial || partial.includes("<")) return [];
    const put = w => () => retype(state.typed.slice(0, state.typed.length - partial.length) + w + " ");
    const words = completing(partial).map(w => chip(w, put(w)));
    const pros = prosignsOn() ? PRO.filter(p => p.letters.startsWith(partial)).map(p => chip(p.name, put(typedAs(p)))) : [];
    return [[], words, pros];
  }

  /* a whole word onto the line from where it starts, and a word space after it */
  function keyWord(w, wordAt) {
    const toks = tokensOf(encode(w));
    toks[toks.length - 1] = "/";
    state.tokens.splice(wordAt, Infinity, ...toks);
    state.took.splice(wordAt, Infinity, ...toks.map(() => null));
    state.lastInput = performance.now();
    update();
  }

  /* keying: the letter's next branches, words, prosigns further down */
  function keyed() {
    const { word, path } = structure(state.tokens);
    const t = state.tokens;
    /* nothing yet: the starters, each the whole word and a word space */
    if (!t.length && !state.rx) return next.checked ? [STARTERS.map(w => chip(w, () => keyWord(w, 0)))] : [];
    /* a new word, nothing of it keyed yet: a few to carry on with */
    if (!word.length && !path && !state.rx) return next.checked ? [BETWEEN.map(w => chip(w, () => keyWord(w, t.length)))] : [];
    if (!flag.checked) return [];
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
      words.push(chip(w, () => keyWord(w, wordAt)));
    }
    const pros = down.filter(isPro).map(c => chip(PRO.find(p => p.code === c).name, keyIn(c), c.slice(path.length)));
    return [letters, words, pros];
  }

  function draw() {
    const groups = state.mode === "type" && !state.rx ? typed() : keyed();
    /* the groups in their order, a rule between those that are there */
    const out = [];
    for (const g of groups.filter(g => g.length)) {
      if (out.length) out.push(el("span", "chip-rule", "│"));
      out.push(...g);
    }
    /* receiving, nothing heard yet: the boxes, empty, waiting */
    if (!out.length && flag.checked && state.rx) for (let i = 0; i < BLANKS; i++) {
      const blank = el("span", "chip blank");
      blank.setAttribute("aria-hidden", "true");
      out.push(blank);
    }
    box.replaceChildren(...out);
    box.scrollLeft = 0;
    shade();
  }

  return { draw };
}

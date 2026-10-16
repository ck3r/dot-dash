/*
 * ============================================================
 * TX — the transmit station   (dot-da.sh/tx)
 * ============================================================
 *
 * Step 1: tap keying, the tape (history), the tree edge.
 *
 * The message being keyed is a list of tokens, exactly what
 * was pressed:
 *
 *   .  -     a mark
 *   " "      letter space   (closes the letter being keyed)
 *   /        word space
 *
 *   [".", ".", ".", ".", " ", ".", "/", ".", "-", "-"]
 *        H                  E   /    W (so far: .--)
 *
 * so undo is simply "drop the last token". Everything shown
 * is worked out from the tokens on every change.
 *
 * Sent messages go on the tape (history): the last 25, kept on
 * this device, stored as Morse in the URL's canonical form
 * (lossless: prosigns and codes with no letter survive).
 */

import { DECODE, ENCODE, TREE, encode, parse, format } from "./morse.js";
import { createTree, buildModel, CUT } from "./tree.js";
import { createKeyer, timing, MODES } from "./tx-keyer.js";
import { createSound } from "./tx-sound.js";
import { createPlayer, timeline } from "./tx-player.js";
import * as share from "./tx-share.js";
import { createOutputs, flashRate } from "./tx-outputs.js";
import { PHONETIC, PROSIGNS_BY_CODE, splits, renderCard } from "./overview.js";
import { createTrace } from "./tx-trace.js";

const $ = s => document.querySelector(s);

/*
 * ARRIVAL: the note over the keys (don't send anything private) is
 * gone at the first touch, click or key press anywhere, and that
 * first interaction does nothing else: no dit, no play, no menu.
 * Its (i) is the one exception: the note goes and the details open.
 * Registered first, so it's ahead of every other handler.
 */
{
  const REST = ["pointerup", "click", "mouseup", "touchend", "keyup", "contextmenu"];
  const eat = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const stopEating = () => { for (const t of REST) window.removeEventListener(t, eat, true); };
  /* seen in the last 30 days (see the <head>): it stays away */
  const NOTICE_KEY = "dot-dash:tx-noticed";
  if (document.documentElement.classList.contains("noticed")) $("#notice").hidden = true;
  const first = event => {
    const notice = $("#notice");
    if (!notice || notice.hidden) return finish();
    notice.hidden = true;
    try { localStorage.setItem(NOTICE_KEY, String(Date.now())); } catch { }
    try { sound.unlock(); } catch { }     // the first touch wakes the sound (browsers need one)
    eat(event);
    for (const t of REST) window.addEventListener(t, eat, { capture: true, once: true });
    setTimeout(stopEating, 700);          // a drag gives no click: stop waiting for one
    /* on touch, the swallowed release means no click comes at all:
       the next press clears whatever is still waiting */
    for (const t of ["pointerdown", "keydown"]) window.addEventListener(t, stopEating, { capture: true, once: true });
    if (event.type === "pointerdown" && event.target.closest?.("#notice .privacy-open")) {
      setTimeout(() => openPrivacy(true));  // after the handlers below are in place
    }
    finish();
  };
  const finish = () => {
    window.removeEventListener("pointerdown", first, true);
    window.removeEventListener("keydown", first, true);
  };
  window.addEventListener("pointerdown", first, true);
  window.addEventListener("keydown", first, true);
}

const HISTORY_KEY = "dot-dash:tx-history";
const HISTORY_MAX = 25;


/*
 * ============================================================
 * THE MESSAGE
 * ============================================================
 */

let tokens = [];

/*
 * How each token was actually keyed (timed modes): for a mark,
 * { on, gap } in ms; null for spaces and for anything tapped or
 * typed. Kept in step with tokens, so undo takes both, and saved
 * with the message so playback can replay YOUR timing.
 */
let took = [];

const isMark = t => t === "." || t === "-";

/* the recorded timing, one [on, gap] (or null) per mark; [] if none */
function recOf(toks, times) {
  const rec = toks.map((t, i) => (isMark(t) ? times[i] : undefined)).filter(x => x !== undefined)
    .map(x => (x ? (x.unit ? [x.on, x.gap, x.unit] : [x.on, x.gap]) : null));
  return rec.some(Boolean) ? rec : [];
}

/* lay a recording back over tokens (recall from history) */
function tookFor(toks, rec = []) {
  let k = 0;
  return toks.map(t => {
    if (!isMark(t)) return null;
    const r = rec[k++];
    return r ? { on: r[0], gap: r[1], unit: r[2] } : null;
  });
}

/* history entries: plain Morse, or { m: Morse, t: recording } */
const morseOf = e => (typeof e === "string" ? e : e.m);
const recOfEntry = e => (typeof e === "string" ? [] : e.t ?? []);

/* tokens → { done: finished words, word: letters of the word in
   progress, path: the letter being keyed, slash: ends in "/" } */
function structure(toks) {
  const done = [];
  let word = [];
  let path = "";
  for (const t of toks) {
    if (t === "." || t === "-") path += t;
    else if (t === " ") { if (path) word.push(path); path = ""; }
    else if (t === "/") {
      if (path) word.push(path);
      path = "";
      if (word.length) done.push(word);
      word = [];
    }
  }
  return { done, word, path, slash: toks[toks.length - 1] === "/" };
}

/* the whole message as words of codes (the letter in progress counts) */
function wordsOf(toks) {
  const { done, word, path } = structure(toks);
  const last = path ? [...word, path] : word;
  return last.length ? [...done, last] : done;
}

function tokensOf(words) {
  const out = [];
  words.forEach((word, w) => {
    if (w) out.push("/");
    word.forEach((code, c) => {
      if (c) out.push(" ");
      out.push(...code);
    });
  });
  if (out.length) out.push(" ");   // the last letter is finished
  return out;
}

function press(act, timing = null) {
  lastInput = performance.now();
  if (act === "." || act === "-" || act === "undo") localCleared = false;
  if (timing) timing.unit = Math.round(timingNow().unit * 10) / 10;   // the speed it was keyed at
  const last = tokens[tokens.length - 1];
  switch (act) {
    case ".":
    case "-":
      tokens.push(act);
      took.push(timing);
      break;
    case "letter":
      if (last === "." || last === "-") { tokens.push(" "); took.push(null); }
      break;
    case "word":
      if (!tokens.length || last === "/") break;
      if (last === " ") tokens[tokens.length - 1] = "/";
      else { tokens.push("/"); took.push(null); }
      break;
    case "undo":
      tokens.pop();
      took.pop();
      break;
  }
  update();
}

function send() {
  const words = wordsOf(tokens);
  if (!words.length) return;
  keyer.reset();
  const rec = recOf(tokens, took);
  history.push(rec.length ? { m: format(words), t: rec } : format(words));
  while (history.length > HISTORY_MAX) history.shift();
  saveHistory();
  tokens = [];
  took = [];
  setTyped("");
  trace.rest();
  update();
}


/*
 * ============================================================
 * HISTORY (the tape)
 * ============================================================
 */

let history = [];

try {
  history = JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? [];
  if (!Array.isArray(history)) history = [];
} catch { history = []; }

function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage blocked */ }
}


/*
 * ============================================================
 * DRAWING
 * ============================================================
 */

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* one letter: its code over its character (under the 2nd mark) */
function letter(code, partial = false) {
  const c = el("span", partial ? "c partial" : "c");
  const m = el("span", "m");
  for (const s of code) m.append(el("span", s === "." ? "dot" : "dash", s));
  const name = DECODE[code] ?? (partial ? "?" : "�");
  const under = Math.min(1, code.length - 1);
  c.append(m, el("span", "p", " ".repeat(under) + name));
  return c;
}

/* a line: words of letters with slashes between; optionally the
   letter being keyed, a trailing slash and the caret */
function line(words, { path = "", slash = false, caret = false } = {}) {
  const box = el("span", "line");
  words.forEach((word, w) => {
    if (w) box.append(el("span", "slash", "/"));
    const wEl = el("span", "w");
    word.forEach(code => wEl.append(letter(code)));
    if (w === words.length - 1 && path) wEl.append(letter(path, true));
    box.append(wEl);
  });
  if (path && !words.length) {
    const wEl = el("span", "w");
    wEl.append(letter(path, true));
    box.append(wEl);
  }
  if (slash) box.append(el("span", "slash", "/"));
  if (caret) {
    /* the caret rides on the last letter, so it can never wrap onto
       a line of its own; after a word break it stands alone */
    const last = slash ? null : [...box.querySelectorAll(".c")].at(-1);
    if (last) last.append(el("span", "caret tail"));
    else box.append(el("span", "caret"));
  }
  return box;
}

function drawTape() {
  const tape = $("#tape");
  tape.textContent = "";

  /* the top of the history: clear it (tap twice) */
  if (history.length) {
    const head = el("li", "tape-head");
    const b = el("button", clearArmed ? "armed" : "", clearArmed ? "tap again to clear all history" : "clear history");
    b.type = "button";
    b.addEventListener("click", clearHistory);
    head.append(b);
    tape.append(head);
  }

  history.forEach((saved, i) => {
    const li = el("li", "entry past");
    li.append(el("span", "marker", ""));
    const l = line(parse(morseOf(saved)));
    l.title = "tap to key it again";
    l.addEventListener("click", () => recall(i));
    li.append(l);
    const x = el("button", "x");
    x.innerHTML = icon("x");
    x.type = "button";
    x.setAttribute("aria-label", "remove from history");
    x.addEventListener("click", () => {
      history.splice(i, 1);
      saveHistory();
      update();
    });
    li.append(x);
    tape.append(li);
  });

  /* hide the row you're not entering, on every line, if asked */
  tape.classList.toggle("hide-p", mode === "key" && hidden);
  tape.classList.toggle("hide-m", mode === "type" && hidden);

  /* the current line */
  const { done, word, path, slash } = structure(tokens);
  const li = el("li", "entry current");
  li.append(markerColumn());
  if (!tokens.length) {
    const hint = el("span", "line empty-line");
    hint.append(el("span", "caret first"), el("span", "", mode === "type" ? "type a message" : "tap dit or dah"));
    li.append(hint);
  } else {
    const words = word.length || path ? [...done, word] : done;
    li.append(line(words, { path, slash, caret: true }));
    const x = el("button", "x");
    x.innerHTML = icon("x");
    x.type = "button";
    x.setAttribute("aria-label", "clear this message");
    x.addEventListener("click", () => { clearCurrent(); update(); });
    li.append(x);
  }
  tape.append(li);
  steadyCaret();
  settleTape();
}

/*
 * Like a text editor: the caret blinks when it's ready and
 * waiting, and holds steady while you're keying.
 */
let lastInput = -Infinity;
let caretTimer = null;
const STEADY_MS = 700;

function steadyCaret() {
  const caret = $("#tape .current .caret");
  if (!caret) return;
  const since = performance.now() - lastInput;
  if (since >= STEADY_MS) return;
  caret.classList.add("steady");
  clearTimeout(caretTimer);
  caretTimer = setTimeout(() => $("#tape .current .caret")?.classList.remove("steady"), STEADY_MS - since);
}

/*
 * The current line's marker column has a slot per row:
 *
 *   keying            typing
 *   > .- -...         👁 .- -...      > marks the row you're entering;
 *   👁 A   B          >  A   B        the eye shows / hides the other
 *
 * Hidden, each word (between the slashes) becomes a solid bar the
 * width of the word, on that row, for every line on the tape:
 * how many words and roughly how long, but not what they say.
 */
/* one setting for both modes: "hide the row I'm not entering"
   (keying: the letters; typing: the Morse) */
let hidden = false;
try {
  const saved = JSON.parse(localStorage.getItem("dot-dash:tx-hide"));
  hidden = typeof saved === "boolean" ? saved : !!(saved && (saved.key || saved.type));
} catch { }

/* what the eye is hiding right now: "letters" (keying), "morse"
   (typing), or null. The tree and the about column hide it too,
   and a hidden part can't be tapped either (no copying, no links). */
const hiding = () => (hidden ? (mode === "type" ? "morse" : "letters") : null);

/* make a part hidden: a bar, out of reach of taps and the keyboard */
function redact(e) {
  e.classList.add("redact");
  e.setAttribute("aria-hidden", "true");
  e.tabIndex = -1;
  if (e.tagName === "BUTTON") e.disabled = true;
  if (e.tagName === "A") e.removeAttribute("href");
  e.removeAttribute("title");
  return e;
}

/* an icon from the sprite in tx/index.html */
const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const EYE_OPEN = `<svg class="ico eye-ico" viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 8C5.5 2.5 18.5 2.5 22.5 8C18.5 13.5 5.5 13.5 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="8" r="2.8" fill="currentColor"/></svg>`;
const EYE_SHUT = `<svg class="ico eye-ico" viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 6C5.5 11.5 18.5 11.5 22.5 6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 9.8 5 12.6M12 11.1v3.1M17.5 9.8 19 12.6" stroke="currentColor" stroke-width="1.4"/></svg>`;

function markerColumn() {
  const col = el("span", "marker two");
  const active = el("span", "m-active", ">");
  const what = mode === "type" ? "Morse" : "letters";
  const off = hidden;
  const eye = el("button", "eye");
  eye.type = "button";
  eye.innerHTML = off ? EYE_SHUT : EYE_OPEN;
  eye.title = (off ? "show " : "hide ") + what;
  eye.setAttribute("aria-label", eye.title);
  eye.setAttribute("aria-pressed", String(off));
  eye.addEventListener("click", () => {
    const now = !off;
    hidden = now;
    try { localStorage.setItem("dot-dash:tx-hide", JSON.stringify(hidden)); } catch { }
    update();
    toast(`${what} ${now ? "hidden" : "shown"}`);
  });
  /* keying: > on the Morse row; typing: > on the letters row */
  if (mode === "type") col.append(eye, active);
  else col.append(active, eye);
  return col;
}

/*
 * The current line sits at the TOP of the field, with the
 * bottom of the previous message peeking above it (and a fade
 * while there's history up there), like a calculator display:
 *
 *   ┌───────────────────────────┐
 *   │   H   E   L   L   O       │  ← previous, cut off: scroll up
 *   ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
 *   │ > .-- --- .-.             │  ← current, room to grow below
 *   │    W   O   R              │
 */
const PEEK = 26;   // px of the previous message left showing

/* the line can re-wrap with no keystroke (the field narrowing or
   widening beside it): the marker follows on any change of size */
const markerWatch = new ResizeObserver(() => {
  const cur = $("#tape .current");
  if (cur) placeMarker(cur);
});

function settleTape() {
  const tape = $("#tape");
  const cur = tape.querySelector(".current");
  placeMarker(cur);
  markerWatch.disconnect();
  markerWatch.observe(tape);
  const line = cur.querySelector(".line");
  if (line) markerWatch.observe(line);
  const prev = cur.previousElementSibling;
  const peek = prev ? Math.min(PEEK, prev.offsetHeight) : 0;
  tape.style.setProperty("--peek", peek + "px");
  const padBottom = parseFloat(getComputedStyle(tape).paddingBottom) || 0;

  /* read mode: no keys, so let the history fill the space above */
  if (document.body.classList.contains("reading")) {
    cur.style.minHeight = "";
    tape.scrollTop = tape.scrollHeight;
    fadeTape();
    return;
  }

  cur.style.minHeight = Math.max(0, tape.clientHeight - peek - padBottom) + "px";
  tape.scrollTop = cur.offsetTop - peek;

  /* a long message: follow the caret down instead, keeping its
     whole line in view (both rows, with the > and the eye) */
  const caret = cur.querySelector(".caret");
  if (caret) {
    const marker = cur.querySelector(".marker");
    const top = tape.getBoundingClientRect().top - tape.scrollTop;
    const lowest = Math.max(caret.getBoundingClientRect().bottom, marker?.getBoundingClientRect().bottom ?? 0);
    const bottom = lowest - top + 8;
    if (bottom > tape.scrollTop + tape.clientHeight) tape.scrollTop = bottom - tape.clientHeight;
  }
  fadeTape();
}

/*
 * The > and the eye ride beside the caret: a message that wraps
 * onto more lines takes them down with it, so they never scroll
 * out of view while you write.
 *
 *     .-- --- .-. .-.. -..        (earlier lines)
 *      W   O   R   L   D
 *   >  .-. ▌                      ← the line the caret is on
 *   👁  R
 */
function placeMarker(cur) {
  const marker = cur.querySelector(".marker");
  const line = cur.querySelector(".line");
  const caret = cur.querySelector(".caret");
  if (!marker) return;
  let shift = 0;
  /* nothing written yet: the hint already lines up with the marker */
  if (line && caret && !line.classList.contains("empty-line")) {
    /* the top of the caret's row pair (in typing mode the caret
       sits one row down, on the letters) */
    const holder = caret.classList.contains("tail") ? caret.parentElement : null;   // riding on a letter
    const slot = holder ? holder.getBoundingClientRect().top
      : caret.getBoundingClientRect().top - (parseFloat(getComputedStyle(caret).marginTop) || 0);
    shift = Math.max(0, Math.round(slot - line.getBoundingClientRect().top));
  }
  marker.style.transform = shift ? `translateY(${shift}px)` : "";
}

/* fade the top edge only while there's history above the view */
function fadeTape() {
  const tape = $("#tape");
  const first = tape.firstElementChild;
  const above = first && !first.classList.contains("current") && tape.scrollTop > 2;
  tape.classList.toggle("more-above", !!above);
}

$("#tape").addEventListener("scroll", fadeTape, { passive: true });

/* tap a past message: it comes back as the current line */
function recall(i) {
  keyer.reset();
  tokens = tokensOf(parse(morseOf(history[i])));
  took = tookFor(tokens, recOfEntry(history[i]));
  setTyped(plainText(wordsOf(tokens)) ?? "");
  update();
}

function plainText(words) {
  const names = words.map(w => w.map(c => DECODE[c]));
  if (names.flat().some(n => !n || n.length > 1)) return null;   // not cleanly typeable
  return names.map(w => w.join("")).join(" ");
}


/*
 * stats:  chars                 dits
 *         words                 dahs
 * (how long it takes is the player's: its readout, by the play button)
 */
function drawStats() {
  const words = wordsOf(tokens);
  const codes = words.flat();
  const left = $("#stats-text"), right = $("#stats-morse");
  if (!codes.length) { left.textContent = right.textContent = ""; return; }
  const dits = codes.join("").split("").filter(s => s === ".").length;
  const dahs = codes.join("").length - dits;
  /* the counts, numbers apart: the eye hides the numbers for what it
     hides (letters: chars and words; Morse: dits and dahs) */
  const h = hiding();
  const fill = (box, rows, secret) => {
    box.textContent = "";
    rows.forEach(([n, w], i) => {
      if (i) box.append("\n");
      const num = el("span", "n", String(n));
      if (secret) num.classList.add("redact");
      box.append(num, ` ${w}${n === 1 ? "" : "s"}`);
    });
  };
  fill(left, [[codes.length, "char"], [words.length, "word"]], h === "letters");
  fill(right, [[dits, "dit"], [dahs, "dah"]], h === "morse");
}


/*
 * ============================================================
 * THE TREE
 * ============================================================
 *
 * Collapsed: a magnified view of where you are.
 *
 *     E        parent
 *     |        the step that got here (dot red, dash blue)
 *    [A]       here
 *    / \
 *   R   W      children: tap one to key that mark
 */

function treeChar(code) {
  if (!code) return "●";
  const row = TREE[code.length - 1];
  if (!row) return "_";
  const ch = row[parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2)];
  return ch && ch !== "*" ? ch : "_";
}

/*
 * What the collapsed tree (and the about below it) shows: the
 * letter being keyed, or else the last letter keyed, so it stays
 * up while you think. Pressing a space (˽ or /) yourself clears
 * it; a pause doesn't. Undo walks back through what came before.
 */
let localCleared = false;

function focusCode() {
  const { path } = structure(tokens);
  if (path) return path;
  if (localCleared) return "";
  return wordsOf(tokens).flat().at(-1) ?? "";
}

/* the last letter is showing, finished: tapping a child extends it */
const showingDone = () => !structure(tokens).path && !localCleared && wordsOf(tokens).length > 0;

function drawLocal(override) {
  const path = override ?? focusCode();
  const box = $("#local");
  box.textContent = "";
  const row = (...parts) => {
    const d = el("div");
    d.append(...parts);
    box.append(d);
  };
  const side = s => (s === "." ? "dot" : "dash");

  if (path) {
    row(el("span", "", treeChar(path.slice(0, -1))));
    row(el("span", side(path.at(-1)), "|"));
  } else {
    row(" ");
    row(" ");
  }
  row(el("span", "here", treeChar(path)));
  row(el("span", "dot", "/"), " ", el("span", "dash", "\\"));

  const child = mark => {
    const b = el("button", side(mark), treeChar(path + mark));
    b.type = "button";
    b.setAttribute("aria-label", mark === "." ? "dit" : "dah");
    b.addEventListener("click", () => extend(mark));
    return b;
  };
  row(child("."), "  ", child("-"));
  /* letters hidden: every letter here is a bar, and the children
     can't be tapped (tap the column to open the tree, as ever) */
  if (hiding() === "letters") {
    const letters = [box.children[0]?.firstElementChild, box.querySelector(".here"), ...box.querySelectorAll("button")];
    for (const e of letters) if (e && e.textContent.trim() && e.textContent !== "_") redact(e);
  }
  drawAbout(path);
}

/* a child of what's showing: key that mark onto it (a finished
   letter is reopened: R from A, not a new E) */
function extend(mark) {
  if (player.playing) stopPlayback();
  if (mode === "type") {
    const code = (showingDone() ? wordsOf(tokens).flat().at(-1) : "") + mark;
    const ch = DECODE[code];
    if (!ch || ch.startsWith("<")) return;
    return retype((showingDone() ? typed.slice(0, -1) : typed) + ch);
  }
  if (showingDone()) {
    while (tokens.length && (tokens.at(-1) === " " || tokens.at(-1) === "/")) { tokens.pop(); took.pop(); }
  }
  keyer.cancel();
  press(mark);
}

/*
 * ============================================================
 * ABOUT (under the collapsed tree)
 * ============================================================
 *
 * The rest of the column, for the letter that's showing:
 *
 *     ▪        its marks, one per row
 *     ▬
 *
 *     A        its phonetic name, first letter bold
 *     L
 *     F
 *     A
 *
 *     ~        what the same marks could be heard as, with the
 *     E        gaps inside it too long
 *     T
 *
 *     (i)      the full about, on the reference page (always
 *              there, even with the whole tree open)
 *
 * Each part does its own thing: the marks copy, the name will say
 * itself (recordings to come), the cut opens the reference tree in
 * cut numbers, and ~ explains mishearing. Only (i) goes to the
 * character's page (a new tab, so the message stays put).
 */
/* the names in syllables, for the stair: each space starts a new
   stair; a "·" is a syllable break within one (not drawn) */
const SYLLABLES = {
  A: "AL FA", B: "BRA VO", C: "CHAR LIE", D: "DEL TA", E: "ECH O", F: "FOX TROT",
  G: "GOLF", H: "HO TEL", I: "IN DI A", J: "JU LI ETT", K: "KI LO", L: "LI MA",
  M: "MIKE", N: "NO VEM BER", O: "OS CAR", P: "PA PA", Q: "QUE BEC", R: "RO ME O",
  S: "SI ER RA", T: "TAN GO", U: "U·NI FORM", V: "VIC TOR", W: "WHIS KEY",
  X: "X RAY", Y: "YAN KEE", Z: "ZU LU",
  0: "ZE RO", 1: "WUN", 2: "TOO", 3: "TREE", 4: "FOW ER", 5: "FIFE",
  6: "SIX", 7: "SEV EN", 8: "AIT", 9: "NIN ER"
};

/* the stressed syllable(s), from the official ICAO / ITU spellings
   (AL fah, hoh TELL, no VEM ber, JEW lee ETT …); the first when
   not listed */
const STRESS = { H: [1], J: [0, 2], N: [1], P: [1], Q: [1], S: [1] };

const SPOKEN_DIGITS = {
  0: "Zero", 1: "Wun", 2: "Too", 3: "Tree", 4: "Fower",
  5: "Fife", 6: "Six", 7: "Seven", 8: "Ait", 9: "Niner"
};

const aboutHref = code => `/?/_${code}_`;

let aboutCode = "";

function drawAbout(code) {
  aboutCode = code;
  const box = $("#about");
  box.textContent = "";
  const ch = code ? DECODE[code] : null;

  /* (i), always at the foot of the column (tree open or not):
     this character's page, or the reference itself */
  const info = $("#tree-info");
  const secret = hiding() === "letters";      // don't name the letter in the tooltip either
  info.href = code ? aboutHref(code) : "/";
  info.title = code && !secret ? `everything about ${ch ?? code}` : code ? "everything about this character" : "the reference: every character";
  info.setAttribute("aria-label", info.title);
  if (!code) return;
  if (box.hidden) return buildAbout(box, code, ch);

  buildAbout(box, code, ch);
  fitAbout();
}

/* a moment's word in the column ("copied", "soon"), over the part tapped */
function flashWord(button, word) {
  button.dataset.flash = word;
  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => delete button.dataset.flash, 1200);
}

function buildAbout(box, code, ch) {
  box.textContent = "";
  /* the marks (always full size), and its name: the phonetic word
     stepped down the column by syllable, the stressed one bold,
     or the prosign, across */
  const main = el("span", "about-main");
  const marks = el("button", "about-marks");
  marks.type = "button";
  marks.title = `copy ${code}`;
  marks.setAttribute("aria-label", `copy the marks, ${code}`);
  for (const m of code) marks.append(el("i", m === "." ? "dot" : "dash"));
  marks.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(code); flashWord(marks, "copied"); }
    catch { flashWord(marks, "can't copy"); }
  });
  main.append(marks);
  const spoken = ch && (PHONETIC[ch] ?? SPOKEN_DIGITS[ch]);
  const prosign = ch?.startsWith("<") ? ch : PROSIGNS_BY_CODE[code] ? `<${PROSIGNS_BY_CODE[code][0]}>` : null;
  if (spoken) {
    const name = el("button", "about-name");
    name.type = "button";
    name.title = `say ${spoken} (recordings coming soon)`;
    name.setAttribute("aria-label", name.title);
    name.addEventListener("click", () => flashWord(name, "soon"));
    /* each letter its own row; across, it steps one column per
       letter and back to the first at each syllable (the stair) */
    let i = 0;
    const syllables = (SYLLABLES[ch] ?? spoken.toUpperCase()).split(" ");
    /* a group is one stair; a "·" inside it is a syllable break that
       isn't drawn (U·NI FORM: two stairs, three syllables, U stressed) */
    const stressed = STRESS[ch] ?? [0];
    let syl = 0;
    syllables.forEach((group, gi) => {
      const letters = group.replaceAll("·", "");
      let k = 0;
      for (const c of group) {
        if (c === "·") { syl++; continue; }      // a break, not drawn: the bold shows it
        /* only the stressed syllable stands out (the letter itself is
           shown big in the tree, just above) */
        const e = el("span", stressed.includes(syl) ? "stress" : "", c);
        e.style.setProperty("--dx", String(k++ - (letters.length - 1) / 2));   // centred on the column
        e.style.setProperty("--row", String(i));
        e.style.setProperty("--syl", String(gi));
        name.append(e);
        i++;
      }
      syl++;
    });
    name.style.setProperty("--rows", String(i));
    name.style.setProperty("--syls", String(syllables.length));
    name.classList.add("stair");
    main.append(name);
  } else if (prosign) {
    const sign = el("span", "about-prosign", prosign);
    sign.dataset.len = prosign.length;
    main.append(sign);
  }
  box.append(main);

  /* at the foot, stacked up from the bottom: the cut number it
     stands for (or stands in for it), then what it could be
     misheard as */
  const foot = el("span", "about-foot");
  const stack = (s, label, codes) => {
    s.append(el("span", "about-label", label));
    for (const c of codes) s.append(el("b", "", DECODE[c]));
    foot.append(s);
    return s;
  };
  /* the cut: the reference tree with cut numbers, at the short code */
  const cutStack = (title, shown, short) => {
    const a = el("a", "about-cut");
    a.href = `/?/_${short}_#cut`;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = title + " (see cut numbers on the tree)";
    return stack(a, "cut", [shown]);
  };

  /* cut numbers: T for 0, N for 9 … (the long digits, shortened) */
  const own = DECODE[code];
  const cutFor = CUT[code];                                     // this code is a cut: for that digit
  const cutCode = Object.keys(CUT).find(k => CUT[k] === own && k !== code);   // this digit's cut
  if (cutFor && cutFor !== own) cutStack(`also sent as a cut ${cutFor}`, ENCODE[cutFor], code);
  else if (cutCode) cutStack(`often sent cut, as ${DECODE[cutCode]}`, cutCode, cutCode);

  /* ~: what the same marks could be heard as; tap for why */
  const alt = own ? splits(code) : [];
  if (alt.length) {
    const b = el("button", "about-heard");
    b.type = "button";
    b.title = "could be misheard as " + alt.slice(0, 6).map(p => p.map(c => DECODE[c]).join("")).join(", ") + " (why?)";
    b.setAttribute("aria-haspopup", "dialog");
    b.addEventListener("click", () => openHeard(true));
    stack(b, "~", alt[0]);
  }
  if (foot.firstChild) box.append(foot);

  /* the eye: what's hidden on the line is hidden (and inert) here too */
  const h = hiding();
  if (h === "morse") {
    redact(marks);
    const heard = box.querySelector(".about-heard");      // A ~ E T spells out ·−
    if (heard) redact(heard);
  }
  if (h === "letters") {
    for (const e of box.querySelectorAll(".about-name, .about-prosign, .about-cut, .about-heard")) redact(e);
  }
}

/*
 * Fit the column. Everything has one size (the name is --fs-s); a
 * short screen lets go of the misheard line, then the cut, then
 * lays the name flat, then drops it. The marks and (i) always stay.
 */
function fitAbout() {
  const box = $("#about");
  if (box.hidden || !box.firstChild) return;
  const name = box.querySelector(".about-name");
  const heard = box.querySelector(".about-heard");
  const cut = box.querySelector(".about-cut");
  for (const o of [name, heard, cut]) if (o) o.hidden = false;
  if (name) { name.classList.remove("flat"); name.classList.add("stair"); }

  /* a prosign runs across: as big as the column allows */
  const sign = box.querySelector(".about-prosign");
  if (sign) sign.style.fontSize = Math.min(15, (box.clientWidth - 6) / (sign.dataset.len * 0.62)) + "px";

  const over = () => box.scrollHeight > box.clientHeight + 1;
  if (over() && heard) heard.hidden = true;
  if (over() && cut) cut.hidden = true;
  if (over() && name) { name.classList.remove("stair"); name.classList.add("flat"); }
  if (over() && name) name.hidden = true;
}

/* Expanded: the letters-only vertical tree, plus branches for
   anything else this message uses (numbers, symbols). */
const tree = createTree($("#tree"), "vertical", { legend: false });   // the key sits above, at a fixed size

let treeOpen = false;

/*
 * The real tree: every node that holds a character, and every
 * node on the way to one. A long prosign (SOS is 9 marks) runs
 * past the bottom of it; we trace it only as far as the tree
 * goes, rather than growing empty levels.
 */
const REAL = new Set([""]);
TREE.forEach((row, depth) => [...row].forEach((ch, i) => {
  if (ch === "*") return;
  const code = i.toString(2).padStart(depth + 1, "0").replaceAll("0", ".").replaceAll("1", "-");
  for (let k = 1; k <= code.length; k++) REAL.add(code.slice(0, k));
}));

function inTree(code) {
  while (code && !REAL.has(code)) code = code.slice(0, -1);
  return code;
}

function drawTree() {
  if (!treeOpen) return;
  const { path } = structure(tokens);
  const codes = wordsOf(tokens).flat().map(inTree).filter(Boolean);
  sizeTreePanel();
  tree.render(buildModel({ letters: true, extra: codes }), false);
  fitTree();
  tree.handle({ type: "start" });
  if (path) {
    const shown = inTree(path);
    tree.handle({ type: "beat", path: shown });
    /* off the end of the tree: light the way there, but no letter,
       and a ⋮ after the last node: it carries on past here */
    if (shown !== path) {
      for (const s of $("#tree").querySelectorAll(".lbl.on")) s.classList.remove("on");
      carriesOn(shown, path[shown.length]);
    }
  } else {
    /* between letters (a space, a word break): the last letter keyed */
    const last = wordsOf(tokens).flat().at(-1);
    const shown = last && inTree(last);
    if (shown) {
      tree.handle({ type: "beat", path: shown });            // the way there, and the letter
      if (shown !== last) {
        for (const s of $("#tree").querySelectorAll(".lbl.on")) s.classList.remove("on");
        carriesOn(shown, last[shown.length]);
      }
    }
  }
  /* the eye leaves the whole tree alone: a hint to work from, and
     a way to learn the tree */
  followNode();
}

/*
 * ⋮ beside the deepest node shown, when the marks run on past the
 * tree's edge (a long prosign): upright, so it fits in the padding
 * and nothing re-scales; coloured as the path's next step would be.
 */
function carriesOn(code, next) {
  const pre = $("#tree");
  const node = pre.querySelector(`.lbl[data-code="${CSS.escape(code)}"]`);
  if (!node) return;
  const p = pre.getBoundingClientRect(), n = node.getBoundingClientRect();
  const more = el("span", `more on ${next === "." ? "dot" : "dash"}`, "⋮");
  more.setAttribute("aria-hidden", "true");
  more.style.left = (n.right - p.left) + "px";
  more.style.top = (n.top - p.top + n.height / 2) + "px";
  pre.append(more);
}

/*
 * No scrolling: the whole tree is scaled to its half of the
 * field. Measured at a base size, then sized so both its width
 * and height fit (text stays crisp; it's real text, not zoom).
 */
const TREE_BASE = 13;
const TREE_MAX = 18;
const TREE_MIN = 6;    // tiny, but the lit path still reads; only crowded trees scroll (and follow)

/* scale the drawn tree to fit its box */
/* the room inside the scroll area, not counting its padding */
function room(box) {
  const cs = getComputedStyle(box);
  return {
    w: box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  };
}

function fitTree() {
  const box = $("#tree-scroll"), pre = $("#tree");
  pre.style.fontSize = TREE_BASE + "px";
  const w = pre.scrollWidth, h = pre.scrollHeight;
  if (!w || !h) return;
  const { w: rw, h: rh } = room(box);
  /* 0.98: glyph widths don't scale perfectly linearly; stay inside */
  const scale = Math.min(rw / w, rh / h) * 0.98;
  const size = Math.max(TREE_MIN, Math.min(TREE_MAX, Math.floor(TREE_BASE * scale * 10) / 10));
  pre.style.fontSize = size + "px";
  box.classList.toggle("scrolls", pre.scrollHeight > rh + 1 || pre.scrollWidth > rw + 1);
}

/*
 * When the tree is too big to shrink any further (lots of
 * numbers and symbols), the panel scrolls, and follows the
 * node you're on the way the tape follows the caret.
 */
function followNode() {
  const box = $("#tree-scroll"), pre = $("#tree");
  if (!box.classList.contains("scrolls")) {
    box.scrollTop = box.scrollLeft = 0;
    return;
  }
  /* the current letter, the one just landed, or the deepest lit step */
  let target = pre.querySelector(".lbl.on, .lbl.landed");
  if (!target) {
    for (const s of pre.querySelectorAll(".on")) {
      if (!target || (s.dataset.code ?? "").length >= (target.dataset.code ?? "").length) target = s;
    }
  }
  if (!target) return;

  const b = box.getBoundingClientRect(), t = target.getBoundingClientRect();
  const mx = Math.min(40, b.width / 4), my = b.height / 4;   // keep some tree around it
  if (t.left < b.left + mx) box.scrollLeft -= b.left + mx - t.left;
  else if (t.right > b.right - mx) box.scrollLeft += t.right - (b.right - mx);
  if (t.top < b.top + my) box.scrollTop -= b.top + my - t.top;
  else if (t.bottom > b.bottom - my) box.scrollTop += t.bottom - (b.bottom - my);
}

/*
 * The panel's width is set from the DEFAULT tree (letters only)
 * and only changes when the screen does (tray, rotation), never
 * while keying: extra branches (numbers, symbols) make the tree
 * smaller instead of the panel wider.
 */
let panelFor = "";

function sizeTreePanel() {
  const station = $(".station"), edge = $(".tree-edge");
  const key = station.clientWidth + "x" + station.clientHeight;
  if (key === panelFor) return;
  panelFor = key;
  edge.style.width = "";                       // half, then measure the default tree in it
  tree.render(buildModel({ letters: true }), false);
  fitTree();
  /* give the spare width back to the message; the padding on
     both sides of the tree stays equal */
  const spare = room($("#tree-scroll")).w - $("#tree").scrollWidth;
  if (spare > 2) edge.style.width = Math.ceil(edge.getBoundingClientRect().width - spare + 2) + "px";
}

function openTree(open) {
  treeOpen = open;
  document.body.classList.toggle("tree-open", open);
  $("#tree-box").hidden = !open;
  $("#local").hidden = open;
  $("#about").hidden = open;
  const toggle = $("#tree-toggle");
  toggle.innerHTML = icon(open ? "out" : "in");
  toggle.title = open ? "back to where you are" : "show the whole tree";
  toggle.setAttribute("aria-expanded", String(open));
  if (!open) $(".tree-edge").style.width = "";
  panelFor = "";
  try { localStorage.setItem("dot-dash:tx-tree", open ? "1" : "0"); } catch { }
  update();   /* the field changed size: re-fit the tree, re-settle the tape */
}

$("#tree-toggle").addEventListener("click", () => openTree(!treeOpen));
/* a tap on the collapsed tree (not its two children) opens it too */
$("#local").addEventListener("click", event => {
  if (!event.target.closest("button")) openTree(true);
});

/*
 * Whenever the station changes size (settings tray opening or
 * closing, the tree toggling, rotating the phone, an on-screen
 * keyboard), re-fit the tree and re-settle the tape. Watching
 * the box itself catches every cause, not just window resizes.
 */
let refitQueued = false;
new ResizeObserver(() => {
  if (refitQueued) return;
  refitQueued = true;
  requestAnimationFrame(() => {
    refitQueued = false;
    if (treeOpen) drawTree();   // re-measures the panel only if the station's size changed
    else drawAbout(aboutCode);   // the column's size may have changed
    settleTape();
  });
}).observe($(".station"));

/* tap a letter in the tree to key all of it */
$("#tree").addEventListener("click", event => {
  const t = event.target;
  const code = t.dataset?.code;
  if (t.dataset?.kind !== "lbl" || !code || t.classList.contains("blank")) return;
  if (structure(tokens).path) tokens.push(" ");
  tokens.push(...code, " ");
  localCleared = false;
  update();
});


/*
 * ============================================================
 * UPDATE
 * ============================================================
 */

function update() {
  const { word, path } = structure(tokens);
  /* the message changed under the player: stop it */
  if (playKey !== null && playKey !== messageKey()) stopPlayback();
  drawTape();
  drawStats();
  drawLocal();
  drawTree();
  $("#send").disabled = !wordsOf(tokens).length;
  shown = null;   /* the tape was redrawn: re-apply any playback highlight */
  playerControls();
}


/*
 * ============================================================
 * THE PAD
 * ============================================================
 *
 * Acts on pointer DOWN (not click), so it feels like a key.
 * The switch logo closes while dit or dah is held.
 */

const logo = $(".logo");

function timingNow() {
  return timing(Number($("#opt-wpm").value), Number($("#opt-fwpm").value));
}

/* the timed keyer (straight, bug, paddles); tap mode bypasses it */
const keyer = createKeyer({
  timing: timingNow,
  mark: (m, timing) => press(m, timing),
  gap: kind => press(kind),
  signal: down => {
    setSignal(down);
    sound.key(down);
    if (!player.playing) trace.live(down);   // the held mark grows on the scrub bar
  },
  train: e => trainView.show(e)
});

let keyMode = "tap";

const sound = createSound();

/*
 * Tap mode: each tap is sounded as a proper mark (1 or 3 units
 * at the current speed), so even tapping teaches the rhythm.
 * Taps faster than that queue up, a unit apart, like a keyer;
 * if they pile up more than a couple of seconds, the extras
 * are shown but not sounded.
 */
let tapBusyUntil = -Infinity;
const tapTimers = new Set();

/* the lamp follows a tapped or typed mark when it sounds */
function signalLater(down, ms) {
  const id = setTimeout(() => { tapTimers.delete(id); setSignal(down); }, ms);
  tapTimers.add(id);
}

/* playback takes over: drop whatever taps are still queued */
function cancelTaps() {
  for (const id of tapTimers) clearTimeout(id);
  tapTimers.clear();
  tapBusyUntil = -Infinity;
}

function tapMark(m) {
  const t = timingNow();
  const now = performance.now();
  const start = Math.max(now, tapBusyUntil + t.unit);
  const length = (m === "." ? 1 : 3) * t.unit;
  if (start - now > 2000) return;
  tapBusyUntil = start + length;
  sound.mark((start - now) / 1000, length / 1000);
  signalLater(true, start - now);
  signalLater(false, start - now + length);
}

const LABELS = {
  tap:         ["dit", "dah"],
  straight:    ["key", ""],
  bug:         ["dit · auto", "dah"],
  "iambic-a":  ["dit paddle", "dah paddle"],
  "iambic-b":  ["dit paddle", "dah paddle"],
  ultimatic:   ["dit paddle", "dah paddle"]
};

function setKeyMode(next) {
  keyMode = MODES.includes(next) ? next : "tap";
  keyer.setMode(keyMode);
  document.body.dataset.key = keyMode;
  syncKeySelect();
  const [dit, dah] = LABELS[keyMode];
  $("#pad .key.dit span").textContent = dit;
  $("#pad .key.dah span").textContent = dah;
  $("#pad .key.dit b").textContent = keyMode === "straight" ? "" : ".";
  showInput();
}

/*
 * The key list also offers "off" (put the keys away) and "text"
 * (the keyboard), the same switches as the chevron and .- / A in
 * the control row, for anyone who looks for them here. The list
 * always shows what's in front of you; the keyer is remembered.
 */
function syncKeySelect() {
  const s = $("#opt-key");
  s.dataset.last = keyMode;
  s.value = inputAway ? "off" : mode === "type" ? "text" : keyMode;
}

$("#opt-key").addEventListener("change", () => {
  const v = $("#opt-key").value;
  if (v === "off") return putKeysAway(true);
  if (v === "text") {
    if (mode !== "type") setMode("type");
    if (inputAway) putKeysAway(false);
    return syncKeySelect();
  }
  setKeyMode(v);
  if (mode !== "key") setMode("key");
  if (inputAway) putKeysAway(false);
  syncKeySelect();
});


/* press / release from a finger, mouse or hardware key */
function keyDown(button) {
  if (!button || button.classList.contains("pressed")) return;
  if (player.playing) stopPlayback();
  button.classList.add("pressed");
  sound.unlock();                 // audio may only start inside a press
  const act = button.dataset.act;
  const mark = act === "." || act === "-";

  if (mark && keyMode !== "tap") {
    keyer.down(act);
    return;
  }
  if (mark) tapMark(act);
  else keyer.cancel();            // undo / spaces cancel a pending gap (timing kept)
  localCleared = act === "letter" || act === "word";   // a space you pressed: start fresh
  press(act);
}

function keyUp(button) {
  if (!button || !button.classList.contains("pressed")) return;
  button.classList.remove("pressed");
  const act = button.dataset.act;
  if ((act === "." || act === "-") && keyMode !== "tap") keyer.up(act);
}

for (const button of document.querySelectorAll("#pad .key")) {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    keyDown(button);
  });
  button.addEventListener("pointerup", () => keyUp(button));
  button.addEventListener("pointercancel", () => keyUp(button));
  button.addEventListener("lostpointercapture", () => keyUp(button));
  button.addEventListener("contextmenu", event => event.preventDefault());
}

/*
 * A computer keyboard keys too (keying mode only; typing mode
 * types). Paddle pairs, left = dit, right = dah, on whichever keys
 * suit your hands or your adapter:
 *
 *   dit   .   [   A   1        (left Ctrl, with "ctrl keys" on)
 *   dah   -   ]   D   3        (right Ctrl, likewise)
 *
 * The Ctrl keys are for the VBand USB paddle adapter, which sends
 * them; they're off unless asked for, so Ctrl stays free for
 * shortcuts (Ctrl+C would otherwise key a dit first).
 *
 *   space      letter space (straight key: the key itself)
 *   /          word space
 *   backspace  undo        enter   send        P   play / pause
 *
 * With the straight key, any of them is the one key.
 */
/* (the arrow keys belong to the player: see PLAYER KEYS) */
const DIT_KEYS = new Set(["Period", "NumpadDecimal", "BracketLeft", "KeyA", "Digit1", "Numpad1"]);
const DAH_KEYS = new Set(["Minus", "NumpadSubtract", "BracketRight", "KeyD", "Digit3", "Numpad3"]);
const ctrlKeys = () => $("#opt-ctrl").checked;
const padKey = act => document.querySelector(`#pad .key[data-act="${CSS.escape(act)}"]`);

function actFor(event) {
  const code = event.code;
  const ctrl = ctrlKeys();
  if (DIT_KEYS.has(code) || event.key === "." || (ctrl && code === "ControlLeft")) return ".";
  if (DAH_KEYS.has(code) || event.key === "-" || (ctrl && code === "ControlRight")) return keyMode === "straight" ? "." : "-";
  if (code === "Space") return keyMode === "straight" ? "." : "letter";
  if (code === "Slash" || code === "NumpadDivide" || event.key === "/") return "word";
  if (code === "Backspace") return "undo";
  return null;
}

/* a modifier held for something else (Ctrl+R, ⌘C …) isn't keying,
   unless it's a Ctrl key being used as a paddle */
const isChord = event =>
  event.metaKey || event.altKey || (event.ctrlKey && !/^Control/.test(event.code) && !ctrlPaddle.down);
const ctrlPaddle = { down: false };

document.addEventListener("keydown", event => {
  if (mode === "type" || event.target.closest?.("input, select, textarea")) return;
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); send(); return; }
  const act = actFor(event);
  if (!act || isChord(event)) return;
  if (/^Control/.test(event.code)) ctrlPaddle.down = true;
  event.preventDefault();
  if (event.repeat) return;
  keyDown(padKey(act));
});

document.addEventListener("keyup", event => {
  if (/^Control/.test(event.code)) ctrlPaddle.down = false;
  const act = actFor(event);
  if (act) keyUp(padKey(act));
});

/* let go of everything if the page loses focus mid-press */
function releaseAll() {
  for (const b of document.querySelectorAll("#pad .key.pressed")) keyUp(b);
  keyer.reset();
  sound.silence();
  outputs?.quiet();
}
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });


/*
 * ============================================================
 * TIMING TRAIN
 * ============================================================
 *
 * The bar lines up with the keys under it. Time runs out from
 * the left edge of the dit key: key DOWN runs right, key UP
 * runs left.
 *
 *    ← key up                 key down →
 *   ├/───────┃──˽──┃───┼──────────.┃────────┃────────-┤
 *   │  ↶ ˽ / │                   │  dit     │    dah   │
 *    7      5   3  2  0           1     2           3   units
 *
 * Key down: a full dit ends at the dit key's right edge, a full
 * dah at the dah key's. The keys aren't 1:3 wide, so the dah
 * stretch runs slower (1 unit across the dit key, 2 across the
 * rest). Key up runs evenly: the word gap (7) at the far left,
 * the letter gap (3) at 3/7 of the way. Brass lines mark where
 * one call turns into the next (dit → dah, ˽ → /).
 */

const trainView = (() => {
  const onSeg = $("#train .seg.on"), offSeg = $("#train .seg.off");
  const onFill = onSeg.querySelector(".fill"), offFill = offSeg.querySelector(".fill");
  let ticks = {};
  let event = null;
  let frame = 0;

  /* how much of the key-down half the dit key takes (1 unit of 3);
     measured from the pad, or a true 1:3 for the one-key straight key */
  let ditShare = 1 / 3;
  function measure() {
    const dit = $("#pad .key.dit").getBoundingClientRect();
    const dah = $("#pad .key.dah").getBoundingClientRect();
    if (!dit.width) return;                       // pad not shown
    const zero = dit.left - 3;                    // time zero: the middle of the 6px gap
    ditShare = dah.width ? (dit.right - zero) / (dah.right - zero) : 1 / 3;
    const train = $("#train").getBoundingClientRect();
    if (train.width) $("#train .origin").style.left = (zero - train.left) + "px";
  }

  /* where a time falls, as % of its half */
  const holdPct = (ms, t) => {
    const u = Math.max(0, ms / t.unit);
    const at = u <= 1 ? u * ditShare : ditShare + (Math.min(u, 3) - 1) / 2 * (1 - ditShare);
    return at * 100;
  };
  const gapPct = (ms, t) => Math.min(1, Math.max(0, ms / t.word)) * 100;

  /* playback only: where the ideal length would have ended */
  const onIdeal = el("span", "ideal");
  const offIdeal = el("span", "ideal");
  onSeg.append(onIdeal);
  offSeg.append(offIdeal);
  onIdeal.hidden = offIdeal.hidden = true;

  /* each label sits inside the stretch it ends: left of its line
     on the key-down side, right of it on the key-up side */
  function build() {
    measure();
    const t = timingNow();
    ticks = {};
    for (const seg of [onSeg, offSeg]) seg.querySelector(".ticks").textContent = "";
    const hold = (ms, key, label, cls) => {
      const tick = el("span", "tick " + cls, label);
      tick.style.right = (100 - holdPct(ms, t)) + "%";
      onSeg.querySelector(".ticks").append(tick);
      if (key) ticks[key] = tick;
    };
    const wait = (ms, key, label, cls = "") => {
      const tick = el("span", "tick " + cls, label);
      tick.style.left = (100 - gapPct(ms, t)) + "%";
      offSeg.querySelector(".ticks").append(tick);
      if (key) ticks[key] = tick;
    };
    hold(t.unit, ".", ".", "dot");
    hold(t.dahAt, null, "", "split");
    hold(3 * t.unit, "-", "-", "dash");
    wait(t.letterAt, null, "", "split");
    wait(t.letter, "letter", "˽");
    wait(t.wordAt, null, "", "split");
    wait(t.word, "word", "/");
  }

  function light(key) {
    for (const [k, tick] of Object.entries(ticks)) tick.classList.toggle("lit", k === key);
  }

  const gapCall = (ms, t) => (ms >= t.wordAt ? "word" : ms >= t.letterAt ? "letter" : null);

  function draw() {
    if (!event) return;
    const t = timingNow();
    let elapsed = performance.now() - event.t0;

    if (event.phase === "gap") {
      offFill.style.width = gapPct(elapsed, t) + "%";
      light(gapCall(elapsed, t));
      if (elapsed >= t.word) return;                 // a full word space: rest
    } else {
      let mark;
      if (event.phase === "send") {
        elapsed = Math.min(elapsed, event.length);
        mark = event.mark;
      } else {
        mark = elapsed >= t.dahAt ? "-" : ".";
      }
      onFill.className = "fill " + (mark === "." ? "dot" : "dash");
      onFill.style.width = holdPct(elapsed, t) + "%";
      light(mark);
    }
    frame = requestAnimationFrame(draw);
  }

  function show(e) {
    cancelAnimationFrame(frame);
    onIdeal.hidden = offIdeal.hidden = true;
    event = e.phase ? e : null;
    if (!event) {
      onFill.style.width = offFill.style.width = "0";
      onFill.classList.remove("past");
      light(null);
      return;
    }
    onFill.classList.toggle("past", event.phase === "gap");   // keep the mark just made, dimmed
    offFill.style.width = "0";
    draw();
  }

  /*
   * Playback: the bar replays the timing as it was keyed, with a
   * notch where the ideal length ends, so you can see a dah held
   * short or a letter space rushed.
   */
  function replay(ph) {
    cancelAnimationFrame(frame);
    event = null;
    if (!ph) {
      onFill.style.width = offFill.style.width = "0";
      onFill.classList.remove("past");
      onIdeal.hidden = offIdeal.hidden = true;
      light(null);
      return;
    }
    const t = timingNow();
    if (ph.kind === "hold") {
      onFill.className = "fill " + (ph.symbol === "." ? "dot" : "dash");
      onFill.style.width = holdPct(ph.elapsed, t) + "%";
      offFill.style.width = "0";
      onIdeal.hidden = false;
      onIdeal.style.left = holdPct(ph.ideal, t) + "%";
      offIdeal.hidden = true;
      light(ph.symbol);
    } else {
      onFill.classList.add("past");
      offFill.style.width = gapPct(ph.elapsed, t) + "%";
      offIdeal.hidden = false;
      offIdeal.style.left = (100 - gapPct(ph.ideal, t)) + "%";
      onIdeal.hidden = true;
      light(gapCall(ph.elapsed, t));
    }
  }

  build();
  $("#opt-wpm").addEventListener("input", build);
  $("#opt-fwpm").addEventListener("input", build);
  /* the keys changed size, appeared, or merged (the straight key) */
  const refit = new ResizeObserver(build);
  refit.observe($("#pad .key.dit"));
  refit.observe($("#pad .key.dah"));

  return { show, replay, build };
})();

$("#send").addEventListener("click", send);

/* lit while held, like the keys (at least a blink, for a quick tap) */
{
  const b = $("#send");
  let since = 0;
  b.addEventListener("pointerdown", () => {
    if (b.disabled) return;
    since = performance.now();
    b.classList.add("pressed");
  });
  const release = () => {
    const left = Math.max(0, 120 - (performance.now() - since));
    setTimeout(() => b.classList.remove("pressed"), left);
  };
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(type, release);
}


/*
 * ============================================================
 * INPUT MODE: key Morse [.-]  or  type text [A]
 * ============================================================
 */

let mode = "key";

/*
 * Read mode: the caret beside the input modes puts the pad /
 * keyboard away, so the message gets the room (to read a long
 * history, or show someone); tap it again, or either mode, to
 * bring it back. A computer keyboard still keys meanwhile.
 */
let inputAway = false;

function markModeButtons() {
  syncKeySelect();
  for (const b of document.querySelectorAll(".input-mode button")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  }
  const t = $("#keys-toggle");
  t.setAttribute("aria-expanded", String(!inputAway));
  t.title = inputAway ? "show the keys" : "hide the keys (read mode)";
  t.setAttribute("aria-label", t.title);
}

function putKeysAway(away) {
  inputAway = away;
  if (inputAway) openTray(false);
  markModeButtons();
  showInput();
  update();     // the message area changed size
}

function setMode(next, focus = true) {
  mode = next;
  inputAway = false;
  document.body.dataset.mode = mode;
  markModeButtons();
  showInput();
  if (mode === "type") setTyped(plainText(wordsOf(tokens)) ?? "");
  try { localStorage.setItem("dot-dash:tx-mode", mode); } catch { }
  update();
}

for (const b of document.querySelectorAll(".input-mode button")) {
  b.addEventListener("click", () => {
    if (b.dataset.mode !== mode) setMode(b.dataset.mode);
    else if (inputAway) putKeysAway(false);
  });
}
$("#keys-toggle").addEventListener("click", () => putKeysAway(!inputAway));

/*
 * ============================================================
 * TYPE MODE: our own keyboard
 * ============================================================
 *
 * The phone's keyboard would pop up and push the page around,
 * so type mode has its own: all caps (Morse has no case), only
 * characters Morse can send, and each key shows its code and
 * sounds it when tapped. A computer keyboard types here too.
 */

let typed = "";

/* what's been typed (it shows in the message itself) */
function setTyped(text) {
  typed = text;
}

function retype(text) {
  setTyped(text);
  lastInput = performance.now();
  tokens = tokensOf(encode(typed));
  took = tokens.map(() => null);   // typed: no keying to replay
  update();
}

function typeKey(k) {
  if (player.playing) stopPlayback();
  localCleared = k === " ";
  if (k === "back") return retype(typed.slice(0, -1));
  if (k === "send") return send();
  if (k === " ") {
    if (!typed || typed.endsWith(" ")) return;   // no leading or double spaces
    return retype(typed + " ");
  }
  const code = ENCODE[k];
  if (!code) return;
  sound.unlock();
  soundLetter(code);
  retype(typed + k);
}

/* the letter's code, sounded and keyed on the logo, a letter
   space after anything still sounding */
function soundLetter(code) {
  const t = timingNow();
  const now = performance.now();
  let start = Math.max(now, tapBusyUntil + t.letter);
  if (start - now > 2000) return;   // typing far ahead of the sound: just show it
  for (const m of code) {
    const length = (m === "." ? 1 : 3) * t.unit;
    sound.mark((start - now) / 1000, length / 1000);
    signalLater(true, start - now);
    signalLater(false, start - now + length);
    tapBusyUntil = start + length;
    start += length + t.unit;
  }
}

/*
 * Two layouts: letters, and 123 (digits and symbols).
 *
 * Long-press a letter for the digits and symbols that grow out
 * of it in the tree (its descendants, up to the next letter):
 *
 *   O → 8 9 0 :     (---.. ----. ----- ---...  all start ---)
 *
 * A small tick in the key's corner shows it has some.
 */
/*
 * A fixed grid, the same for both layouts, so switching never
 * moves or resizes a key: 20 half-key columns per row, every
 * key 2 wide (one key), ⌫ always 1½ keys at the right, and an
 * identical bottom row (space is 5½ keys).
 *
 *   letters                         123
 *   Q W E R T Y U I O P             1 2 3 4 5 6 7 8 9 0
 *    A S D F G H J K L              . , ? ! ' " ( ) / &
 *      Z X C V B N M  ⌫             : ; = + - _ $ @    ⌫
 *   123 [   space   ] send          ABC [   space   ] send
 *
 * Each row: [startColumn, keys] (keys 2 columns each), plus
 * any special keys as [key, startColumn, span].
 */
const BOTTOM = [["layout", 1, 3], [" ", 4, 11], ["send", 15, 6]];
const LAYOUTS = {
  abc: [
    { start: 1, keys: [..."QWERTYUIOP"] },
    { start: 2, keys: [..."ASDFGHJKL"] },
    { start: 4, keys: [..."ZXCVBNM"], extra: [["back", 18, 3]] },
    { start: 1, keys: [], extra: BOTTOM }
  ],
  num: [
    { start: 1, keys: [..."1234567890"] },
    { start: 1, keys: [...".,?!'\"()/&"] },
    { start: 1, keys: [...":;=+-_$@"], extra: [["back", 18, 3]] },
    { start: 1, keys: [], extra: BOTTOM }
  ]
};
let layout = "abc";

const isLetter = ch => /^[A-Z]$/.test(ch);

/* each letter's descendants that aren't letters (digits, symbols), in tree order */
const EXTRAS = {};
for (const [code, ch] of Object.entries(DECODE)) {
  if (isLetter(ch) || ch.startsWith("<")) continue;
  let parent = code.slice(0, -1);
  while (parent && !isLetter(DECODE[parent])) parent = parent.slice(0, -1);
  if (parent) (EXTRAS[DECODE[parent]] ??= []).push(ch);
}
const treeOrder = ch => {
  const code = ENCODE[ch];
  return code.length * 1000 + parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2);
};
for (const list of Object.values(EXTRAS)) list.sort((a, b) => treeOrder(a) - treeOrder(b));

function codeMarks(ch) {
  const small = el("small");
  small.style.setProperty("--len", ENCODE[ch].length);   // lets the CSS size it to the key
  for (const m of ENCODE[ch]) small.append(el("span", m === "." ? "dot" : "dash", m));
  return small;
}

function buildKeyboard() {
  const kbd = $("#kbd");
  kbd.textContent = "";
  kbd.dataset.layout = layout;
  for (const row of LAYOUTS[layout]) {
    const rowEl = el("div", "row");
    const keys = [
      ...row.keys.map((k, i) => [k, row.start + 2 * i, 2]),
      ...(row.extra ?? [])
    ];
    for (const [k, column, span] of keys) {
      const b = el("button");
      b.type = "button";
      b.dataset.k = k;
      b.style.gridColumn = `${column} / span ${span}`;
      if (k === "back") {
        b.className = "k-wide";
        b.append(el("b", "", "⌫"));
        b.setAttribute("aria-label", "backspace");
      } else if (k === " ") {
        b.className = "k-space";             // a plain bar, like a real space bar
        b.setAttribute("aria-label", "space");
      } else if (k === "send") {
        b.className = "k-send";
        b.append(el("b", "", "send"));
      } else if (k === "layout") {
        b.className = "k-layout";
        b.append(el("b", "", layout === "abc" ? "123" : "ABC"));
        b.setAttribute("aria-label", layout === "abc" ? "numbers and symbols" : "letters");
      } else {
        /* Morse first: the code above the character */
        b.append(codeMarks(k), el("b", "", k));
        if (layout === "abc" && EXTRAS[k]) {
          b.classList.add("more");
          b.setAttribute("aria-label", `${k} (hold for ${EXTRAS[k].join(" ")})`);
        }
      }
      rowEl.append(b);
    }
    /* the empty start of the Z row: an (i) for the keys that hold more */
    if (layout === "abc" && row.start === 4) {
      const info = el("button", "info kbd-info", "i");
      info.type = "button";
      info.style.gridColumn = "1 / span 3";
      info.style.gridRow = "1";            // placed last, but in the row's first line
      info.title = "keys that hold more";
      info.setAttribute("aria-label", info.title);
      info.setAttribute("aria-haspopup", "dialog");
      info.addEventListener("click", () => openHold(true));
      rowEl.append(info);
    }
    kbd.append(rowEl);
  }
}

function openHold(open) {
  $("#hold-pop").hidden = !open;
  if (open) $("#hold-pop .close").focus({ preventScroll: true });
}
$("#hold-pop .close").addEventListener("click", () => openHold(false));

buildKeyboard();


/*
 * Presses. Keys type when you let go (so a long press can open
 * the fan instead); backspace acts at once.
 *
 *        ┌──────────────────┐
 *        │ ---.  ----. ---… │   the fan: slide onto one, let go
 *        │  8     9    0  : │
 *        └────────┬─────────┘
 *               [ O ]
 */
const HOLD = 380;   // ms before the fan opens
let held = null;    // { b, k, timer, fan, items, choice }

function openFan() {
  const extras = EXTRAS[held.k];
  const fan = el("div", "fan");
  const items = [held.k, ...extras].map(ch => {
    const item = el("span", "item");
    item.dataset.ch = ch;
    item.append(codeMarks(ch), el("b", "", ch));
    fan.append(item);
    return item;
  });
  document.body.append(fan);
  const key = held.b.getBoundingClientRect();
  const w = fan.offsetWidth;
  fan.style.left = Math.max(6, Math.min(innerWidth - w - 6, key.left + key.width / 2 - w / 2)) + "px";
  fan.style.top = (key.top - fan.offsetHeight - 6) + "px";
  held.fan = fan;
  held.items = items;
  choose(items[1]);   // the first digit / symbol, ready to go
}

function choose(item) {
  for (const i of held.items) i.classList.toggle("on", i === item);
  held.choice = item?.dataset.ch ?? null;
}

function closeFan() {
  held?.fan?.remove();
}

/*
 * A little forgiveness for fingers: a touch that lands in a gap or
 * on an edge goes to the nearest key, and touches are read a few
 * pixels higher (fingers land a little below where they aim). No
 * guessing at words: Morse is full of callsigns and Q codes.
 */
const AIM_LIFT = 3;   // px

function keyAt(event) {
  const direct = event.target.closest("button[data-k]");
  if (event.pointerType !== "touch") return direct;
  if (event.target.closest(".kbd-info")) return null;
  const x = event.clientX, y = event.clientY - AIM_LIFT;
  let best = null, bestD = Infinity;
  for (const b of $("#kbd").querySelectorAll("button[data-k]")) {
    const r = b.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

$("#kbd").addEventListener("pointerdown", event => {
  const b = keyAt(event);
  if (!b) return;
  event.preventDefault();
  b.setPointerCapture?.(event.pointerId);
  b.classList.add("pressed");
  closeFan();
  held = { b, k: b.dataset.k, timer: null, fan: null, items: [], choice: null };
  if (held.k === "back") return typeKey("back");
  if (layout === "abc" && EXTRAS[held.k]) held.timer = setTimeout(openFan, HOLD);
});

$("#kbd").addEventListener("pointermove", event => {
  if (!held?.fan) return;
  /* the item under the finger (by its column, so a slight drift up or down is fine) */
  const x = event.clientX;
  const item = held.items.find(i => { const r = i.getBoundingClientRect(); return x >= r.left && x < r.right; });
  if (item) choose(item);
});

function release(event, commit) {
  if (!held) return;
  clearTimeout(held.timer);
  held.b.classList.remove("pressed");
  const { k, fan, choice } = held;
  closeFan();
  held = null;
  if (!commit || k === "back") return;
  if (fan) return choice && typeKey(choice);
  if (k === "layout") {
    layout = layout === "abc" ? "num" : "abc";
    return buildKeyboard();
  }
  typeKey(k);
}

$("#kbd").addEventListener("pointerup", event => release(event, true));
$("#kbd").addEventListener("pointercancel", event => release(event, false));
$("#kbd").addEventListener("contextmenu", event => event.preventDefault());

/* a computer keyboard: letters, digits, the symbols Morse has */
document.addEventListener("keydown", event => {
  if (mode !== "type" || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.("input, select, textarea")) return;
  let k = null;
  if (event.key === "Backspace") k = "back";
  else if (event.key === "Enter") k = "send";
  else if (event.key.length === 1) k = event.key.toUpperCase();
  if (!k || (k.length === 1 && k !== " " && !ENCODE[k])) return;
  event.preventDefault();
  const b = $(`#kbd button[data-k="${CSS.escape(k)}"]`);
  b?.classList.add("pressed");
  setTimeout(() => b?.classList.remove("pressed"), 120);
  typeKey(k);
});


/*
 * ============================================================
 * SETTINGS TRAY (laid out; wired in later steps)
 * ============================================================
 */

/* the tray takes the pad's place while it's open */
function showInput() {
  const off = !$("#tray").hidden || inputAway;   // the tray in their place, or put away
  $("#pad").hidden = off || mode !== "key";
  $("#type").hidden = off || mode !== "type";
  $("#train").hidden = off || mode !== "key" || keyMode === "tap";
  document.body.classList.toggle("reading", inputAway && $("#tray").hidden);
}

function openTray(open) {
  $("#tray").hidden = !open;
  $("#tray-toggle").setAttribute("aria-expanded", String(open));
  showInput();
  if (open) placeSwitches();
}

/*
 * The lists over their sliders: key centred over speed, sound over
 * vol, wave over pitch, light from the light column. Where two would
 * touch, both give way a little (keeping a gap), the rest stay put.
 * Narrow phones (two to a row, tx.css) skip this.
 */
const SWITCH_GAP = 8;
const narrowTray = matchMedia("(max-width: 384px)");

function placeSwitches() {
  const row = $(".switches");
  const all = ["#opt-key", "#opt-ctrl", "#opt-sound", "#opt-wave", "#opt-light"].map(id => $(id).closest("label"))
    .filter(l => l.closest(".switches"));        // ctrl may be in the checkbox column
  if (narrowTray.matches) {
    row.classList.remove("placed");
    row.style.height = "";
    for (const l of all) l.style.left = "";
    return;
  }
  if ($("#tray").hidden) return;
  row.classList.add("placed");
  const base = row.getBoundingClientRect().left;
  const mid = id => { const b = $(id).getBoundingClientRect(); return b.left + b.width / 2 - base; };
  /* key from the left edge, ctrl (when shown) right beside it */
  const labels = all.filter(l => getComputedStyle(l).display !== "none");
  const w = labels.map(l => l.offsetWidth);
  const ideal = {
    "opt-key": () => 0,
    "opt-ctrl": () => 0,                       // pushed along by key below
    "opt-sound": l => mid("#opt-vol") - l.offsetWidth / 2,
    "opt-wave": l => mid("#opt-hz") - l.offsetWidth / 2,
    "opt-light": () => $("#opt-glow").closest(".group").getBoundingClientRect().left - base
  };
  const x = labels.map(l => ideal[l.querySelector("select, input").id](l));
  /* the far edge: the tray's (light may run over the empty top of
     the color / invert column) */
  const end = $("#tray").getBoundingClientRect().right - base;
  /* settle: two too close share the nudge, half each, so every
     list stays as near its slider as it can; and all stay in the row */
  for (let round = 0; round < 24; round++) {
    let moved = false;
    for (let i = 0; i < x.length - 1; i++) {
      const over = x[i] + w[i] + SWITCH_GAP - x[i + 1];
      if (over > 0.5) {
        /* key holds the left edge: the next one gives way alone */
        if (i === 0) x[1] += over;
        else { x[i] -= over / 2; x[i + 1] += over / 2; }
        moved = true;
      }
    }
    x[0] = Math.max(0, x[0]);
    const z = x.length - 1;
    x[z] = Math.min(x[z], end - w[z]);
    if (!moved) break;
  }
  labels.forEach((l, i) => { l.style.left = Math.round(Math.max(0, x[i])) + "px"; });
  row.style.height = Math.max(...labels.map(l => l.offsetHeight)) + "px";
}

/*
 * ctrl (keys as paddles) sits beside key where there's a mouse and
 * room; on touch screens (a keyer by USB is possible, but rare) and
 * narrow ones, at the end of the checkbox column.
 */
const touchOnly = matchMedia("(hover: none) and (pointer: coarse)");
function placeCtrl() {
  const flag = $("#opt-ctrl").closest("label");
  const inColumn = touchOnly.matches || narrowTray.matches;
  if (inColumn && flag.parentElement !== $(".flags")) $(".flags").append(flag);
  if (!inColumn && flag.parentElement !== $(".switches .lead")) $(".switches .lead > label").after(flag);
  flag.style.left = "";
}
placeCtrl();
touchOnly.addEventListener("change", () => { placeCtrl(); placeSwitches(); });

new ResizeObserver(() => placeSwitches()).observe($("#tray"));
narrowTray.addEventListener("change", () => { placeCtrl(); placeSwitches(); });
document.fonts?.ready.then(placeSwitches);

$("#tray-toggle").addEventListener("click", () => openTray($("#tray").hidden));

/* a tap anywhere above the player closes the settings; the player
   (play, scrub, repeat) and the sound / light / vibration toggles
   stay usable, so changes can be tried out with the settings still open */
let trayClosedAt = -Infinity;
document.addEventListener("pointerdown", event => {
  if ($("#tray").hidden) return;
  if (event.target.closest("#tray, #tray-toggle, .player, .outputs")) return;
  openTray(false);
  trayClosedAt = performance.now();
});

/*
 * A tap in the message box puts the keys away, like tapping out of
 * a text field; another brings them back (the chevron follows).
 * Taps on things in the box that do something (a sent message to
 * key again, ×, the eye, send, clear history) do just that.
 */
$(".field").addEventListener("click", event => {
  if (event.target.closest("button, a, input, select, .entry.past .line, .tape-head, .paste-bubble")) return;
  if (performance.now() - trayClosedAt < 600) return;     // that tap closed the settings
  putKeysAway(!inputAway);
});

const outputFor = input => document.querySelector(`output[for="${input.id}"]`);

/* settings are remembered on this device */
const SETTINGS_KEY = "dot-dash:tx-settings";
const settingInputs = () => document.querySelectorAll("#tray input[type=range], #tray select");

function saveSettings() {
  const saved = {};
  for (const input of settingInputs()) saved[input.id] = input.id === "opt-key" ? keyMode : input.tagName === "SELECT" ? choice(input) : input.value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch { }
}

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch { }
  for (const input of settingInputs()) {
    if (saved[input.id] === undefined) continue;
    if (input.tagName === "SELECT" && ![...input.options].some(o => o.value === saved[input.id])) continue;
    input.value = saved[input.id];
    const out = outputFor(input);
    if (out) out.value = input.value;
  }
}

$("#tray").addEventListener("change", saveSettings);

/* the farnsworth track above wpm: out of reach, greyed (tx.css .cap) */
function markFarnsCap() {
  const wpm = $("#opt-wpm"), f = $("#opt-fwpm");
  const out = (Number(f.max) - Number(wpm.value)) / (Number(f.max) - Number(f.min));
  f.closest(".track").style.setProperty("--f", String(Math.max(0, Math.min(1, out))));
}
$("#opt-wpm").addEventListener("input", markFarnsCap);

for (const input of document.querySelectorAll("#tray input[type=range]")) {
  input.addEventListener("input", () => {
    /* farnsworth (overall speed) can't be faster than the letters */
    const wpm = $("#opt-wpm"), fwpm = $("#opt-fwpm");
    if (Number(fwpm.value) > Number(wpm.value)) {
      fwpm.value = wpm.value;
      outputFor(fwpm).value = fwpm.value;
    }
    outputFor(input).value = input.value;
    drawStats();
  });
}

/* only offer what this phone can do */
$("#vibe-set").hidden = !("vibrate" in navigator);
document.querySelector('[data-out="vibrate"]').hidden = !("vibrate" in navigator);
/* the flashlight: Chrome on Android exposes the torch through the camera */
if (!/Android/i.test(navigator.userAgent) || !navigator.mediaDevices?.getUserMedia) $("#torch-choice").remove();

/*
 * ============================================================
 * LIGHT & VIBRATION
 * ============================================================
 *
 * One signal for everything that keys: the logo, the light and
 * the vibration all follow it (sound is scheduled on its own,
 * to the same timing).
 */
const outputOn = name => document.querySelector(`[data-out="${name}"]`).getAttribute("aria-pressed") === "true";

const outputs = createOutputs({
  settings: () => ({
    light: outputOn("light"),
    lightMode: choice("#opt-light"),
    vibrate: outputOn("vibrate"),
    strength: Number($("#opt-vibe").value)
  }),
  lampTarget: $(".station"),
  overlay: {
    isOpen: () => !$("#lamp").hidden,
    flash: on => $("#lamp").classList.toggle("on", on)
  }
});

function setSignal(down) {
  logo.classList.toggle("down", down);
  outputs.signal(down);
}

/* the flashlight needs the camera: ask when it's chosen (a tap) */
async function wantTorch() {
  if (choice("#opt-light") !== "torch" || !outputOn("light")) return;
  if (!(await outputs.torchReady())) {
    toast("no flashlight available here");
    $("#opt-light").value = "signal";
    $("#opt-light").dataset.last = "signal";
    setOutput("light", false);
    saveSettings();
  }
}
let lightBefore = null;
$("#opt-light").addEventListener("change", () => {
  outputs.quiet();
  if (choice("#opt-light") !== "torch") outputs.releaseTorch();
  wantTorch();
  /* invert flips the whole screen as you key: ask first, as the
     signal lamp does (twice if your speed means more than 3 a second) */
  const was = lightBefore;
  lightBefore = choice("#opt-light");
  if ($("#opt-light").value === "invert" && was !== "invert") {
    const rate = 1000 / (2 * timingNow().unit);    // dits: one flash every two units
    askLamp(rate, () => { }, {
      invert: true,
      cancel: () => {
        $("#opt-light").value = was ?? "off";
        $("#opt-light").dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }
});


/*
 * Signal lamp: with the light on and "signal lamp" chosen, play
 * goes full screen. It asks first; if the message would flash
 * more than 3 times a second (the photosensitivity guideline),
 * it asks again, explicitly.
 */
const SAFE_RATE = 3;
let lampAgreed = false;    // this visit: the warning's been read
let lampPending = null;

function wantsLamp() {
  return outputOn("light") && choice("#opt-light") === "signal";
}

function askLamp(rate, go, { invert = false, cancel = null } = {}) {
  lampPending = { go, cancel, fast: rate > SAFE_RATE, confirmedFast: false };
  $("#lamp-title").textContent = invert ? "invert" : "signal lamp";
  $("#lamp-warn .what").textContent = invert
    ? "Invert flips the whole screen, light for dark, every time the key is down."
    : "The signal lamp flashes the whole screen with your message.";
  const fast = $("#lamp-warn .fast");
  fast.hidden = true;
  $("#lamp-go").textContent = invert ? "use it" : "start";
  $("#lamp-warn").hidden = false;
  $("#lamp-go").focus({ preventScroll: true });
  lampPending.rate = rate;
}

$("#lamp-go").addEventListener("click", () => {
  if (!lampPending) return;
  if (lampPending.fast && !lampPending.confirmedFast) {
    /* the second, explicit confirmation */
    lampPending.confirmedFast = true;
    const fast = $("#lamp-warn .fast");
    fast.textContent = `At this speed it flashes about ${lampPending.rate.toFixed(1)} times a second, faster than the 3-per-second safety guideline. Slow it down in settings, or start anyway.`;
    fast.hidden = false;
    $("#lamp-go").textContent = "start anyway";
    return;
  }
  lampAgreed = true;
  $("#lamp-warn").hidden = true;
  const go = lampPending.go;
  lampPending = null;
  go();
});

function cancelLamp() {
  $("#lamp-warn").hidden = true;
  const cancel = lampPending?.cancel;
  lampPending = null;
  cancel?.();
}
$("#lamp-cancel").addEventListener("click", cancelLamp);
$("#lamp-warn .close").addEventListener("click", cancelLamp);

function openLamp(words) {
  /* the ghost respects the eye: a hidden row stays hidden */
  $("#lamp .ghost-morse").textContent = hidden && mode === "type" ? "" : share.morseText(words);
  $("#lamp .ghost-text").textContent = hidden && mode === "key" ? "" : share.plainText(words);
  $("#lamp").classList.remove("on");
  $("#lamp").hidden = false;
}

function closeLamp() {
  if ($("#lamp").hidden) return;
  $("#lamp").hidden = true;
  $("#lamp").classList.remove("on");
}

/* tap or Escape (see ESCAPE): stop and leave */
$("#lamp").addEventListener("click", () => { stopPlayback(); closeLamp(); });


/* output toggles (♪ ☼ ≋), remembered on this device */
const OUTPUTS_KEY = "dot-dash:tx-outputs";

function applyOutputs() {
  sound.setEnabled(outputOn("sound"));
  outputs.quiet();             // a switched-off light / vibration lets go at once
  wantTorch();
  linkSettings();
}

/*
 * Settings follow their output: with ♪ off, the sound settings
 * grey out (☼: light, ≋: vibrate). Touching a greyed one switches
 * its output back on, and the touch carries on as normal (the
 * slider slides, the list opens).
 */
function linkSettings() {
  for (const set of document.querySelectorAll("#tray [data-needs]")) {
    const on = outputOn(set.dataset.needs);
    set.classList.toggle("idle", !on);
    const select = set.querySelector("select");
    if (!select) continue;
    if (!on && select.value !== "off") {
      select.dataset.last = select.value;
      select.value = "off";
    } else if (on && select.value === "off") {
      select.value = choice(select);
    }
  }
}

/* a list's real choice, even while it shows "off" */
function choice(select) {
  if (typeof select === "string") select = $(select);
  if (select.value !== "off") return select.value;
  const last = select.dataset.last;
  const real = [...select.options].filter(o => o.value !== "off" && !o.disabled);
  if (real.some(o => o.value === last)) return last;
  return (real.find(o => o.defaultSelected) ?? real[0]).value;   // the list's default
}

function wake(event) {
  const set = event.target.closest?.("#tray [data-needs].idle");
  if (set) document.querySelector(`[data-out="${set.dataset.needs}"]`)?.click();
}
$("#tray").addEventListener("pointerdown", wake, true);
$("#tray").addEventListener("focusin", wake, true);

/* dot red / dash blue: one choice for this page and the reference
   (the same remembered setting) */
{
  const box = $("#opt-color");
  try {
    const saved = localStorage.getItem("dot-dash:signal");
    if (saved !== null) box.checked = saved === "1";
  } catch { }
  const apply = () => {
    document.body.classList.toggle("signal", box.checked);
    try { localStorage.setItem("dot-dash:signal", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  apply();
}

/* ctrl keys (the VBand adapter's paddles): remembered, off by default */
{
  const box = $("#opt-ctrl");
  try { box.checked = localStorage.getItem("dot-dash:tx-ctrl-keys") === "1"; } catch { }
  box.addEventListener("change", () => {
    ctrlPaddle.down = false;
    try { localStorage.setItem("dot-dash:tx-ctrl-keys", box.checked ? "1" : "0"); } catch { }
  });
}

/* pretty play: remembered; switching it starts playback afresh */
{
  const box = $("#opt-pretty");
  try { box.checked = localStorage.getItem("dot-dash:tx-pretty") === "1"; } catch { }
  box.addEventListener("change", () => {
    try { localStorage.setItem("dot-dash:tx-pretty", box.checked ? "1" : "0"); } catch { }
    stopPlayback();
  });
}

/* invert: the light theme (the same instrument printed on paper);
   shared with the reference page */
{
  const box = $("#opt-theme");
  box.checked = document.documentElement.classList.contains("light");
  const apply = () => {
    document.documentElement.classList.toggle("light", box.checked);
    try { localStorage.setItem("dot-dash:theme", box.checked ? "light" : "dark"); } catch { }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", box.checked ? "#ebe5d7" : "#1c1916");
    trace.redraw();
  };
  box.addEventListener("change", apply);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", box.checked ? "#ebe5d7" : "#1c1916");
}

/* light level: dims the lamp's glow and the signal lamp (a web
   page can't dim the flashlight: it's on or off) */
function applyGlow() {
  document.documentElement.style.setProperty("--glow", Number($("#opt-glow").value) / 100);   // (the invert filter lives on the page root)
  /* the level dims the lamp (always on), the lit keys and the screen
     lights; a web page can't dim the flashlight itself */
  const torch = choice("#opt-light") === "torch" && outputOn("light");
  $("#opt-glow").closest(".fader").title = torch ? "the flashlight itself can only be on or off" : "";
}
$("#opt-glow").addEventListener("input", applyGlow);
$("#opt-vibe").addEventListener("change", () => { if (outputOn("vibrate")) outputs.testBuzz(); });   // feel the new strength
$("#opt-light").addEventListener("change", applyGlow);

try {
  const saved = JSON.parse(localStorage.getItem(OUTPUTS_KEY)) ?? {};
  for (const [name, on] of Object.entries(saved)) {
    document.querySelector(`[data-out="${name}"]`)?.setAttribute("aria-pressed", String(on));
  }
  /* "lamp" used to be a light choice; it's always on now, so a saved
     lamp means: no extra light */
  if (JSON.parse(localStorage.getItem(SETTINGS_KEY))?.["opt-light"] === "lamp") {
    document.querySelector('[data-out="light"]').setAttribute("aria-pressed", "false");
  }
} catch { }

function setOutput(name, on) {
  const b = document.querySelector(`[data-out="${name}"]`);
  if (!b || outputOn(name) === on) return;
  b.setAttribute("aria-pressed", String(on));
  const saved = {};
  for (const o of document.querySelectorAll(".outputs button")) saved[o.dataset.out] = o.getAttribute("aria-pressed") === "true";
  try { localStorage.setItem(OUTPUTS_KEY, JSON.stringify(saved)); } catch { }
  applyOutputs();
}

for (const b of document.querySelectorAll(".outputs button")) {
  b.addEventListener("click", () => {
    setOutput(b.dataset.out, !outputOn(b.dataset.out));
    if (b.dataset.out === "sound" && sound.enabled) preview();
    /* vibration on: a short buzz now (inside the tap, which phones require) */
    if (b.dataset.out === "vibrate" && outputOn("vibrate") && outputs.testBuzz() === false) {
      toast("this browser won't vibrate");
    }
  });
}

/*
 * Sound, wave and light also have "off" in their lists: the same
 * switch as ♪ / ☼. Picking off turns the output off; picking
 * anything else turns it back on. While it's off the list shows
 * "off" and keeps the last real choice for when it comes back.
 */
for (const select of document.querySelectorAll("#opt-sound, #opt-wave, #opt-light")) {
  select.addEventListener("change", () => {
    const name = select.closest("[data-needs]").dataset.needs;
    if (select.value === "off") return setOutput(name, false);
    select.dataset.last = select.value;
    setOutput(name, true);
  });
}

/* sound settings: live while sliding, a short sample on release */
function applySound() {
  sound.setPitch(Number($("#opt-hz").value));
  sound.setVolume(Number($("#opt-vol").value) / 100);
  sound.setKind(choice("#opt-sound"));
  sound.setWave(choice("#opt-wave"));
  $("#opt-wave").disabled = choice("#opt-sound") === "sounder";   // the sounder has no wave
}

function preview() {
  sound.unlock();
  const t = timingNow();
  sound.mark(0, Math.max(t.unit, 120) / 1000);
}

$("#opt-hz").addEventListener("input", applySound);
$("#opt-vol").addEventListener("input", applySound);
$("#opt-sound").addEventListener("change", () => { applySound(); preview(); });
$("#opt-wave").addEventListener("change", () => { applySound(); preview(); });
$("#opt-hz").addEventListener("change", preview);
$("#opt-vol").addEventListener("change", preview);

/* the message on the board (not yet sent): gone */
function clearCurrent() {
  tokens = [];
  took = [];
  keyer.reset();
  setTyped("");
}

/* clear history: tap twice (no pop-up dialogs) */
let clearArmed = null;

function clearHistory() {
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    history = [];
    saveHistory();
    clearCurrent();            // the unsent message goes too: a clean board
    update();
    return;
  }
  clearArmed = setTimeout(() => {
    clearArmed = null;
    const b = $("#tape .tape-head button");
    if (b) { b.textContent = "clear history"; b.classList.remove("armed"); }
  }, 3000);
  const b = $("#tape .tape-head button");
  b.textContent = "tap again to clear all history";
  b.classList.add("armed");
}


/*
 * ============================================================
 * PLAYBACK
 * ============================================================
 *
 * Plays the current line, or the last message sent when the
 * line is empty. While it plays, the line lights mark by mark
 * (like the main page), and the logo and both trees follow.
 * Keying anything stops it: the message has changed.
 */

const player = createPlayer({
  sound,
  timing: timingNow,
  frame: showPlayback,
  end: playbackEnded,
  rounds: () => ROUNDS[repeatMode],
  gap: () => timingNow().word          // a word space between rounds
});

let playKey = null;        // which message is loaded (to notice edits)
let repeatMode = "off";    // off / three / on
let playEntry = null;      // "current" or a history index
let shown = null;          // last highlight applied
let endTimer = null;

const messageKey = () => tokens.join("") + "|" + history.map(morseOf).join(",");

/* pretty play: textbook timing, the keying's hesitations left out
   (for playback, the trace and the saved .wav alike) */
const pretty = () => $("#opt-pretty").checked;

/* what share works on: the line being written, only (sent, it's
   gone from here: the menu greys until there's a new one) */
function shareable() {
  const words = wordsOf(tokens);
  return words.length ? { words, rec: pretty() ? [] : recOf(tokens, took), entry: "current" } : null;
}

function playable() {
  const words = wordsOf(tokens);
  if (words.length) return { words, rec: pretty() ? [] : recOf(tokens, took), entry: "current" };
  if (history.length) {
    const last = history[history.length - 1];
    return { words: parse(morseOf(last)), rec: pretty() ? [] : recOfEntry(last), entry: history.length - 1 };
  }
  return null;
}

function entryEl() {
  if (playEntry === null) return null;
  return playEntry === "current" ? $("#tape .current") : document.querySelectorAll("#tape .past")[playEntry];
}

/* Morse messages are short: tenths of a second under a minute */
const clock = ms => {
  if (ms < 60000) return (Math.floor(ms / 100) / 10).toFixed(1);
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const unitOf = ms => (ms < 60000 ? "s" : "");

/* the readout grows from "2.6s" to "1.9/2.6s" while playing:
   reserve the longer width up front so the scrub bar never moves */
function sizeClock(duration) {
  const longest = clock(duration) + "/" + clock(duration) + unitOf(duration);
  $("#time").style.width = longest.length + "ch";
}

/*
 * The scrub bar's trace (js/tx-trace.js): the signal of whatever
 * play would play, with the playhead's progress.
 */
const THUMB = 4;   // px: the playhead column's width (tx.css)
const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();
const trace = createTrace({
  canvas: $(".seek-wrap .trace"),
  pop: $(".seek-pop"),
  popCanvas: $(".seek-pop canvas"),
  thumb: THUMB,
  unit: () => timingNow().unit,
  colors: () => {
    const signal = document.body.classList.contains("signal");
    const c = { wire: css("--wire"), paper: css("--paper"), brass: css("--brass"), played: css("--paper"), toCome: css("--graphite"),
                sounder: choice("#opt-sound") === "sounder" };
    c.markColor = mk => mk.live ? c.brass : signal ? css(mk.mark === "." ? "--dot" : "--dash") : c.paper;
    return c;
  }
});

function refreshTrace() {
  /* nothing being entered (just sent, or cleared): a blank bar,
     though play still replays the last message sent */
  const idle = playKey === null && !wordsOf(tokens).length;
  const p = idle ? null : playable();
  if (!p) return trace.line({ marks: [], letters: [], duration: 0 });
  const line = timeline(p.words, timingNow(), p.rec);
  for (const l of line.letters) l.label = DECODE[l.code]?.replace(/^<(.*)>$/, "$1") ?? "?";
  trace.line(line);
}

new ResizeObserver(() => trace.redraw()).observe($(".seek-wrap"));
$("#opt-sound").addEventListener("change", () => trace.redraw());   // the sounder draws clicks
$("#opt-color").addEventListener("change", () => trace.redraw());

/* hold the scrub bar: the magnified pop-out */
$("#seek").addEventListener("pointerdown", () => { if (!$("#seek").disabled) trace.zoom(true); });
for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => trace.zoom(false));

function playerControls() {
  document.body.classList.toggle("playing", player.playing);   // the caret holds still
  if (navigator.mediaSession) navigator.mediaSession.playbackState = player.playing ? "playing" : "paused";
  const can = !!playable();
  $("#play").disabled = !can;
  $("#seek").disabled = !can;
  $("#repeat").disabled = !can;      // greyed until there's something to play
  const playIcon = player.playing ? "pause" : "play";
  if ($("#play").dataset.icon !== playIcon) {
    $("#play").dataset.icon = playIcon;
    $("#play").innerHTML = icon(playIcon);
  }
  $("#play").setAttribute("aria-label", player.playing ? "pause" : "play");
  /* nothing loaded yet: show the length of what would play */
  if (playKey === null && !player.playing) {
    const p = playable();
    const d = p ? timeline(p.words, timingNow(), p.rec).duration : 0;
    $("#seek").max = Math.round(d);
    $("#seek").value = 0;
    refreshTrace();
    trace.at(0);
    $("#time").textContent = clock(d) + unitOf(d);
    sizeClock(d);
  }
}

function load() {
  const p = playable();
  if (!p) return false;
  if (playKey !== messageKey() || playEntry !== p.entry) {
    player.load(p.words, p.rec);
    playKey = messageKey();
    playEntry = p.entry;
    refreshTrace();
    $("#seek").max = Math.round(player.duration);
    sizeClock(player.duration);
  }
  return true;
}

function togglePlay() {
  sound.unlock();
  if (player.playing) {
    player.pause();
    setSignal(false);     // like lifting off the key: the lamp, screen and flashlight go dark
  } else {
    if (!load()) return;
    if (wantsLamp() && $("#lamp").hidden) {
      const go = () => { openLamp(playable().words); togglePlay(); };
      const rate = flashRate(timeline(playable().words, timingNow(), playable().rec));
      if (!lampAgreed || rate > SAFE_RATE) return askLamp(rate, go);
      return go();
    }
    clearTimeout(endTimer);
    keyer.cancel();
    cancelTaps();
    player.play();
    revealEntry();
  }
  playerControls();
}

/* playing a sent message: scroll it into view while it plays */
function revealEntry() {
  if (playEntry === "current") return;
  const e = entryEl();
  if (!e) return;
  const tape = $("#tape");
  tape.scrollTop = Math.max(0, e.offsetTop - 8);
  fadeTape();
}

function stopPlayback() {
  clearTimeout(endTimer);
  const wasPast = playEntry !== null && playEntry !== "current";
  player.stop();
  clearHighlight();
  if (wasPast) settleTape();
  playKey = null;
  playEntry = null;
  setSignal(false);
  closeLamp();
  playerControls();
}

/*
 * The pad plays along, half-lit, like a player piano: the key
 * that makes each sound (in straight mode, the one key).
 */
function ghostKeys(symbol) {
  const dit = $("#pad .key.dit"), dah = $("#pad .key.dah");
  const one = keyMode === "straight";
  dit.classList.toggle("ghost", symbol === "." || (one && symbol === "-"));
  dah.classList.toggle("ghost", symbol === "-" && !one);
}

function clearHighlight() {
  ghostKeys(null);
  trainView.show({ phase: null });
  for (const e of document.querySelectorAll("#tape .playing")) e.classList.remove("playing");
  for (const l of document.querySelectorAll("#tape .line.live")) {
    l.classList.remove("live");
    for (const c of l.querySelectorAll(".c")) c.classList.remove("landed", "sent");
    for (const m of l.querySelectorAll(".keyed")) m.classList.remove("keyed");
  }
  shown = null;
}

/* every frame while playing (or when the scrub bar moves) */
function showPlayback(state) {
  $("#seek").value = Math.round(state.position);
  trace.at(state.position);
  $("#time").textContent = clock(state.position) + "/" + clock(state.duration) + unitOf(state.duration);
  setSignal(state.down && player.playing);   // paused (or scrubbing paused): the key is open, lights out
  ghostKeys(state.symbol);
  if (!$("#train").hidden) trainView.replay(state.between ? null : state.phase);

  const key = state.letter + "|" + state.mark + "|" + state.down + "|" + state.path;
  if (key === shown) return;
  shown = key;

  /* the message: marks keyed so far, letters sent / just landed */
  const entry = entryEl();
  const lineEl = entry?.querySelector(".line");
  if (lineEl) {
    entry.classList.add("playing");
    lineEl.classList.add("live");
    let g = 0;
    [...lineEl.querySelectorAll(".c")].forEach((c, i) => {
      c.classList.toggle("sent", i < state.letter);
      c.classList.toggle("landed", i === state.letter && !state.path);
      for (const m of c.querySelectorAll(".m span")) m.classList.toggle("keyed", g++ <= state.mark && i <= state.letter);
    });
  }

  /* the trees follow the letter being sounded */
  drawLocal(state.path || (state.letter >= 0 ? wordsAt()[state.letter] ?? "" : ""));
  if (treeOpen) {
    tree.handle({ type: "start" });
    if (state.path) tree.handle({ type: "beat", path: inTree(state.path) });
    else if (state.letter >= 0) {
      const code = wordsAt()[state.letter];
      if (code && REAL.has(code)) tree.handle({ type: "letter", path: code });
    }
    followNode();
  }
}

/* the codes of the playing message, in order */
function wordsAt() {
  const p = playable();
  return p ? p.words.flat() : [];
}

function playbackEnded() {
  playerControls();
  /* hold the finished message a moment, then rest */
  endTimer = setTimeout(() => {
    clearHighlight();
    setSignal(false);
    closeLamp();
    drawLocal();
    drawTree();
    settleTape();   // back to the current line
  }, 600);
}

$("#play").addEventListener("click", togglePlay);

/* the scrub bar: drag to move; playback carries on from there */
let resumeAfterSeek = false;
$("#seek").addEventListener("pointerdown", () => {
  sound.unlock();
  load();
  resumeAfterSeek = player.playing;
  player.pause();
  setSignal(false);
  playerControls();
});
$("#seek").addEventListener("input", () => {
  load();
  clearTimeout(endTimer);
  player.seek(Number($("#seek").value));
});
$("#seek").addEventListener("change", () => {
  if (resumeAfterSeek) player.play();
  resumeAfterSeek = false;
  playerControls();
});

/*
 * repeat: off → ×3 → ∞ → off  (remembered)
 *   ×3 plays the message three times, a word space apart
 */
const ROUNDS = { off: 1, three: 3, on: Infinity };
const NEXT = { off: "three", three: "on", on: "off" };
const REPEAT_LABEL = { off: "repeat: off", three: "repeat: 3 times", on: "repeat: on" };

function setRepeat(next) {
  repeatMode = ROUNDS[next] ? next : "off";
  const b = $("#repeat");
  b.dataset.repeat = repeatMode;
  b.setAttribute("aria-pressed", String(repeatMode !== "off"));
  b.setAttribute("aria-label", REPEAT_LABEL[repeatMode]);
  b.title = REPEAT_LABEL[repeatMode];
  try { localStorage.setItem("dot-dash:tx-repeat", repeatMode); } catch { }
}

$("#repeat").addEventListener("click", () => setRepeat(NEXT[repeatMode]));
try {
  const saved = localStorage.getItem("dot-dash:tx-repeat");
  setRepeat(saved === "1" ? "on" : saved ?? "three");   // "1" = the old on/off setting; new: ×3
} catch { setRepeat("three"); }

/*
 * ============================================================
 * PLAYER KEYS
 * ============================================================
 *
 *   Space        play / pause, while the player is in use (playing,
 *                or paused part-way); otherwise it keys as before
 *   K or P       play / pause
 *   ← →          back / on a letter       Shift ← →, J L   a word
 *   Home End     the start / the end
 *   ↑ ↓          volume                   M                mute
 *   0 – 9        0% – 90% of the way in, while the player is in use
 *                (otherwise 1 and 3 are paddles, as before)
 *
 * Letters (K P J L M), Space and the numbers type instead while
 * the text keyboard is out, unless the player is active (below).
 */
/* in use: playing, or loaded and not yet finished (paused, or
   scrubbed back to the start); a finished message isn't, so Space
   and the numbers go back to keying */
const playerInUse = () =>
  player.playing || (playKey !== null && player.position < player.duration);
const playerKeysDown = new Set();

/* where each letter and each word starts, in what play would play */
function stops(byWord) {
  const p = playable();
  if (!p) return [];
  const { letters } = timeline(p.words, timingNow(), p.rec);
  if (!byWord) return letters.map(l => l.start);
  const out = [];
  let i = 0;
  for (const word of p.words) { if (letters[i]) out.push(letters[i].start); i += word.length; }
  return out;
}

function seekTo(ms) {
  sound.unlock();
  if (!load()) return;
  clearTimeout(endTimer);
  player.seek(Math.max(0, Math.min(ms, player.duration)));
  playerControls();
}

/* a step back from just inside a letter goes to the one before, as players do */
const STEP_GRACE = 250;
function step(dir, byWord) {
  if (!load()) return;
  const at = player.position, marks = stops(byWord);
  if (dir > 0) seekTo(marks.find(t => t > at + 1) ?? player.duration);
  else seekTo([...marks].reverse().find(t => t < at - STEP_GRACE) ?? 0);
}

function nudgeVolume(by) {
  const v = $("#opt-vol");
  v.value = String(Math.max(Number(v.min), Math.min(Number(v.max), Number(v.value) + by)));
  v.dispatchEvent(new Event("input", { bubbles: true }));
  v.dispatchEvent(new Event("change", { bubbles: true }));
}

/*
 * The player as an active region (as a video player takes the keys
 * once you've clicked it): a tap or click anywhere in the player
 * row, or tabbing into it, makes it active, outlined in brass.
 * While it's active, every key is the player's: the keys above
 * always work, and the rest do nothing (no keying, no typing, no
 * cutting the playback short). A tap anywhere else, or Escape,
 * lets go.
 */
let playerActive = false;
const playerRow = $(".player");

function setPlayerActive(on) {
  playerActive = on;
  playerRow.classList.toggle("active", on);
}
playerRow.addEventListener("pointerdown", () => setPlayerActive(true));
playerRow.addEventListener("focusin", () => setPlayerActive(true));
playerRow.addEventListener("focusout", event => {
  if (!playerRow.contains(event.relatedTarget) && event.relatedTarget) setPlayerActive(false);
});
window.addEventListener("pointerdown", event => {
  if (playerActive && !event.target.closest?.(".player, .seek-pop")) setPlayerActive(false);
}, true);

/* keys that are never the player's to take, even while it's active */
const passesThrough = event =>
  /^(Escape|Tab|F\d+|Media.*|Audio.*|Shift|Alt|Meta|Control|CapsLock|ContextMenu)$/.test(event.key);

window.addEventListener("keydown", event => {
  const swallow = () => { event.preventDefault(); event.stopPropagation(); playerKeysDown.add(event.code); };
  if (event.ctrlKey || event.metaKey || event.altKey) {
    if (playerActive && /^Control/.test(event.code) && !event.repeat) swallow();   // a Ctrl paddle doesn't key here
    return;
  }
  if (event.target.closest?.("input, select, textarea") && event.target.id !== "seek") return;   // the scrub bar steps our way
  const active = playerActive;
  const typing = !active && mode === "type" && !inputAway;
  const inUse = active || playerInUse();
  const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const once = fn => () => { if (!event.repeat) fn(); };
  let act = null;
  if (event.code === "Space" && !typing && inUse) act = once(togglePlay);
  else if ((k === "k" || k === "p") && !typing) act = once(togglePlay);
  else if (k === "m" && !typing) act = once(() => $('[data-out="sound"]').click());
  else if (k === "ArrowLeft" || k === "ArrowRight") act = () => step(k === "ArrowRight" ? 1 : -1, event.shiftKey);
  else if ((k === "j" || k === "l") && !typing) act = () => step(k === "l" ? 1 : -1, true);
  else if (k === "Home") act = () => seekTo(0);
  else if (k === "End") act = () => seekTo(Infinity);
  else if (k === "ArrowUp" || k === "ArrowDown") act = () => nudgeVolume(k === "ArrowUp" ? 5 : -5);
  else if (/^[0-9]$/.test(k) && !typing && inUse) act = once(() => seekTo(player.duration * Number(k) / 10));
  if (!act) {
    if (active && !passesThrough(event)) swallow();   // active: nothing else gets through
    return;
  }
  swallow();                   // the keyer and the text keyboard don't see it
  act();
}, true);

/* and the key's release isn't the keyer's either */
window.addEventListener("keyup", event => {
  if (!playerKeysDown.delete(event.code)) return;
  event.stopPropagation();
}, true);

/* a new speed changes the timeline */
/* a new speed: the player re-times itself and carries on */
for (const id of ["#opt-wpm", "#opt-fwpm"]) {
  $(id).addEventListener("input", () => {
    if (playKey === null) return playerControls();   // nothing loaded: just the new length
    player.retime();
    refreshTrace();
    $("#seek").max = Math.round(player.duration);
    sizeClock(player.duration);
    if (!player.playing) showPlayback(player.stateAt(player.position));
  });
}


/*
 * ============================================================
 * PASTE & SHARE
 * ============================================================
 *
 * Paste anywhere (Ctrl/⌘+V), or "paste" in the share menu on a
 * phone: Morse if it starts with . or -, otherwise text. It's
 * added to the end of the current message.
 *
 * The share menu works on the message the player would play:
 * the current line, or the last one sent.
 */

function pasteIn(raw) {
  if (!raw || !raw.trim()) return false;
  const { words, morse } = share.readPaste(raw);
  if (!words.length) return false;
  keyer.cancel();
  const add = tokensOf(words);
  if (tokens.length) {
    /* after what's there, as a new word */
    while (tokens.length && (tokens.at(-1) === " " || tokens.at(-1) === "/")) { tokens.pop(); took.pop(); }
    if (tokens.length) { tokens.push("/"); took.push(null); }
  }
  tokens.push(...add);
  took.push(...add.map(() => null));
  lastInput = performance.now();
  setTyped(plainText(wordsOf(tokens)) ?? typed);
  /* switch to how it arrived: Morse to the key, text to the keyboard */
  const want = morse ? "key" : "type";
  if (want !== mode) setMode(want);
  putKeysAway(true);   // the keys step aside: it's there to read or play
  return true;
}

document.addEventListener("paste", event => {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (event.target.closest?.("input, select, textarea")) return;   // (the settings sliders)
  event.preventDefault();
  pasteIn(text);
});

/* ---------- the menu ---------- */

const menu = $("#share");
const note = msg => {
  $("#share-note").textContent = msg;
  clearTimeout(note.timer);
  note.timer = setTimeout(() => { $("#share-note").textContent = ""; }, 1800);
};

function openShare(open) {
  menu.hidden = !open;
  $("#share-toggle").setAttribute("aria-expanded", String(open));
  if (!open) return;
  /* it drops down from just under the share button */
  menu.style.setProperty("--share-top", Math.round($("#share-toggle").getBoundingClientRect().bottom + 8) + "px");
  const p = shareable();
  const words = p?.words ?? [];
  for (const b of menu.querySelectorAll("#share-copy button, .saves button, #share-native button")) b.disabled = !words.length;
  for (const b of menu.querySelectorAll("[data-soon]")) b.disabled = true;   // not ready yet
  menu.querySelector('[data-peek="morse"]').textContent = words.length ? share.morseText(words) : "nothing yet";
  menu.querySelector('[data-peek="text"]').textContent = words.length ? share.plainText(words) : "";
  menu.querySelector('[data-peek="link"]').textContent = words.length ? share.linkTo(words).replace(/^https?:\/\//, "") : "";
  $("#share-native").hidden = !navigator.share;
  /* the .gif comes from the link-preview worker: the live site only */
  $("#save-gif").hidden = location.hostname !== "dot-da.sh";
  $("#share-note").textContent = "";
}

$("#share-toggle").addEventListener("click", event => {
  event.stopPropagation();
  openShare(menu.hidden);
});
$("#share .close").addEventListener("click", () => openShare(false));

/* Escape closes it (see ESCAPE); so does a tap outside (see "a tap outside a popup") */

/*
 * A wait (the .wav rendering, the .gif being made): a small lamp in
 * the share menu keys the wait prosign, ·−··· (AS), at 20 wpm, over
 * and over, until it's done.
 */
const WAIT_CODE = ".-...";
let waitTimer = null;

function waitLamp(on) {
  clearTimeout(waitTimer);
  const box = $("#share-note");
  clearTimeout(note.timer);
  if (!on) { box.textContent = ""; return; }
  box.textContent = "";
  const lamp = el("span", "wait-lamp");
  box.append(lamp, el("span", "wait-label", " AS  wait…"));
  const unit = 1200 / 20;
  const steps = [];                                   // [lit, ms] pairs
  [...WAIT_CODE].forEach((m, i) => {
    if (i) steps.push([false, unit]);
    steps.push([true, (m === "." ? 1 : 3) * unit]);
  });
  steps.push([false, 7 * unit]);                      // a word space, then again
  let i = 0;
  const next = () => {
    const [lit, ms] = steps[i % steps.length];
    lamp.classList.toggle("lit", lit);
    i++;
    waitTimer = setTimeout(next, ms);
  };
  next();
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    note(`copied ${what}`);
  } catch {
    note("couldn't reach the clipboard");
  }
}

menu.addEventListener("click", async event => {
  const b = event.target.closest("button[data-do]");
  if (!b || b.disabled) return;
  const p = shareable();
  const words = p?.words ?? [];
  switch (b.dataset.do) {
    case "copy-morse": return copy(share.morseText(words), "the Morse");
    case "copy-text":  return copy(share.plainText(words), "the text");
    case "copy-link":  return copy(share.linkTo(words), "the link");
    case "save-txt":
      share.save(share.textFile(words), share.fileName(words, "txt"));
      return note("saved .txt");
    case "save-sh":
      share.save(share.scriptFile(words, timingNow().unit), share.scriptName(words));
      return note("saved the script");
    case "save-wav": {
      waitLamp(true);
      const blob = await share.renderWav({
        words, rec: p.rec, timing: timingNow(),
        kind: choice("#opt-sound"),
        wave: choice("#opt-wave"),
        pitch: Number($("#opt-hz").value),
        volume: Number($("#opt-vol").value) / 100
      });
      waitLamp(false);
      share.save(blob, share.fileName(words, "wav"));
      return note("saved .wav");
    }
    case "save-gif": {
      /* fetched here (it's made on the server), so the wait shows */
      waitLamp(true);
      try {
        const r = await fetch(share.gifLink(words));
        if (!r.ok) throw new Error(r.status);
        const blob = await r.blob();
        waitLamp(false);
        share.save(blob, share.fileName(words, "gif"));
        return note("saved .gif");
      } catch {
        waitLamp(false);
        return note("couldn't make the .gif");
      }
    }
    case "share":
      try {
        await navigator.share({ title: "dot-da.sh", text: share.morseText(words), url: share.linkTo(words) });
      } catch { /* closed the share sheet */ }
      return;
  }
});


/* ---------- paste: the header button, and a long-press ---------- */

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}

/* must run inside a tap: phones only let a page read the clipboard then */
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!pasteIn(text)) toast("nothing to paste");
  } catch {
    toast("the clipboard said no");
  }
}

$("#paste").addEventListener("click", pasteFromClipboard);

/*
 * Long-press the message (touch): a small "paste" bubble pops
 * up where you pressed, like a text field's. Tap it to paste.
 */
const bubble = $("#paste-bubble");
const LONG_PRESS = 480;   // ms
let pressTimer = null;
let pressAt = null;
let longPressed = false;

function showBubble(x, y) {
  longPressed = true;
  bubble.style.left = Math.max(40, Math.min(innerWidth - 40, x)) + "px";
  bubble.style.top = Math.max(60, y) + "px";
  bubble.hidden = false;
}

function hideBubble() {
  bubble.hidden = true;
}

$("#tape").addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse") return;
  longPressed = false;
  pressAt = { x: event.clientX, y: event.clientY };
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => showBubble(pressAt.x, pressAt.y), LONG_PRESS);
});

const cancelPress = () => clearTimeout(pressTimer);
$("#tape").addEventListener("pointerup", cancelPress);
$("#tape").addEventListener("pointercancel", cancelPress);
$("#tape").addEventListener("pointermove", event => {
  if (pressAt && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 10) cancelPress();   // scrolling
});
$("#tape").addEventListener("scroll", () => { cancelPress(); hideBubble(); }, { passive: true });

/* the phone's own long-press menu (Android): ours instead */
$("#tape").addEventListener("contextmenu", event => {
  if (pressAt) { event.preventDefault(); showBubble(pressAt.x, pressAt.y); }
});

/* the press that opened the bubble isn't also a tap (recall, ×) */
$("#tape").addEventListener("click", event => {
  if (!longPressed) return;
  longPressed = false;
  event.stopPropagation();
  event.preventDefault();
}, true);

bubble.addEventListener("click", () => {
  hideBubble();
  pasteFromClipboard();
});

document.addEventListener("pointerdown", event => {
  if (!bubble.hidden && event.target !== bubble) hideBubble();
});


/* the privacy (i): a small popup with the details */
function openPrivacy(open) {
  $("#privacy-pop").hidden = !open;
  for (const b of document.querySelectorAll(".privacy-open")) b.setAttribute("aria-expanded", String(open));
  if (open) {
    resetPopupClear();
    $("#privacy-pop .close").focus({ preventScroll: true });
  }
}

/* ~ misheard: why the same marks can be other letters */
function openHeard(open) {
  $("#heard-pop").hidden = !open;
  if (open) $("#heard-pop .close").focus({ preventScroll: true });
}
$("#heard-pop .close").addEventListener("click", () => openHeard(false));

/* (i) in the tree column: the character's card, here; the full page is a link in it */
function openAbout(code) {
  const pop = $("#about-pop");
  if (!code) { pop.hidden = true; return; }
  renderCard($("#about-card"), code);
  $("#about-title").textContent = `about ${DECODE[code] ?? code}`;
  $("#about-full").href = aboutHref(code);
  $("#about-card").scrollTop = $("#about-card").scrollLeft = 0;
  pop.hidden = false;
  $("#about-pop .close").focus({ preventScroll: true });
}
$("#tree-info").addEventListener("click", event => {
  /* a plain tap opens the card; a middle click or ⌘/Ctrl-click still opens the page */
  if (!aboutCode || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  openAbout(aboutCode);
});
$("#about-pop .close").addEventListener("click", () => openAbout(null));
/* a character in the card: its own card */
$("#about-card").addEventListener("click", event => {
  const a = event.target.closest("a[data-code]");
  if (!a) return;
  event.preventDefault();
  openAbout(a.dataset.code);
});

/* clear history from here too: tap twice, like at the top of the history */
let popupArmed = null;

function resetPopupClear() {
  clearTimeout(popupArmed);
  popupArmed = null;
  const b = $("#privacy-clear");
  const n = history.length;
  b.classList.remove("armed");
  b.disabled = !n && !tokens.length;
  b.textContent = n ? `clear history (${n} message${n === 1 ? "" : "s"})`
    : tokens.length ? "clear history (unsent message)" : "no history to clear";
}

$("#privacy-clear").addEventListener("click", () => {
  const b = $("#privacy-clear");
  if (popupArmed) {
    clearTimeout(popupArmed);
    popupArmed = null;
    history = [];
    saveHistory();
    clearCurrent();
    update();
    b.classList.remove("armed");
    b.disabled = true;
    b.textContent = "history cleared";
    return;
  }
  b.classList.add("armed");
  b.textContent = "tap again to clear all history";
  popupArmed = setTimeout(resetPopupClear, 3000);
});

for (const b of document.querySelectorAll(".privacy-open")) {
  b.addEventListener("click", () => openPrivacy($("#privacy-pop").hidden));
}
$("#privacy-pop .close").addEventListener("click", () => openPrivacy(false));

/*
 * A tap outside a popup (share, privacy) only closes it: nothing
 * underneath keys, plays or opens. Caught on the way down, before
 * anything else sees it, and the release and click that follow
 * are swallowed too. The privacy popup sits over the share menu,
 * so a tap on the menu closes just the privacy popup.
 */
{
  let eating = null;
  const eat = event => { event.preventDefault(); event.stopPropagation(); };
  const REST = ["pointerup", "click", "mouseup", "touchend"];
  const stopEating = () => {
    clearTimeout(eating);
    for (const t of REST) window.removeEventListener(t, eat, { capture: true });
  };
  const eatRest = () => {
    for (const t of REST) window.addEventListener(t, eat, { capture: true, once: true });
    /* a drag, or a key that holds back its click, gives no click: stop waiting */
    eating = setTimeout(stopEating, 700);
  };
  window.addEventListener("pointerdown", event => {
    stopEating();              // a new tap: whatever the last one left behind goes
    const privacy = $("#privacy-pop"), heard = $("#heard-pop"), hold = $("#hold-pop"), about = $("#about-pop");
    let closed = false;
    if (!about.hidden) { if (!about.contains(event.target)) { openAbout(null); closed = true; } }
    else if (!hold.hidden) { if (!hold.contains(event.target)) { openHold(false); closed = true; } }
    else if (!heard.hidden) { if (!heard.contains(event.target)) { openHeard(false); closed = true; } }
    else if (!privacy.hidden && !privacy.contains(event.target)) { openPrivacy(false); closed = true; }
    else if (privacy.hidden && !menu.hidden && !menu.contains(event.target)) { openShare(false); closed = true; }
    if (!closed) return;
    eat(event);
    eatRest();
  }, true);
}

/* (the note over the keys on arrival: see ARRIVAL, at the top) */


/*
 * ============================================================
 * MEDIA KEYS
 * ============================================================
 *
 * A keyboard's (or headset's) play / pause and stop keys work the
 * player, through the media session where the browser offers one.
 * Volume up / down / mute stay the system's: the tone follows the
 * system volume already, and catching them too would do it twice.
 */
{
  const play = () => { if (!player.playing) togglePlay(); };
  const pause = () => { if (player.playing) togglePlay(); };
  const acts = { MediaPlayPause: togglePlay, MediaPlay: play, MediaPause: pause, MediaStop: stopPlayback };
  window.addEventListener("keydown", event => {
    const act = acts[event.key];
    if (!act || event.repeat) return;
    event.preventDefault();
    act();
  });
  const session = navigator.mediaSession;
  if (session) {
    for (const [name, fn] of [["play", play], ["pause", pause], ["stop", stopPlayback]]) {
      try { session.setActionHandler(name, fn); } catch { /* not offered here */ }
    }
  }
}

/*
 * ============================================================
 * ESCAPE
 * ============================================================
 *
 * One press, one thing: it closes whatever's on top (the lamp's
 * warning, the lamp, the privacy popup, the share menu, the paste
 * bubble, the note on arrival); then lets go of an active player;
 * with nothing else, it shows or hides the keys, like the chevron.
 */
window.addEventListener("keydown", event => {
  if (event.key !== "Escape" || event.repeat || isChord(event)) return;
  const open = sel => !$(sel).hidden;
  if (open("#notice")) return;                                    // its own handler dismisses it
  if (open("#lamp-warn")) cancelLamp();
  else if (open("#lamp")) { stopPlayback(); closeLamp(); }
  else if (open("#privacy-pop")) openPrivacy(false);
  else if (open("#heard-pop")) openHeard(false);
  else if (open("#hold-pop")) openHold(false);
  else if (open("#about-pop")) openAbout(null);
  else if (open("#share")) openShare(false);
  else if (open("#paste-bubble")) hideBubble();
  else if (playerActive) setPlayerActive(false);                   // let go of the player first
  else {
    putKeysAway(!inputAway);
    if (inputAway) document.activeElement?.blur?.();             // the typing field lets go too
  }
  event.preventDefault();
  event.stopPropagation();
}, true);


/*
 * ============================================================
 * START
 * ============================================================
 */

loadSettings();
markFarnsCap();
applySound();
applyOutputs();
applyGlow();
lightBefore = choice("#opt-light");
trainView.build();
setKeyMode($("#opt-key").value);

let savedMode = "key";
try { savedMode = localStorage.getItem("dot-dash:tx-mode") ?? "key"; } catch { }
setMode(savedMode === "type" ? "type" : "key", false);

let savedTree = "0";
try { savedTree = localStorage.getItem("dot-dash:tx-tree") ?? "0"; } catch { }
if (savedTree === "1") openTree(true);


/* installable, and usable offline (see /sw.js) */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { }));
}

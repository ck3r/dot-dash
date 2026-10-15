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

import { DECODE, ENCODE, TREE, encode, parse, format, cost } from "./morse.js";
import { createTree, buildModel } from "./tree.js";
import { createKeyer, timing, MODES } from "./tx-keyer.js";
import { createSound } from "./tx-sound.js";
import { createPlayer, timeline } from "./tx-player.js";
import * as share from "./tx-share.js";

const $ = s => document.querySelector(s);

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
  if (caret) box.append(el("span", "caret"));
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
    const x = el("button", "x", "x");
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
    const x = el("button", "x", "x");
    x.type = "button";
    x.setAttribute("aria-label", "clear this message");
    x.addEventListener("click", () => {
      tokens = [];
      took = [];
      keyer.reset();
      setTyped("");
      update();
    });
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

const EYE_OPEN = `<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 8C5.5 2.5 18.5 2.5 22.5 8C18.5 13.5 5.5 13.5 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="8" r="2.8" fill="currentColor"/></svg>`;
const EYE_SHUT = `<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 6C5.5 11.5 18.5 11.5 22.5 6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 9.8 5 12.6M12 11.1v3.1M17.5 9.8 19 12.6" stroke="currentColor" stroke-width="1.4"/></svg>`;

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

function settleTape() {
  const tape = $("#tape");
  const cur = tape.querySelector(".current");
  const prev = cur.previousElementSibling;
  const peek = prev ? Math.min(PEEK, prev.offsetHeight) : 0;
  tape.style.setProperty("--peek", peek + "px");
  const padBottom = parseFloat(getComputedStyle(tape).paddingBottom) || 0;
  cur.style.minHeight = Math.max(0, tape.clientHeight - peek - padBottom) + "px";
  tape.scrollTop = cur.offsetTop - peek;

  /* a long message: follow the caret down instead */
  const caret = cur.querySelector(".caret");
  if (caret) {
    const bottom = caret.offsetTop + caret.offsetHeight + 12;
    if (bottom > tape.scrollTop + tape.clientHeight) tape.scrollTop = bottom - tape.clientHeight;
  }
  fadeTape();
}

/* fade the top edge while there's history above the view */
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
 * stats:  chars        dits · dahs
 *         words              time
 * Time counts each letter's cost (marks, gaps and its trailing
 * letter space) plus the longer word spaces, in units; seconds
 * at the speed setting (one unit = 1.2 s / wpm).
 */
function drawStats() {
  const words = wordsOf(tokens);
  const codes = words.flat();
  const left = $("#stats-text"), right = $("#stats-morse");
  if (!codes.length) { left.textContent = right.textContent = ""; return; }
  const dits = codes.join("").split("").filter(s => s === ".").length;
  const dahs = codes.join("").length - dits;
  /* marks and the gaps inside letters at letter speed; the gaps
     between letters and words as stretched by Farnsworth */
  const t = timingNow();
  const inside = codes.reduce((n, c) => n + cost(c) - 3, 0);   // cost() = marks + inner gaps + 3
  const ms = inside * t.unit + (codes.length - words.length) * t.letter + (words.length - 1) * t.word + t.letter;
  const seconds = ms / 1000;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  left.textContent = `${plural(codes.length, "char")}\n${plural(words.length, "word")}`;
  right.textContent = `${plural(dits, "dit")} · ${plural(dahs, "dah")}\n${seconds.toFixed(1)} s`;
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

function drawLocal(override) {
  const path = override ?? structure(tokens).path;
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
    b.addEventListener("click", () => press(mark));
    return b;
  };
  row(child("."), "  ", child("-"));
}

/* Expanded: the letters-only vertical tree, plus branches for
   anything else this message uses (numbers, symbols). */
const tree = createTree($("#tree"), "vertical", { legend: false });   // the key sits above, at a fixed size
let lastLetter = null;

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
    /* off the end of the tree: light the way there, but no letter */
    if (shown !== path) for (const s of $("#tree").querySelectorAll(".lbl.on")) s.classList.remove("on");
  } else if (lastLetter && REAL.has(lastLetter)) {
    tree.handle({ type: "letter", path: lastLetter });
  }
  followNode();
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
  const toggle = $("#tree-toggle");
  toggle.textContent = open ? "<>" : "><";
  toggle.title = open ? "back to where you are" : "show the whole tree";
  toggle.setAttribute("aria-expanded", String(open));
  if (!open) $(".tree-edge").style.width = "";
  panelFor = "";
  try { localStorage.setItem("dot-dash:tx-tree", open ? "1" : "0"); } catch { }
  update();   /* the field changed size: re-fit the tree, re-settle the tape */
}

$("#tree-toggle").addEventListener("click", () => openTree(!treeOpen));

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
  update();
});


/*
 * ============================================================
 * UPDATE
 * ============================================================
 */

function update() {
  const { word, path } = structure(tokens);
  if (!path) lastLetter = word.at(-1) ?? null;
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
    logo.classList.toggle("down", down);
    sound.key(down);
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

function tapMark(m) {
  const t = timingNow();
  const now = performance.now();
  const start = Math.max(now, tapBusyUntil + t.unit);
  const length = (m === "." ? 1 : 3) * t.unit;
  if (start - now > 2000) return;
  tapBusyUntil = start + length;
  sound.mark((start - now) / 1000, length / 1000);
  setTimeout(() => logo.classList.add("down"), start - now);
  setTimeout(() => logo.classList.remove("down"), start - now + length);
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
  $("#opt-key").value = keyMode;
  const [dit, dah] = LABELS[keyMode];
  $("#pad .key.dit span").textContent = dit;
  $("#pad .key.dah span").textContent = dah;
  $("#pad .key.dit b").textContent = keyMode === "straight" ? "" : ".";
  showInput();
}

$("#opt-key").addEventListener("change", () => setKeyMode($("#opt-key").value));


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

/* a hardware keyboard works too:  .  -  space  /  backspace  enter
   (in timed modes . and - are the paddles, or the key) */
const KEYS = { ".": ".", "-": "-", " ": "letter", "/": "word", "Backspace": "undo" };
const padKey = act => document.querySelector(`#pad .key[data-act="${CSS.escape(act)}"]`);

document.addEventListener("keydown", event => {
  if (mode === "type" || event.target.closest?.("input, select, textarea")) return;
  if (event.key === "Enter") { event.preventDefault(); send(); return; }
  const act = KEYS[event.key];
  if (!act || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (event.repeat) return;
  keyDown(padKey(act));
});

document.addEventListener("keyup", event => {
  const act = KEYS[event.key];
  if (act) keyUp(padKey(act));
});

/* let go of everything if the page loses focus mid-press */
function releaseAll() {
  for (const b of document.querySelectorAll("#pad .key.pressed")) keyUp(b);
  keyer.reset();
  sound.silence();
}
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });


/*
 * ============================================================
 * TIMING TRAIN
 * ============================================================
 *
 *   held / sent    Δt ├──.──┃──-──┤       0 … 4 units
 *                            └ past here a held key is a dah
 *   waiting        Δt ├───˽────/──┤       0 … past the word gap
 */

const trainView = (() => {
  const onSeg = $("#train .seg.on"), offSeg = $("#train .seg.off");
  const onFill = onSeg.querySelector(".fill"), offFill = offSeg.querySelector(".fill");
  let ticks = {};
  let event = null;
  let frame = 0;

  /* the two halves: key held 0…4 units, key up 0…just past a
     full word gap (so the ideal word gap fits on the bar) */
  const spans = t => ({ on: 4 * t.unit, off: Math.max(t.wordAt * 1.2, t.word * 1.1) });

  /* playback only: where the ideal length would have ended */
  const onIdeal = el("span", "ideal");
  const offIdeal = el("span", "ideal");
  onSeg.append(onIdeal);
  offSeg.append(offIdeal);
  onIdeal.hidden = offIdeal.hidden = true;

  /* labels are built once (and again only if the speed changes) */
  function build() {
    const t = timingNow();
    const { on, off } = spans(t);
    onSeg.style.flexGrow = on;
    offSeg.style.flexGrow = off;
    ticks = {};
    const place = (seg, at, max, key, label, cls) => {
      const tick = el("span", "tick" + (cls ? " " + cls : ""), label);
      tick.style.left = Math.min(100, (at / max) * 100) + "%";
      seg.querySelector(".ticks").append(tick);
      if (key) ticks[key] = tick;
    };
    for (const seg of [onSeg, offSeg]) seg.querySelector(".ticks").textContent = "";
    place(onSeg, t.unit, on, ".", ".", "dot");
    place(onSeg, t.dahAt, on, null, "", "split");
    place(onSeg, 3 * t.unit, on, "-", "-", "dash");
    place(offSeg, t.letterAt, off, "letter", "˽");
    place(offSeg, t.wordAt, off, "word", "/");
  }

  function light(key) {
    for (const [k, tick] of Object.entries(ticks)) tick.classList.toggle("lit", k === key);
  }

  function draw() {
    if (!event) return;
    const t = timingNow();
    const { on, off } = spans(t);
    let elapsed = performance.now() - event.t0;

    if (event.phase === "gap") {
      offFill.style.width = Math.min(100, (elapsed / off) * 100) + "%";
      light(elapsed >= t.wordAt ? "word" : elapsed >= t.letterAt ? "letter" : null);
      if (elapsed >= off) { event = null; return; }   // past a word space: rest
    } else {
      let mark;
      if (event.phase === "send") {
        elapsed = Math.min(elapsed, event.length);
        mark = event.mark;
      } else {
        mark = elapsed >= t.dahAt ? "-" : ".";
      }
      onFill.className = "fill " + (mark === "." ? "dot" : "dash");
      onFill.style.width = Math.min(100, (elapsed / on) * 100) + "%";
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
    if (event.phase === "gap") {
      onFill.classList.add("past");       // keep the mark just made, dimmed
      offFill.style.width = "0";
    } else {
      onFill.classList.remove("past");
      offFill.style.width = "0";
    }
    draw();
  }

  /*
   * Playback: the bar replays the timing as it was keyed, with a
   * marker where the ideal length ends, so you can see a dah held
   * short or a letter space rushed:
   *
   *     Δt ├──.──┃██-██▌┤          ▌ = ideal (3 units)
   *                     └ fill = how long you actually held it
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
    const { on, off } = spans(t);
    const pct = (x, max) => Math.min(100, (x / max) * 100) + "%";
    if (ph.kind === "hold") {
      onFill.className = "fill " + (ph.symbol === "." ? "dot" : "dash");
      onFill.style.width = pct(ph.elapsed, on);
      offFill.style.width = "0";
      onIdeal.hidden = false;
      onIdeal.style.left = pct(ph.ideal, on);
      offIdeal.hidden = true;
      light(ph.symbol);
    } else {
      onFill.classList.add("past");
      offFill.style.width = pct(ph.elapsed, off);
      offIdeal.hidden = false;
      offIdeal.style.left = pct(ph.ideal, off);
      onIdeal.hidden = true;
      light(ph.elapsed >= t.wordAt ? "word" : ph.elapsed >= t.letterAt ? "letter" : null);
    }
  }

  build();
  $("#opt-wpm").addEventListener("input", build);
  $("#opt-fwpm").addEventListener("input", build);

  return { show, replay, build };
})();

$("#send").addEventListener("click", send);


/*
 * ============================================================
 * INPUT MODE: key Morse [.-]  or  type text [A]
 * ============================================================
 */

let mode = "key";

function setMode(next, focus = true) {
  mode = next;
  document.body.dataset.mode = mode;
  for (const b of document.querySelectorAll(".input-mode button")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  }
  showInput();
  if (mode === "type") setTyped(plainText(wordsOf(tokens)) ?? "");
  try { localStorage.setItem("dot-dash:tx-mode", mode); } catch { }
  update();
}

for (const b of document.querySelectorAll(".input-mode button")) {
  b.addEventListener("click", () => setMode(b.dataset.mode));
}

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
    setTimeout(() => logo.classList.add("down"), start - now);
    setTimeout(() => logo.classList.remove("down"), start - now + length);
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
        b.className = "k-space";
        b.append(el("small", "", "space"));
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
    kbd.append(rowEl);
  }
}

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

$("#kbd").addEventListener("pointerdown", event => {
  const b = event.target.closest("button[data-k]");
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
  const trayOpen = !$("#tray").hidden;
  $("#pad").hidden = trayOpen || mode !== "key";
  $("#type").hidden = trayOpen || mode !== "type";
  $("#train").hidden = trayOpen || mode !== "key" || keyMode === "tap";
}

function openTray(open) {
  $("#tray").hidden = !open;
  $("#tray-toggle").setAttribute("aria-expanded", String(open));
  showInput();
}

$("#tray-toggle").addEventListener("click", () => openTray($("#tray").hidden));

/* a tap anywhere above the player closes the settings; the player
   row itself (play, scrub, repeat, sound / light / vibration) stays
   usable, so changes can be tried out with the settings still open */
document.addEventListener("pointerdown", event => {
  if ($("#tray").hidden) return;
  if (event.target.closest("#tray, #tray-toggle, .player")) return;
  openTray(false);
});

const outputFor = input => document.querySelector(`output[for="${input.id}"]`);

/* settings are remembered on this device */
const SETTINGS_KEY = "dot-dash:tx-settings";
const settingInputs = () => document.querySelectorAll("#tray input[type=range], #tray select");

function saveSettings() {
  const saved = {};
  for (const input of settingInputs()) saved[input.id] = input.value;
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
if (!/Android/i.test(navigator.userAgent)) $("#torch-choice").remove();   // placeholder until wired

/* output toggles (♪ ☼ ≋), remembered on this device */
const OUTPUTS_KEY = "dot-dash:tx-outputs";

function applyOutputs() {
  const on = name => document.querySelector(`[data-out="${name}"]`).getAttribute("aria-pressed") === "true";
  sound.setEnabled(on("sound"));
}

try {
  const saved = JSON.parse(localStorage.getItem(OUTPUTS_KEY)) ?? {};
  for (const [name, on] of Object.entries(saved)) {
    document.querySelector(`[data-out="${name}"]`)?.setAttribute("aria-pressed", String(on));
  }
} catch { }

for (const b of document.querySelectorAll(".outputs button")) {
  b.addEventListener("click", () => {
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    const saved = {};
    for (const o of document.querySelectorAll(".outputs button")) saved[o.dataset.out] = o.getAttribute("aria-pressed") === "true";
    try { localStorage.setItem(OUTPUTS_KEY, JSON.stringify(saved)); } catch { }
    applyOutputs();
    if (b.dataset.out === "sound" && sound.enabled) preview();
  });
}

/* sound settings: live while sliding, a short sample on release */
function applySound() {
  sound.setPitch(Number($("#opt-hz").value));
  sound.setVolume(Number($("#opt-vol").value) / 100);
  sound.setKind($("#opt-sound").value);
}

function preview() {
  sound.unlock();
  const t = timingNow();
  sound.mark(0, Math.max(t.unit, 120) / 1000);
}

$("#opt-hz").addEventListener("input", applySound);
$("#opt-vol").addEventListener("input", applySound);
$("#opt-sound").addEventListener("change", () => { applySound(); preview(); });
$("#opt-hz").addEventListener("change", preview);
$("#opt-vol").addEventListener("change", preview);

/* clear history: tap twice (no pop-up dialogs) */
let clearArmed = null;

function clearHistory() {
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    history = [];
    saveHistory();
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

function playable() {
  const words = wordsOf(tokens);
  if (words.length) return { words, rec: recOf(tokens, took), entry: "current" };
  if (history.length) {
    const last = history[history.length - 1];
    return { words: parse(morseOf(last)), rec: recOfEntry(last), entry: history.length - 1 };
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

function playerControls() {
  const can = !!playable();
  $("#play").disabled = !can;
  $("#seek").disabled = !can;
  $("#play").textContent = player.playing ? "❚❚" : "▷";
  $("#play").setAttribute("aria-label", player.playing ? "pause" : "play");
  /* nothing loaded yet: show the length of what would play */
  if (playKey === null && !player.playing) {
    const p = playable();
    const d = p ? timeline(p.words, timingNow(), p.rec).duration : 0;
    $("#seek").max = Math.round(d);
    $("#seek").value = 0;
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
    $("#seek").max = Math.round(player.duration);
    sizeClock(player.duration);
  }
  return true;
}

function togglePlay() {
  sound.unlock();
  if (player.playing) {
    player.pause();
  } else {
    if (!load()) return;
    clearTimeout(endTimer);
    keyer.cancel();
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
  logo.classList.remove("down");
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
  $("#time").textContent = clock(state.position) + "/" + clock(state.duration) + unitOf(state.duration);
  logo.classList.toggle("down", state.down);
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
  drawLocal(state.path);
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
    logo.classList.remove("down");
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
  setRepeat(saved === "1" ? "on" : saved ?? "off");   // "1" = the old on/off setting
} catch { setRepeat("off"); }

/* P plays / pauses (when not typing) */
document.addEventListener("keydown", event => {
  if (event.key !== "p" && event.key !== "P") return;
  if (mode === "type" || event.target.closest?.("input, select, textarea")) return;
  event.preventDefault();
  togglePlay();
});

/* a new speed changes the timeline */
/* a new speed: the player re-times itself and carries on */
for (const id of ["#opt-wpm", "#opt-fwpm"]) {
  $(id).addEventListener("input", () => {
    if (playKey === null) return playerControls();   // nothing loaded: just the new length
    player.retime();
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
  const { words } = share.readPaste(raw);
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
  update();
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
  const p = playable();
  const words = p?.words ?? [];
  for (const b of menu.querySelectorAll("#share-copy button, .saves button, #share-native button")) b.disabled = !words.length;
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

/* close on a tap outside, or Escape */
document.addEventListener("pointerdown", event => {
  if (!menu.hidden && !menu.contains(event.target) && event.target !== $("#share-toggle")) openShare(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !menu.hidden) openShare(false);
});

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
  const p = playable();
  const words = p?.words ?? [];
  switch (b.dataset.do) {
    case "copy-morse": return copy(share.morseText(words), "the Morse");
    case "copy-text":  return copy(share.plainText(words), "the text");
    case "copy-link":  return copy(share.linkTo(words), "the link");
    case "save-txt":
      share.save(share.textFile(words), share.fileName(words, "txt"));
      return note("saved .txt");
    case "save-wav": {
      note("rendering…");
      const blob = await share.renderWav({
        words, rec: p.rec, timing: timingNow(),
        kind: $("#opt-sound").value,
        pitch: Number($("#opt-hz").value),
        volume: Number($("#opt-vol").value) / 100
      });
      share.save(blob, share.fileName(words, "wav"));
      return note("saved .wav");
    }
    case "save-gif": {
      const a = document.createElement("a");
      a.href = share.gifLink(words);
      a.download = share.fileName(words, "gif");
      document.body.append(a);
      a.click();
      a.remove();
      return note("saving .gif");
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
  $("#privacy-info").setAttribute("aria-expanded", String(open));
  if (open) {
    resetPopupClear();
    $("#privacy-pop .close").focus({ preventScroll: true });
  }
}

/* clear history from here too: tap twice, like at the top of the history */
let popupArmed = null;

function resetPopupClear() {
  clearTimeout(popupArmed);
  popupArmed = null;
  const b = $("#privacy-clear");
  const n = history.length;
  b.classList.remove("armed");
  b.disabled = !n;
  b.textContent = n ? `clear history (${n} message${n === 1 ? "" : "s"})` : "no history to clear";
}

$("#privacy-clear").addEventListener("click", () => {
  const b = $("#privacy-clear");
  if (popupArmed) {
    clearTimeout(popupArmed);
    popupArmed = null;
    history = [];
    saveHistory();
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

$("#privacy-info").addEventListener("click", () => openPrivacy($("#privacy-pop").hidden));
$("#privacy-pop .close").addEventListener("click", () => openPrivacy(false));
document.addEventListener("pointerdown", event => {
  if ($("#privacy-pop").hidden || event.target.closest("#privacy-pop, #privacy-info")) return;
  openPrivacy(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#privacy-pop").hidden) openPrivacy(false);
});


/*
 * ============================================================
 * START
 * ============================================================
 */

loadSettings();
applySound();
applyOutputs();
trainView.build();
setKeyMode($("#opt-key").value);

let savedMode = "key";
try { savedMode = localStorage.getItem("dot-dash:tx-mode") ?? "key"; } catch { }
setMode(savedMode === "type" ? "type" : "key", false);

let savedTree = "0";
try { savedTree = localStorage.getItem("dot-dash:tx-tree") ?? "0"; } catch { }
if (savedTree === "1") openTree(true);

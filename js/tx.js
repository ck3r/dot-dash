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

import { DECODE, TREE, encode, parse, format, cost } from "./morse.js";
import { createTree, buildModel } from "./tree.js";
import { createKeyer, timing, MODES } from "./tx-keyer.js";
import { createSound } from "./tx-sound.js";

const $ = s => document.querySelector(s);

const HISTORY_KEY = "dot-dash:tx-history";
const HISTORY_MAX = 25;


/*
 * ============================================================
 * THE MESSAGE
 * ============================================================
 */

let tokens = [];

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

function press(act) {
  const last = tokens[tokens.length - 1];
  switch (act) {
    case ".":
    case "-":
      tokens.push(act);
      break;
    case "letter":
      if (last === "." || last === "-") tokens.push(" ");
      break;
    case "word":
      if (!tokens.length || last === "/") break;
      if (last === " ") tokens[tokens.length - 1] = "/";
      else tokens.push("/");
      break;
    case "undo":
      tokens.pop();
      break;
  }
  update();
}

function send() {
  const words = wordsOf(tokens);
  if (!words.length) return;
  keyer.reset();
  history.push(format(words));
  while (history.length > HISTORY_MAX) history.shift();
  saveHistory();
  tokens = [];
  if (mode === "type") $("#text").value = "";
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

  history.forEach((saved, i) => {
    const li = el("li", "entry past");
    li.append(el("span", "marker", ""));
    const l = line(parse(saved));
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

  /* the current line */
  const { done, word, path, slash } = structure(tokens);
  const li = el("li", "entry current");
  li.append(el("span", "marker", ">"));
  if (!tokens.length) {
    const hint = el("span", "line empty-line");
    hint.append(el("span", "", mode === "type" ? "type below" : "tap dit or dah"), el("span", "caret"));
    li.append(hint);
  } else {
    const words = word.length || path ? [...done, word] : done;
    li.append(line(words, { path, slash, caret: true }));
    const x = el("button", "x", "x");
    x.type = "button";
    x.setAttribute("aria-label", "clear this message");
    x.addEventListener("click", () => {
      tokens = [];
      if (mode === "type") $("#text").value = "";
      update();
    });
    li.append(x);
  }
  tape.append(li);
  settleTape();
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
  const padBottom = parseFloat(getComputedStyle(tape).paddingBottom) || 0;
  cur.style.minHeight = Math.max(0, tape.clientHeight - peek - padBottom) + "px";
  tape.scrollTop = cur.offsetTop - peek;
  fadeTape();
}

/* fade the top edge while there's history above the view */
function fadeTape() {
  const tape = $("#tape");
  tape.classList.toggle("more-above", tape.scrollTop > 2);
}

$("#tape").addEventListener("scroll", fadeTape, { passive: true });

/* tap a past message: it comes back as the current line */
function recall(i) {
  keyer.reset();
  tokens = tokensOf(parse(history[i]));
  if (mode === "type") $("#text").value = plainText(wordsOf(tokens)) ?? "";
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

function drawLocal() {
  const { path } = structure(tokens);
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
const tree = createTree($("#tree"), "vertical");
let lastLetter = null;

let treeOpen = false;

function drawTree() {
  if (!treeOpen) return;
  const { path } = structure(tokens);
  const codes = wordsOf(tokens).flat();
  tree.render(buildModel({ letters: true, extra: codes }), false);
  fitTree();
  settleTape();   /* the field may have widened */
  tree.handle({ type: "start" });
  if (path) tree.handle({ type: "beat", path });
  else if (lastLetter) tree.handle({ type: "letter", path: lastLetter });
}

/*
 * No scrolling: the whole tree is scaled to its half of the
 * field. Measured at a base size, then sized so both its width
 * and height fit (text stays crisp; it's real text, not zoom).
 */
const TREE_BASE = 13;
const TREE_MAX = 18;
const TREE_MIN = 8;    // below this it's unreadable: tiny screens scroll instead

function fitTree() {
  const edge = $(".tree-edge"), box = $("#tree-box"), pre = $("#tree");
  edge.style.width = "";                       // back to half, then measure
  pre.style.fontSize = TREE_BASE + "px";
  const w = pre.scrollWidth, h = pre.scrollHeight;
  if (!w || !h) return;
  const scale = Math.min(box.clientWidth / w, box.clientHeight / h);
  const size = Math.max(TREE_MIN, Math.min(TREE_MAX, Math.floor(TREE_BASE * scale * 10) / 10));
  pre.style.fontSize = size + "px";
  box.classList.toggle("scrolls", pre.scrollHeight > box.clientHeight + 1);

  /* the tree is usually limited by height: hand the spare width
     back to the message */
  const spare = box.clientWidth - pre.scrollWidth;
  if (spare > 8) edge.style.width = (edge.offsetWidth - spare + 8) + "px";
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
    if (treeOpen) fitTree();
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
  drawTape();
  drawStats();
  drawLocal();
  drawTree();
  $("#send").disabled = !wordsOf(tokens).length;
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
  mark: m => press(m),
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
  button.classList.add("pressed");
  sound.unlock();                 // audio may only start inside a press
  const act = button.dataset.act;
  const mark = act === "." || act === "-";

  if (mark && keyMode !== "tap") {
    keyer.down(act);
    return;
  }
  if (mark) tapMark(act);
  else keyer.reset();             // undo / spaces cancel a pending gap
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

  /* the two halves: key held 0…4 units, key up 0…past the word gap */
  const spans = t => ({ on: 4 * t.unit, off: t.wordAt * 1.2 });

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

  build();
  $("#opt-wpm").addEventListener("input", build);
  $("#opt-fwpm").addEventListener("input", build);

  return { show, build };
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
  for (const b of document.querySelectorAll(".input-mode button")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  }
  showInput();
  if (mode === "type") {
    $("#text").value = plainText(wordsOf(tokens)) ?? "";
    if (focus) $("#text").focus();
  }
  try { localStorage.setItem("dot-dash:tx-mode", mode); } catch { }
  update();
}

for (const b of document.querySelectorAll(".input-mode button")) {
  b.addEventListener("click", () => setMode(b.dataset.mode));
}

$("#text").addEventListener("input", () => {
  tokens = tokensOf(encode($("#text").value));
  update();
});

$("#type").addEventListener("submit", event => {
  event.preventDefault();
  send();
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

$("#tray-toggle").addEventListener("click", () => {
  const tray = $("#tray");
  tray.hidden = !tray.hidden;
  $("#tray-toggle").setAttribute("aria-expanded", String(!tray.hidden));
  showInput();
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
$("#clear-history").addEventListener("click", event => {
  const b = event.currentTarget;
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    history = [];
    saveHistory();
    b.textContent = "clear history";
    update();
    return;
  }
  b.textContent = "tap again to clear";
  clearArmed = setTimeout(() => {
    clearArmed = null;
    b.textContent = "clear history";
  }, 3000);
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

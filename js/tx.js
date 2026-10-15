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
  const units = codes.reduce((n, c) => n + cost(c), 0) + 4 * (words.length - 1);
  const seconds = units * 1.2 / Number($("#opt-wpm").value);
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

function keyDown(button) {
  button.classList.add("pressed");
  const act = button.dataset.act;
  if (act === "." || act === "-") logo.classList.add("down");
  press(act);
}

function keyUp(button) {
  button.classList.remove("pressed");
  logo.classList.remove("down");
}

for (const button of document.querySelectorAll("#pad .key")) {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    keyDown(button);
  });
  button.addEventListener("pointerup", () => keyUp(button));
  button.addEventListener("pointercancel", () => keyUp(button));
  button.addEventListener("contextmenu", event => event.preventDefault());
}

/* a hardware keyboard works too:  .  -  space  /  backspace  enter */
const KEYS = { ".": ".", "-": "-", " ": "letter", "/": "word", "Backspace": "undo" };

document.addEventListener("keydown", event => {
  if (mode === "type" || event.target.closest?.("input, select, textarea")) return;
  if (event.key === "Enter") { event.preventDefault(); send(); return; }
  const act = KEYS[event.key];
  if (!act || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (event.repeat) return;
  keyDown(document.querySelector(`#pad .key[data-act="${CSS.escape(act)}"]`));
});

document.addEventListener("keyup", event => {
  const act = KEYS[event.key];
  if (act) keyUp(document.querySelector(`#pad .key[data-act="${CSS.escape(act)}"]`));
});

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
}

$("#tray-toggle").addEventListener("click", () => {
  const tray = $("#tray");
  tray.hidden = !tray.hidden;
  $("#tray-toggle").setAttribute("aria-expanded", String(!tray.hidden));
  showInput();
});

const outputFor = input => document.querySelector(`output[for="${input.id}"]`);

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

for (const b of document.querySelectorAll(".outputs button")) {
  b.addEventListener("click", () => {
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });
}

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

let savedMode = "key";
try { savedMode = localStorage.getItem("dot-dash:tx-mode") ?? "key"; } catch { }
setMode(savedMode === "type" ? "type" : "key", false);

let savedTree = "0";
try { savedTree = localStorage.getItem("dot-dash:tx-tree") ?? "0"; } catch { }
if (savedTree === "1") openTree(true);

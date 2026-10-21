/*
 * ============================================================
 * MAIN — wires the page to the core
 * ============================================================
 *
 *   URL ──► parse ──► words ──┬──► selected character (one only)
 *                             └──► keyer  (favicon, title)
 *                                    │ events
 *                                    └──► trees (path highlight)
 *
 *   tap a node ──┐
 *                ├──► selected ──► its node lit, its card below
 *   a key ───────┘              └► keyer (plays it on the tree)
 *
 * Reference only: typing, keying and sharing a message live on
 * the station (/), so there's no message box here.
 */

import * as morse from "./morse.js";
import * as keyer from "./keyer.js";
import { createTree, buildModel } from "./tree.js";
import { renderCard } from "./overview.js";


const WPM = 20;
const FARNSWORTH_WPM = 20;
const DOT_MS = 1200 / WPM;

const $ = selector => document.querySelector(selector);


function getPayload() {
  const query = location.search;
  return query.startsWith("?/") ? query.slice(2) : "";
}


/*
 * ============================================================
 * TREES
 * ============================================================
 *
 * Both layouts follow the keyer. CSS shows the horizontal
 * one on wide screens and the vertical one on narrow ones.
 *
 * What's in the tree comes from the options (letters;
 * numbers off / standard / cut; symbols; prune) plus
 * whatever the current message and the selected character
 * need, so every one can be traced even with its set off.
 */

const trees = [
  createTree($("#tree-h"), "horizontal"),
  createTree($("#tree-v"), "vertical")
];

let model = null;

function currentModel() {
  return buildModel({
    letters: $("#opt-letters").checked,
    numbers: $("#opt-numbers").value,
    symbols: $("#opt-symbols").checked,
    prune: $("#opt-prune").checked,
    extra: selected ? [...words.flat(), selected] : words.flat()
  });
}

/*
 * size: "auto" = roomy when it fits, compact when it doesn't;
 * "roomy" always roomy (wide trees scroll); "compact" always.
 */
function compactMode() {
  const size = $("#opt-size").value;
  return size === "auto" ? "auto" : size === "compact";
}

/* tree style for the wide tree: "classic" pairs or "branches" */
function treeStyle() {
  return $("#opt-style").value;
}

function drawTrees() {
  const branchy = treeStyle() === "branches";
  trees[0].setLayout(branchy ? "branches" : "horizontal");
  trees[1].setLayout(branchy ? "branchesV" : "vertical");
  model = currentModel();
  trees.forEach(tree => tree.render(model, compactMode()));
  for (const s of document.querySelectorAll(".tree-frame .tree .lbl[data-code]")) {
    if (s.dataset.code) s.dataset.cost = String(morse.cost(s.dataset.code));
    s.classList.toggle("selected", s.dataset.code === selected);
  }
}


/* menus: remembered per browser */
for (const [id, key] of [["#opt-style", "style"], ["#opt-numbers", "numbers"], ["#opt-size", "size"]]) {
  const menu = $(id);
  try {
    const saved = localStorage.getItem("dot-dash:" + key);
    if (saved && [...menu.options].some(o => o.value === saved)) menu.value = saved;
  } catch { /* storage blocked */ }
  menu.addEventListener("change", () => {
    try { localStorage.setItem("dot-dash:" + key, menu.value); } catch { }
    drawTrees();
  });
}

$("#opt-letters").addEventListener("change", drawTrees);
$("#opt-symbols").addEventListener("change", drawTrees);
$("#opt-prune").addEventListener("change", drawTrees);

/* weights: each character's cost in units, beside it in the tree
   (drawn by the CSS from data-cost; it takes no room, so the tree's
   layout doesn't change) */
{
  const box = $("#opt-weights");
  try { box.checked = localStorage.getItem("dot-dash:weights") === "1"; } catch { }
  const apply = () => {
    for (const t of document.querySelectorAll(".tree-frame .tree")) t.classList.toggle("weights", box.checked);
    try { localStorage.setItem("dot-dash:weights", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  apply();
}

/* re-check the fit when the window changes size */
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawTrees, 150);
});

const logo = $(".logo");

keyer.on(event => {
  if (event.type === "key") {
    logo.classList.toggle("down", event.down);   /* header switch keys along */
    return;
  }
  trees.forEach(tree => tree.handle(event));
});

/* Click a node to select it (and play just that character). */
for (const tree of trees) {
  tree.element.addEventListener("click", event => {
    const code = event.target.dataset?.code;
    if (event.target.dataset?.kind === "lbl" && code && !event.target.classList.contains("blank")) {
      select(code);
    }
  });
}


/*
 * ============================================================
 * SELECTED CHARACTER
 * ============================================================
 *
 * One character at a time: its node stays lit in the tree and
 * its card (the same one the station's (i) opens) fills the box
 * under the tree. Nothing chosen yet: "none".
 *
 *   ┌─ selected character ─────────┐
 *   │ A   .-   di-dah              │
 *   │     ·—   dot dash            │
 *   │     …                        │
 *   └──────────────────────────────┘
 */

let selected = null;

function renderSelected() {
  $("#selected-none").hidden = !!selected;
  $("#selected-card").hidden = !selected;
  if (selected) {
    renderCard($("#selected-card"), selected);
    $("#selected-card").scrollLeft = 0;
  }
}

function select(code) {
  selected = code;
  drawTrees();      /* lights it, and grows its branch if the options hide it */
  renderSelected();
  trace(code);
}

/*
 * A character traced: first its whole way lit at once, for a beat,
 * so you see where it's going; then from the root, a step a mark.
 *
 *   ●─.─E─.─I─-─U      the whole way, a beat
 *   ●                  then from the root …
 *   ●─.─E─.─I─-─U      … as it's keyed
 */
const FLASH_MS = 420;   // two of the keyer's units: a glance, not a wait
let flashTimer = null;
function trace(code) {
  clearTimeout(flashTimer);
  keyer.rest();                     // whatever was tracing stops (and clears) first
  trees.forEach(tree => tree.flash(code));
  flashTimer = setTimeout(() => keyer.play([[code]]), FLASH_MS);
}

/* a character in the card: select that one instead (a middle click
   or ⌘/Ctrl-click still opens its page) */
$("#selected-card").addEventListener("click", event => {
  const a = event.target.closest("a[data-code]");
  if (!a || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  select(a.dataset.code);
});

/*
 * A key selects its character: whatever the key types (event.key),
 * so any layout works, and Shift+1 is "!", Shift+7 "&"…
 * Keys with no node in the tree (#, %, space…) do nothing.
 *
 *   "a" ──► A ──► .-     "!" ──► -.-.--     "#" ──► (nothing)
 */
addEventListener("keydown", event => {
  if (event.repeat || event.metaKey) return;
  if (event.ctrlKey && !event.altKey) return;      /* shortcuts (Ctrl+Alt is AltGr: @ on many layouts) */
  if (event.target.closest?.("select, textarea, input:not([type=checkbox])")) return;   /* a menu's own letters */
  if (event.key.length !== 1) return;              /* Enter, Escape, arrows… */
  const code = morse.ENCODE[event.key.toUpperCase()];
  if (!code) return;
  event.preventDefault();                          /* ' and / open quick find in Firefox */
  select(code);
});


/*
 * ============================================================
 * OPTIONS
 * ============================================================
 *
 * Two independent colour systems (see docs/branding.md):
 *   signal    → dot red / dash blue on the path
 *   category  → letters / numbers / symbols in the tree
 *
 * Plus the content switches "letters", "symbols" and
 * "prune" (numbers, tree style and size are menus, above).
 *
 * Remembered per browser; the page works fine without it.
 */

for (const [id, className] of [
  ["#opt-signal", "signal"], ["#opt-category", "category"],
  ["#opt-letters", "letters"], ["#opt-symbols", "symbols"], ["#opt-prune", "prune"]
]) {
  const box = $(id);
  try {
    const saved = localStorage.getItem("dot-dash:" + className);
    if (saved !== null) box.checked = saved === "1";
  } catch { /* storage blocked */ }

  const apply = () => {
    document.body.classList.toggle(className, box.checked);
    try { localStorage.setItem("dot-dash:" + className, box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  apply();
}


/*
 * The all-characters chart is plain text in the HTML (readable
 * without JS); here each mark gets its own span so the chart
 * follows the dot/dash colours too.
 */
for (const code of document.querySelectorAll(".morse-code .code")) {
  const marks = [...code.textContent].map(s => {
    const m = document.createElement("span");
    m.className = s === "." ? "dot" : "dash";
    m.textContent = s;
    return m;
  });
  code.replaceChildren(...marks);
}


function show(next) {
  words = next;

  /* a single character (the station's "about" links) is selected */
  const single = words.length === 1 && words[0].length === 1;
  selected = single ? words[0][0] : null;

  drawTrees();   /* the message may need branches the options hide */
  renderSelected();

  if (selected) trace(selected);
  else keyer.play(words);
}


let words = [];

/*
 * #cut (the transmit page's "cut" link): the tree with cut numbers,
 * for this visit only (the remembered setting is left alone), in view
 */
const cutView = location.hash === "#cut";
if (cutView) $("#opt-numbers").value = "cut";

/*
 * No message (a plain visit to /ref): the tree as it's first met, for
 * this visit only (what's remembered is left alone, for links that
 * carry a message): letters alone, classic, roomy, both colours.
 *
 *              E                 T
 *          I       A       N       M
 *        S   U   R   W   D   K   G   O        nothing traced yet
 */
if (!getPayload() && !cutView) {
  const FIRST = {
    "#opt-letters": true, "#opt-symbols": false, "#opt-prune": false, "#opt-weights": false,
    "#opt-signal": true, "#opt-category": true,
    "#opt-numbers": "off", "#opt-style": "classic", "#opt-size": "roomy"
  };
  for (const [id, value] of Object.entries(FIRST)) {
    const input = $(id);
    if (typeof value === "boolean") input.checked = value;
    else input.value = value;
  }
  /* what the boxes switch on the page, without remembering it */
  for (const name of ["signal", "category", "letters", "symbols", "prune"]) document.body.classList.toggle(name, $("#opt-" + name).checked);
  for (const t of document.querySelectorAll(".tree-frame .tree")) t.classList.remove("weights");
}

show(morse.parse(getPayload()));

if (cutView) requestAnimationFrame(() => $(".tree-frame").scrollIntoView({ block: "start" }));


/* installable, and usable offline (see /sw.js) */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { }));
}

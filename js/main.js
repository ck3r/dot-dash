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
import { renderCard, renderTile } from "./overview.js";
import { STROKES, CUT_STROKES, createLetter } from "./strokes.js";


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
 * Both layouts follow the keyer; the layout menu shows one
 * (horizontal by default, even on a phone: it scrolls sideways,
 * and starts centred on the root).
 *
 * What's in the tree comes from the options (letters;
 * numbers off / standard / cut; symbols; prune) plus
 * whatever the current message and the selected character
 * need, so every one can be traced even with its set off.
 */

const trees = [
  createTree($("#tree-h"), "horizontal", { follow: true }),   // wider than the frame: the trace keeps in view
  createTree($("#tree-v"), "vertical", { follow: true })
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
    s.classList.toggle("selected", s.dataset.code === selected);
  }
  $(".tree-frame").dataset.layout = $("#opt-layout").value;
}

/* the wide tree, wider than the frame: scrolled so its root is in
   the middle (on load, and when the layout or the tree changes) */
function centreTree() {
  const t = $("#tree-h");
  t.scrollLeft = (t.scrollWidth - t.clientWidth) / 2;
}


/* menus: remembered per browser */
for (const [id, key] of [["#opt-style", "style"], ["#opt-numbers", "numbers"], ["#opt-size", "size"], ["#opt-layout", "layout"]]) {
  const menu = $(id);
  try {
    const saved = localStorage.getItem("dot-dash:" + key);
    if (saved && [...menu.options].some(o => o.value === saved)) menu.value = saved;
  } catch { /* storage blocked */ }
  menu.addEventListener("change", () => {
    try { localStorage.setItem("dot-dash:" + key, menu.value); } catch { }
    drawTrees();
    centreTree();
  });
}

for (const id of ["#opt-letters", "#opt-symbols", "#opt-prune"]) {
  $(id).addEventListener("change", () => { drawTrees(); centreTree(); });
}

/* re-check the fit when the window changes size */
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawTrees, 150);
});

/* the switch on the tree frame keys along, the frame lit while it's closed */
const logo = $(".tree-frame .switch");
const treeFrame = $(".tree-frame");

keyer.on(event => {
  if (event.type === "key") {
    logo.classList.toggle("down", event.down);
    treeFrame.classList.toggle("lit", event.down);
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
  $("#selected-label").textContent = selected ? `about ${selected === morse.NAME_CODE ? "dot-da.sh" : morse.DECODE[selected] ?? selected}` : "selected character";
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
 * One colour system: signal, dot red and dash blue, on the path and
 * wherever marks are drawn (character colours, by letter / number /
 * symbol, went: they read as dots and dashes).
 *
 * Plus the content switches "letters", "symbols" and "prune"
 * (numbers, layout, style and size are menus, above).
 *
 * Remembered per browser; the page works fine without it.
 */

for (const [id, className] of [
  ["#opt-signal", "signal"],
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
    if (s === " ") return document.createTextNode(" ");   // between a word's letters
    const m = document.createElement("span");
    m.className = s === "." ? "dot" : "dash";
    m.textContent = s;
    return m;
  });
  code.replaceChildren(...marks);
}

/*
 * Stroke letters (js/strokes.js): each letter and number drawn by
 * the marks that spell it, finished. The plain character stays in
 * its label, only hidden, so it's still what's read aloud, found and
 * copied; the drawing is the same size as the line, so nothing moves.
 * The symbols have no drawings yet and stay as they are. Remembered.
 *
 *   .-      A  N      -.          .-     /\  |\ |     -.
 *   -...    B  O     ---    ──►   -...   |3  ( )     ---
 */
{
  const box = $("#opt-strokes");
  const labels = document.querySelectorAll(".morse-letters .label, .morse-numbers .label");
  try { box.checked = localStorage.getItem("dot-dash:strokes") === "1"; } catch { /* storage blocked */ }

  /* drawn the first time they're wanted, then only shown or hidden */
  let drawn = false;
  const drawing = (strokes, code, cls) => {
    const letter = createLetter(strokes, [...code].map((mark, i) => ({ mark, start: i, end: i + 1 })));
    letter.at(Infinity);
    if (cls) letter.el.classList.add(cls);
    return letter.el;
  };
  /* a number has its cut form too, shown with cut on (CSS):
       0  ⬭ of five dahs   →   cut, one dah */
  const draw = () => {
    for (const label of labels) {
      const char = label.textContent;
      const cut = CUT_STROKES[char] && morse.codeOf(char, { cut: true }) !== morse.ENCODE[char];
      label.replaceChildren(Object.assign(document.createElement("span"), { textContent: char }),
        drawing(STROKES[char], morse.ENCODE[char], cut ? "full-form" : ""),
        ...(cut ? [drawing(CUT_STROKES[char], morse.codeOf(char, { cut: true }), "cut-form")] : []));
    }
    drawn = true;
  };

  const apply = () => {
    if (box.checked && !drawn) draw();
    $(".morse-code").classList.toggle("strokes", box.checked);
    try { localStorage.setItem("dot-dash:strokes", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  apply();
}

/*
 * Cut numbers, on the chart: each digit's marks that the cut drops
 * greyed (1–5 keep their start, 6–0 their end), and the letter it's
 * sent as at the outside of its code. 4 and 6 aren't cut. The room
 * for the letters is always kept, so nothing moves. Remembered; a
 * #cut visit (the station's "cut" link) has it on, for that visit.
 *
 *   A  .----   Wun   1        6  Six    -....
 *   …                         …
 *   E  .....   Fife  5        0  Zero   -----  T
 */
{
  const box = $("#opt-chart-cut");
  for (const code of document.querySelectorAll(".morse-numbers .code")) {
    const full = [...code.querySelectorAll(".dot, .dash")].map(s => s.textContent).join("");
    const digit = morse.DECODE[full];
    const cut = Object.keys(morse.CUT).find(k => morse.CUT[k] === digit && k !== full);
    const keep = cut ? cut.length : full.length;
    const early = Number(digit) >= 1 && Number(digit) <= 5;
    [...code.querySelectorAll(".dot, .dash")].forEach((m, i) => {
      if (!(early ? i < keep : i >= full.length - keep)) m.classList.add("gone");
    });
    const as = document.createElement("span");
    as.className = "cut-as";
    as.textContent = cut ? morse.DECODE[cut] : "";
    if (cut) as.title = `${digit} cut: ${morse.DECODE[cut]}`;
    if (code.closest(".col-left")) code.before(as);
    else code.after(as);
  }
  try { box.checked = localStorage.getItem("dot-dash:chart-cut") === "1"; } catch { }
  if (location.hash === "#cut") box.checked = true;
  const apply = remember => {
    $(".morse-code").classList.toggle("cut", box.checked);
    if (remember) try { localStorage.setItem("dot-dash:chart-cut", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", () => apply(true));
  apply(false);
}

/*
 * The lists (prosigns, Q codes, abbreviations): in order A–Z, or as
 * a contact goes (CQ, DE, K … 73, SK), each row carrying its place in
 * both (data-az, data-flow). A Q code's question shares its answer's
 * place and follows it; "?" shows the questions instead of the
 * answers, in the same rows' room, so nothing moves:
 *
 *   --.- - ....           QTH      my location is …
 *   --.- - .... ..--..    QTH?     what is your location?     (?)
 *
 * Remembered.
 */
{
  const order = $("#opt-order"), ask = $("#opt-ask");
  /* every Q code ends in a "?" slot, the answer's unseen, so the
     centred letters sit in the same place both ways: QRL·  QRL? */
  for (const label of document.querySelectorAll('.lists[data-list="q-codes"] .label')) {
    const asking = label.textContent.endsWith("?");
    const q = Object.assign(document.createElement("span"), { className: asking ? "q" : "q unseen", textContent: "?" });
    label.replaceChildren(label.textContent.replace(/\?$/, ""), q);
  }
  try {
    if (localStorage.getItem("dot-dash:list-order") === "flow") order.value = "flow";
    ask.checked = localStorage.getItem("dot-dash:list-ask") === "1";
  } catch { /* storage blocked */ }
  const apply = () => {
    const key = order.value === "flow" ? "flow" : "az";
    const asks = li => li.hasAttribute("data-ask") ? 1 : 0;
    const by = (a, b) => a.dataset[key] - b.dataset[key] || asks(a) - asks(b);
    for (const list of document.querySelectorAll(".morse-code .lists")) list.append(...[...list.children].sort(by));
    $(".morse-code").dataset.q = ask.checked ? "ask" : "answer";
    try {
      localStorage.setItem("dot-dash:list-order", key);
      localStorage.setItem("dot-dash:list-ask", ask.checked ? "1" : "0");
    } catch { }
  };
  order.addEventListener("change", apply);
  ask.addEventListener("change", apply);
  apply();
}

/*
 * Prosigns as bar notation ("bar"): each label's brackets and its
 * letters apart, so the brackets can go (unseen, their room kept)
 * and the letters take a bar over them. Remembered.
 *
 *   <span class="label pro"><AR></span>
 *     → <span class="br"><</span><span class="pro-letters">AR</span><span class="br">></span>
 */
{
  const box = $("#opt-bar");
  for (const label of document.querySelectorAll(".morse-code .label.pro")) {
    const letters = label.textContent.replace(/^<|>$/g, "");
    const br = t => Object.assign(document.createElement("span"), { className: "br", textContent: t });
    label.replaceChildren(br("<"), Object.assign(document.createElement("span"), { className: "pro-letters", textContent: letters }), br(">"));
  }
  try { box.checked = localStorage.getItem("dot-dash:list-bar") === "1"; } catch { }
  const apply = () => {
    $(".morse-code").classList.toggle("bar", box.checked);
    try { localStorage.setItem("dot-dash:list-bar", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  apply();
}

/*
 * Cards: the letters, numbers, symbols and prosigns each as its tile
 * (the about card's, js/overview.js), in a grid where the lists were;
 * each still the same link. Drawn by their strokes with stroke on,
 * the numbers as cut with cut on; the prosigns in the lists' order. The lists stay, only hidden.
 * The word above the box says what a tile shows (a popup). Remembered.
 *
 *              cards
 *               [x]
 *   ┌char──.-┐ ┌char-...┐ ┌char-.-.┐
 *   │   A    │ │   B    │ │   C    │ …
 */
{
  const box = $("#opt-cards");
  const groups = [".morse-letters", ".morse-numbers", ".morse-symbols", '.lists[data-list="prosigns"]'].map(s => $(s));
  const grids = groups.map(group => {
    const grid = Object.assign(document.createElement("ul"), { className: "tile-grid" });
    group.after(grid);
    return grid;
  });
  const draw = () => {
    if (!box.checked) return;
    groups.forEach((group, g) => {
      grids[g].replaceChildren(...[...group.querySelectorAll("a")].map(link => {
        const name = link.querySelector(".label").textContent;
        /* with cut on, a number as it's sent cut (4 and 6 have no cut) */
        const cut = g === 1 && $("#opt-chart-cut").checked && morse.codeOf(name, { cut: true }) !== morse.ENCODE[name];
        const code = cut ? morse.codeOf(name, { cut: true }) : link.getAttribute("href").replace("/ref/?/", "");
        const { el, letter } = renderTile(code, { name, strokes: $("#opt-strokes").checked, cut });
        letter?.at(Infinity);
        const a = Object.assign(document.createElement("a"), { href: link.href });
        a.setAttribute("aria-label", `${name} ${code}`);
        a.append(el);
        const li = document.createElement("li");
        li.append(a);
        return li;
      }));
    });
  };
  try { box.checked = localStorage.getItem("dot-dash:list-cards") === "1"; } catch { }
  const apply = () => {
    $(".morse-code").classList.toggle("cards", box.checked);
    draw();
    try { localStorage.setItem("dot-dash:list-cards", box.checked ? "1" : "0"); } catch { }
  };
  box.addEventListener("change", apply);
  for (const id of ["#opt-strokes", "#opt-order", "#opt-chart-cut"]) $(id).addEventListener("change", draw);
  apply();

  const pop = $("#cards-pop");
  $("#cards-info").addEventListener("click", () => pop.showModal());
  pop.querySelector(".close").addEventListener("click", () => pop.close());
  pop.addEventListener("click", event => { if (event.target === pop) pop.close(); });   // the backdrop
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
 * carry a message): letters alone, classic, roomy, dot/dash colours.
 * (The layout is yours: it stays as you left it.)
 *
 *              E                 T
 *          I       A       N       M
 *        S   U   R   W   D   K   G   O        nothing traced yet
 */
if (!getPayload() && !cutView) {
  const FIRST = {
    "#opt-letters": true, "#opt-symbols": false, "#opt-prune": false,
    "#opt-signal": true,
    "#opt-numbers": "off", "#opt-style": "classic", "#opt-size": "roomy"
  };
  for (const [id, value] of Object.entries(FIRST)) {
    const input = $(id);
    if (typeof value === "boolean") input.checked = value;
    else input.value = value;
  }
  /* what the boxes switch on the page, without remembering it */
  for (const name of ["signal", "letters", "symbols", "prune"]) document.body.classList.toggle(name, $("#opt-" + name).checked);
}

show(morse.parse(getPayload()));
centreTree();

if (cutView) requestAnimationFrame(() => $(".tree-frame").scrollIntoView({ block: "start" }));


/* installable, and usable offline (see /sw.js) */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { }));
}

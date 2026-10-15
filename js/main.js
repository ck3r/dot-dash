/*
 * ============================================================
 * MAIN — wires the page to the core
 * ============================================================
 *
 *   URL ──► parse ──► words ──┬──► page   (message, about)
 *                             └──► keyer  (favicon, title)
 *                                    │ events
 *                                    └──► trees (path highlight)
 *
 *   input ──► encode/parse ──► [share] ──► canonical URL
 */

import * as morse from "./morse.js";
import * as keyer from "./keyer.js";
import { createTree, buildModel } from "./tree.js";
import { renderOverview } from "./overview.js";
import { createMessage } from "./message.js";


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
 * whatever the current message needs, so every message can
 * be traced even with its set switched off.
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
    extra: words.flat()
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
  updateStatus();
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

/* re-check the fit when the window changes size */
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawTrees, 150);
});

const message = createMessage($("#message"));

/* the message only follows playback of the whole message,
   not a single character clicked in the tree */
let followMessage = true;

const logo = $(".logo");

keyer.on(event => {
  if (event.type === "key") {
    logo.classList.toggle("down", event.down);   /* header switch keys along */
    return;
  }
  trees.forEach(tree => tree.handle(event));
  if (followMessage) message.handle(event);
});

function playMessage() {
  followMessage = true;
  keyer.play(words);
}

/* Click a node to play just that character. */
for (const tree of trees) {
  tree.element.addEventListener("click", event => {
    const code = event.target.dataset?.code;
    if (event.target.dataset?.kind === "lbl" && code && !event.target.classList.contains("blank")) {
      followMessage = false;
      message.reset();
      keyer.play([[code]]);
    }
  });
}


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
  message.render(words);
  $("#message").hidden = words.length === 0;
  $("#empty").hidden = words.length !== 0;

  drawTrees();   /* the message may need branches the options hide */

  $("#replay").hidden = words.length === 0;

  /* a single character gets the full overview */
  const single = words.length === 1 && words[0].length === 1;
  $("#overview-frame").hidden = !single;
  if (single) {
    $("#overview-label").textContent = `about ${morse.decode(words)}`;
    renderOverview($("#overview"), words[0][0]);
  }

  playMessage();

  updateStatus();
}


let words = [];

function updateStatus() {
  const k = keyer.stats();
  $("#status").textContent =
    `URL:          ${getPayload()}\n` +
    `Canonical:    ${morse.format(words)}\n` +
    `Text:         ${morse.decode(words)}\n` +
    `WPM:          ${WPM}\n` +
    `Farnsworth:   ${FARNSWORTH_WPM}\n` +
    `Dot:          ${DOT_MS}ms\n` +
    `Tab:          ${k.tab}\n` +
    `Reduced:      ${k.reducedMotion}\n` +
    `Title frames: ${k.titleFrames}\n` +
    `Keyer events: ${k.keyerEvents}\n` +
    `Tree:         ${model ? `${model.size} nodes, depth ${model.depth}` : "-"}\n` +
    `Compact:      wide ${$("#tree-h").dataset.compact}, tall ${$("#tree-v").dataset.compact} (size: ${$("#opt-size").value})\n` +
    `Tree style:   ${treeStyle()}`;
}


/*
 * ============================================================
 * SHARE
 * ============================================================
 *
 * The URL only changes when the user asks for it.
 * Accepts plain text ("hello world") or Morse
 * (".... . / .--" , "...._._/_.--" or "...././/.--").
 */

$("#compose").addEventListener("submit", async event => {
  event.preventDefault();

  const input = $("#input").value;
  if (!input.trim()) return;

  const words = morse.looksLikeMorse(input)
    ? morse.parse(input.trim().replace(/\s*\/\s*/g, "_/_"))
    : morse.encode(input);

  if (!words.length) return;

  const url = `${location.origin}/?/${morse.format(words)}`;

  history.pushState(null, "", url);
  show(words);

  $("#link").textContent = url;
  $("#input").value = "";

  try {
    await navigator.clipboard.writeText(url);
    $("#link").textContent = `link copied  ${url}`;
  } catch {
    /* clipboard blocked: the link is still shown */
  }
});

window.addEventListener("popstate", () => show(morse.parse(getPayload())));


/*
 * ============================================================
 * REPLAY
 * ============================================================
 *
 * Plays the current message again from the start: tree,
 * favicon and title together. Also undoes a node click
 * (which plays a single character).
 */

$("#replay").addEventListener("click", () => {
  playMessage();
  updateStatus();
});


show(morse.parse(getPayload()));

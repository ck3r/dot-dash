/*
 * The "coin" layout of the reference's tree: the grid tree, as a coin
 * or a panel draws it (and the watch app: js/shared/grid-tree.js
 * gridOf), every step along or down. Dots run left from the root,
 * dashes right; a step that repeats its side's first mark goes on
 * outward, the other turns down. Each step carries its mark.
 *
 *      H ─·─ S ─·─ I ─·─ E ─·─ ● ─━─ T ─━─ M ─━─ O
 *      ┃           ┃                 ·     ·
 *      V     …     A                 N     G
 *
 * The same face as the text trees (core/tree.js createTree), so the
 * page drives all three alike:
 *
 *   createCoinTree(box) → {
 *     render(model)     the model's characters (buildModel), drawn
 *     handle(event)     the keyer's trace: start, beat, letter, word, end
 *     flash(code)       its whole way lit, a glance before it's traced
 *     setLayout(), setFollow()   (nothing to change: it always fits)
 *     element           the box (a tap on a character: .lbl[data-code])
 *   }
 *
 * At rest everything is paper; tracing (.live) the rest dims and the
 * way lights, in the dot and dash colours with colour on; the
 * character landed, or selected, sits on a paper patch.
 */
import { gridOf } from "../shared/grid-tree.js";

const NS = "http://www.w3.org/2000/svg";
const SX = 30, SY = 30, PAD = 16, R = 10;   // a step across, a step down, the margin, a place's disc

function node(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.append(el);
  return el;
}

export function createCoinTree(element) {
  let svg = null, current = "", landed = null;

  /* every code the model shows, the root's children outward */
  function codesOf(model) {
    const out = [], queue = [""];
    while (queue.length) {
      const code = queue.shift();
      for (const next of [code + ".", code + "-"]) {
        if (next.length <= model.depth && model.has(next)) { out.push(next); queue.push(next); }
      }
    }
    return out;
  }

  function render(model) {
    const codes = codesOf(model);
    const at = gridOf(codes);
    const xs = [...at.values()].map(([x]) => x), ys = [...at.values()].map(([, y]) => y);
    const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs), maxY = Math.max(0, ...ys);
    const w = (maxX - minX) * SX + 2 * PAD, h = maxY * SY + 2 * PAD;
    const xy = code => { const [x, y] = at.get(code); return [PAD + (x - minX) * SX, PAD + y * SY]; };

    svg = node("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: "img", "aria-label": element.getAttribute("aria-label") ?? "" });
    /* the steps first, the places over them */
    for (const code of codes) {
      let [x0, y0] = xy(code.slice(0, -1));
      const [x1, y1] = xy(code);
      const m = code.at(-1), side = m === "." ? "dot" : "dash", mx = (x0 + x1) / 2, my = (y0 + y1) / 2, level = y0 === y1;
      const g = node("g", { class: `step ${side}`, "data-step": code }, svg);
      node("path", { d: `M${x0} ${y0} L${x1} ${y1}`, class: "line" }, g);
      if (m === ".") node("circle", { cx: mx, cy: my, r: 2.2, class: "mark" }, g);
      else node("rect", level ? { x: mx - 5, y: my - 1.4, width: 10, height: 2.8, class: "mark" } : { x: mx - 1.4, y: my - 5, width: 2.8, height: 10, class: "mark" }, g);
    }
    for (const code of codes) {
      const [x, y] = xy(code);
      const { ch, cat, reveal } = model.label(code);
      const blank = cat === "blank";
      const g = node("g", { class: `lbl ${code[0] === "." ? "dot" : "dash"}${blank ? " blank" : ""}`, "data-code": code, "data-kind": "lbl" }, svg);
      /* an empty place (the text trees' "_"): a small ring, so its step ends somewhere */
      if (blank && !reveal) { node("circle", { cx: x, cy: y, r: 5, class: "disc" }, g); node("circle", { cx: x, cy: y, r: 2.5, class: "stub" }, g); continue; }
      node("circle", { cx: x, cy: y, r: R, class: "disc" }, g);
      const t = node("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central" }, g);
      t.textContent = blank ? "·" : ch;
      if (reveal) g.dataset.reveal = reveal;
    }
    const [rx, ry] = xy("");
    node("circle", { cx: rx, cy: ry, r: 5, class: "root" }, svg);
    element.replaceChildren(svg);
    show(current, false);
    land(landed);
  }

  /* the way to `path` lit, step by step (`live`: the rest dimmed) */
  function show(path, live = true) {
    current = path;
    element.classList.toggle("live", live && !!path);
    if (!svg) return;
    for (const el of svg.querySelectorAll("[data-step]")) el.classList.toggle("on", !!path && path.startsWith(el.dataset.step));
    for (const el of svg.querySelectorAll(".lbl")) {
      const on = !!path && path.startsWith(el.dataset.code);
      el.classList.toggle("on", on);
      /* a hidden character (*) shows itself only while it's lit */
      if (el.dataset.reveal) el.querySelector("text").textContent = on ? el.dataset.reveal : "·";
    }
    svg.querySelector(".root").classList.toggle("on", !!path);
  }

  function land(path) {
    landed = path;
    if (!svg) return;
    for (const el of svg.querySelectorAll(".lbl")) el.classList.toggle("landed", !!path && el.dataset.code === path);
  }

  function handle(event) {
    switch (event.type) {
      case "start":  land(null); show("", false); element.classList.add("live"); break;
      case "beat":   land(null); show(event.path); break;
      case "letter": land(event.path); break;
      case "word":   show("", false); break;
      case "end":    show(event.path ?? current, false); land(event.path ?? null); break;
    }
  }

  function flash(code) {
    show(code, false);
    land(code);
  }

  /* the root in the middle of the box, when it's wider than the box */
  function centre() {
    const root = svg?.querySelector(".root");
    if (!root || element.scrollWidth <= element.clientWidth + 1) return;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    element.scrollLeft = root.cx.baseVal.value * scale - element.clientWidth / 2;
  }

  return { render, handle, flash, centre, setLayout() { }, setFollow() { }, element };
}

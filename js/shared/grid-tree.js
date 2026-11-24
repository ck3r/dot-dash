/*
 * The grid tree, as on a panel or a coin: every step along or down.
 * The dot side runs left from the root, the dash side right, as the
 * paddles sit (the dit on the left); a step that repeats the side's
 * first mark goes on outward, the other turns down. A branch that
 * turns down starts below everything the outward branch needs, so
 * nothing crosses:
 *
 *      H ─ S ─ I ─ E ─ (o) ━ T ━ M ━ O
 *      ━   ━   ━              ·   ·
 *      V   U   A  ...         N   G ━ Q
 *              ·              ...  ·
 *          L ─ R                   Z
 *              ━
 *          P ─ W
 *              ━
 *              J
 *
 * The watch app's tree (js/design/watch-app.js, drawGrid) and the
 * reference's "coin" layout (js/ref/grid-tree.js, gridOf) both.
 *
 * gridOf(codes)   every code (and its prefixes) to its [column, row]:
 *                 columns - to the left (dots), + to the right
 *                 (dashes), rows down
 * drawGrid(svg, { codes, labels, path, ... })
 *                 the tree into an svg, the path (a code) lit; hands
 *                 back each code's place on screen, for a tap
 */
const NS = "http://www.w3.org/2000/svg";

function node(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.append(el);
  return el;
}

export function gridOf(codes) {
  const has = new Set();
  for (const c of codes) for (let k = 1; k <= c.length; k++) has.add(c.slice(0, k));
  const at = new Map([["", [0, 0]]]);
  /* place a code and what hangs from it; hand back the rows it took */
  const place = (code, x, y, dir) => {
    at.set(code, [x, y]);
    const along = code + code[0], down = code + (code[0] === "." ? "-" : ".");
    let rows = has.has(along) ? place(along, x + dir, y, dir) : 1;
    if (has.has(down)) rows += place(down, x, y + rows, dir);
    return rows;
  };
  if (has.has(".")) place(".", -1, 0, -1);
  if (has.has("-")) place("-", 1, 0, 1);
  return at;
}

export function drawGrid(svg, { codes, labels = {}, path = "", size = 240, sx = 22, sy = 24, top = 46, rootR = 8 }) {
  const at = gridOf(codes), c = size / 2;
  const xy = code => { const [x, y] = at.get(code); return [c + x * sx, top + y * sy]; };
  const lit = code => code && path.startsWith(code);
  const places = new Map();
  /* the steps: the faint ones first, the lit path over them */
  const steps = [...at.keys()].filter(Boolean).sort((a, b) => lit(a) - lit(b));
  for (const code of steps) {
    let [x0, y0] = xy(code.slice(0, -1));
    const [x1, y1] = xy(code);
    if (code.length === 1) x0 += Math.sign(x1 - x0) * rootR;
    const on = lit(code), m = code.at(-1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, level = y0 === y1;
    const g = node("g", { class: on ? "step on" : "step" }, svg);
    node("path", { d: `M${x0} ${y0} L${x1} ${y1}`, class: "line" }, g);
    if (m === ".") node("circle", { cx: mx, cy: my, r: on ? 2.6 : 2, class: "mark dot" }, g);
    else node("rect", level ? { x: mx - 4.5, y: my - 1.3, width: 9, height: 2.6, class: "mark dash" } : { x: mx - 1.3, y: my - 4.5, width: 2.6, height: 9, class: "mark dash" }, g);
  }
  /* the places: a letter on a disc of the screen's colour, so the
     lines stop short of it; where the path ends, ringed in brass */
  for (const code of at.keys()) {
    if (!code) continue;
    const [x, y] = xy(code);
    const g = node("g", { class: `place${lit(code) ? " on" : ""}${code === path ? " here" : ""}`, "data-code": code }, svg);
    node("circle", { cx: x, cy: y, r: 7 }, g);
    const t = node("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central" }, g);
    t.textContent = labels[code] ?? "";
    places.set(code, [x, y]);
  }
  node("circle", { cx: c, cy: top, r: rootR, class: `root${path ? "" : " here"}` }, svg);
  return places;
}

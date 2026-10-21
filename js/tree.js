/*
 * ============================================================
 * TREE — ASCII Morse trees, generated from TREE
 * ============================================================
 *
 * Two layouts of the same data:
 *
 *   horizontal (dot left, dash right)     vertical (dot up, dash down)
 *
 *             .E│T-                             .I│
 *        ┌──────┴──────┐                     ┌──┤
 *      .I│A-         .N│M-                   │-A│
 *                                          .E│
 *                                          ──┤
 *                                          -T│
 *
 * Every character on screen belongs to something:
 *
 *   mark  the "." or "-" beside a character
 *   lbl   the character itself
 *   stem  its stub     "│" beside a label   (vertical only)
 *   arm   a branch     "┌───"  "───┐"       leads from a node to its children
 *   bar   a junction   "│"  "┤"             where a node's children meet
 *   jct   the "┴" under a pair              (horizontal only)
 *
 * so lighting up a path is just switching classes on spans.
 *
 * Only the current character lights up; the branches and
 * the marks along the way show how it got there, so the
 * code reads straight off the path (.-. → R). A junction takes the colour of the step
 * taken out of it, so every step is one unbroken colour:
 *
 *        .E│T-            path .-  (A)
 *    ┌─────┴─────┐        red:  E's branch, the ┴ under the root
 *  .I│A-                  blue: the │ between I and A, then A
 */

import { TREE, CUT } from "./morse.js";
export { CUT };   // (it used to live here)


const BLANK = "_";    // nothing lives here
const HIDDEN = "*";   // something lives here, but its set is switched off


/* (cut numbers, CUT: in morse.js, shared with the about column) */


/*
 * ============================================================
 * CODES
 * ============================================================
 */

function codeOf(index, depth) {
  if (depth === 0) return "";
  return index
    .toString(2)
    .padStart(depth, "0")
    .replaceAll("0", ".")
    .replaceAll("1", "-");
}

function treeChar(code) {
  const row = TREE[code.length - 1];
  if (!row) return null;
  const char = row[parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2)];
  return char && char !== "*" ? char : null;
}

function categoryOf(char) {
  if (char === BLANK || char === HIDDEN) return "blank";
  if (/[A-Z]/.test(char)) return "ltr";
  if (/[0-9]/.test(char)) return "num";
  return "sym";
}

const sideOf = code =>
  code === "" ? "root" : code.endsWith("-") ? "dash" : "dot";


/*
 * ============================================================
 * MODEL — which nodes are drawn, and what each one says
 * ============================================================
 *
 * Every node is one of:
 *
 *   shown        its set is on (or the message needs it)  → A
 *   waypoint     on the way to something shown            → * or _
 *   stub         an unused / hidden slot next to the path → * or _
 *                (only when prune is off)
 *   (pruned)     not drawn
 *
 *   _  nothing lives here       *  something does, but its set is off
 *
 * options:
 *   letters  true | false
 *   numbers  "off" | "on" | "cut"
 *   symbols  true | false
 *   prune    true | false     drop slots with nothing below them
 *   extra    codes the current message needs: their branches are
 *            always drawn, but a character whose set is off
 *            still shows as * (it's only revealed while the
 *            animation is on it — see `reveal` below)
 */

export function buildModel({ letters = true, numbers = "off", symbols = false, prune = false, extra = [] } = {}) {
  const shown = new Map();   // code → character to display

  TREE.forEach((row, depth) => {
    [...row].forEach((char, index) => {
      if (char === "*") return;
      const cat = categoryOf(char);
      const on = (cat === "ltr" && letters)
        || (cat === "num" && numbers === "on")
        || (cat === "sym" && symbols);
      if (on) shown.set(codeOf(index, depth + 1), char);
    });
  });

  if (numbers === "cut") {
    for (const [code, digit] of Object.entries(CUT)) shown.set(code, digit);
  }

  /* how deep the chosen sets reach (stubs never go deeper; $ excluded) */
  const reach = Math.min(6, Math.max(0, ...[...shown.keys()].map(c => c.length)));

  /* shown nodes, the message's nodes, and everything on the way to them */
  const onPath = new Set([""]);
  for (const code of [...shown.keys(), ...extra]) {
    for (let i = 1; i <= code.length; i++) onPath.add(code.slice(0, i));
  }

  const visible = new Set(onPath);
  if (!prune) {
    for (const code of onPath) {
      for (const child of [code + ".", code + "-"]) {
        if (child.length <= reach) visible.add(child);
      }
    }
  }

  const depth = Math.max(...[...visible].map(c => c.length));

  return {
    has: code => visible.has(code),
    /*
     * ch      what the node shows at rest
     * reveal  the real character behind a *, shown only while
     *         the animation is on this node
     */
    label(code) {
      if (shown.has(code)) {
        const ch = shown.get(code);
        return { ch, cat: categoryOf(ch), reveal: null };
      }
      const real = treeChar(code);
      return real
        ? { ch: HIDDEN, cat: "blank", reveal: real }
        : { ch: BLANK, cat: "blank", reveal: null };
    },
    depth,
    size: visible.size
  };
}


/*
 * ============================================================
 * GRID
 * ============================================================
 *
 * A grid is rows of cells: null (space) or
 * { ch, kind, code, side, cat }.
 */

function grid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

function label(model, code) {
  const { ch, cat, reveal } = model.label(code);
  return { kind: "lbl", code, side: sideOf(code), cat, ch, reveal };
}

function part(kind, code) {
  return { kind, code, side: sideOf(code) };
}

function put(g, y, x, ch, owner) {
  if (y < 0 || y >= g.length || x < 0 || x >= g[0].length) return;
  g[y][x] = { ...owner, ch };
}


/*
 * ============================================================
 * PLACEMENT
 * ============================================================
 *
 * Positions along one axis, for any set of visible nodes.
 * `isUnit(code)` says whether a code is drawn as a unit.
 * Units with no unit children take the next slot; parents
 * sit midway between their children. A unit with only one
 * child keeps an empty slot on the other side, so dot stays
 * left (up) and dash stays right (down).
 */

function place(isUnit, pitch, offset) {
  const pos = new Map();
  let slot = 0;
  const next = () => offset + pitch * slot++;

  function visit(code) {
    const hasDot = isUnit(code + ".");
    const hasDash = isUnit(code + "-");
    let p;
    if (!hasDot && !hasDash) {
      p = next();
    } else {
      const a = hasDot ? visit(code + ".") : next();
      const b = hasDash ? visit(code + "-") : next();
      p = Math.floor((a + b) / 2);
    }
    pos.set(code, p);
    return p;
  }

  visit("");
  return { pos, size: offset + pitch * (slot - 1) + 1 + offset };
}

/* a junction that only goes one way */
function fork(both, dotOnly, dashOnly, hasDot, hasDash) {
  return hasDot && hasDash ? both : hasDot ? dotOnly : dashOnly;
}


/*
 * ============================================================
 * CLASSIC — pairs  .E│T-
 * ============================================================
 *
 * Each pair shows a node's two children. Roomy: bottom pairs
 * 6 columns apart. Compact: marks move onto the branch row,
 * 4 apart.
 *
 *                .E│T-                    E│T
 *          ┌───────┴───────┐       ┌─────.┴-─────┐
 *        .I│A-           .N│M-    I│A           N│M
 */

const pairUnit = model => code =>
  model.has(code) && (model.has(code + ".") || model.has(code + "-"));

function classic(model, compact) {
  const isUnit = pairUnit(model);
  const { pos, size } = place(isUnit, compact ? 4 : 6, compact ? 1 : 2);
  const deepest = Math.max(...[...pos.keys()].map(c => c.length));
  const g = grid(size, 2 * deepest + (compact ? 2 : 1));

  for (const [parent, x] of pos) {
    const y = 2 * parent.length;
    const dot = parent + ".";
    const dash = parent + "-";
    const hasDot = isUnit(dot);
    const hasDash = isUnit(dash);
    const leaf = !hasDot && !hasDash;

    put(g, y, x - 1, model.label(dot).ch, label(model, dot));
    put(g, y, x, "│", part("bar", parent));
    put(g, y, x + 1, model.label(dash).ch, label(model, dash));

    if (compact) {
      put(g, y + 1, x - 1, ".", part("mark", dot));
      put(g, y + 1, x + 1, "-", part("mark", dash));
      put(g, y + 1, x, leaf ? "┴" : fork("┴", "┘", "└", hasDot, hasDash),
        part(leaf ? "bar" : "jct", parent));
    } else {
      put(g, y, x - 2, ".", part("mark", dot));
      put(g, y, x + 2, "-", part("mark", dash));
      if (!leaf) put(g, y + 1, x, fork("┴", "┘", "└", hasDot, hasDash), part("jct", parent));
    }

    if (leaf) continue;

    const gap = compact ? 2 : 1;   // compact leaves room for the marks

    if (hasDot) {
      const xl = pos.get(dot);
      put(g, y + 1, xl, "┌", part("arm", dot));
      for (let x2 = xl + 1; x2 <= x - gap; x2++) put(g, y + 1, x2, "─", part("arm", dot));
    }
    if (hasDash) {
      const xr = pos.get(dash);
      for (let x2 = x + gap; x2 < xr; x2++) put(g, y + 1, x2, "─", part("arm", dash));
      put(g, y + 1, xr, "┐", part("arm", dash));
    }
  }

  return g;
}

export const horizontal = model => classic(model, false);


/*
 * ============================================================
 * CLASSIC, COMPACT — letters under their marks
 * ============================================================
 *
 * Each junction is ".┴-"; its two characters sit directly
 * under the marks that lead to them, so code and letter read
 * as one column:
 *
 *            ┌───────.┴-───────┐
 *       ┌───.┴-───┐  E T  ┌───.┴-───┐
 *     ┌.┴-┐ I A ┌.┴-┐   ┌.┴-┐ N M ┌.┴-┐
 *     │S U│     │R W│   │D K│     │G O│
 *    .┴- .┴-   .┴- .┴- .┴- .┴-   .┴- .┴-
 *    H V F _   L _ P J B X C Y   Z Q _ _
 *
 * A junction shares a row with its own letter when there's
 * room (every junction except the bottom ones); otherwise it
 * drops a row and a │ carries the branch down. Siblings are
 * packed as close as they go: one blank column between
 * subtrees and around each letter pair (a │ may touch a
 * letter).
 */

export function horizontalCompact(model) {
  const isUnit = pairUnit(model);

  /*
   * Lay out the subtree under unit `p`, relative to its own
   * junction: row 0, column 0. Returns a list of cells
   * { r, x, ch, owner, thin }.
   */
  function layout(p) {
    const dot = p + ".";
    const dash = p + "-";
    const kids = [
      { code: dot, side: -1 },
      { code: dash, side: +1 }
    ].filter(k => isUnit(k.code));

    const cells = [];
    const cell = (r, x, ch, owner, thin = false) => cells.push({ r, x, ch, owner, thin });

    /* children subtrees: merged onto our letter row unless they're bottom junctions */
    const subs = kids.map(k => {
      const sub = layout(k.code);
      const grand = isUnit(k.code + ".") || isUnit(k.code + "-");
      return { ...k, sub, dr: grand ? 1 : 2 };
    });

    /* how far each child must sit from us (or from its sibling) */
    const rowsOf = (sub, dr, dx) => {
      const m = new Map();
      for (const c of sub) {
        const r = c.r + dr;
        const x = c.x + dx;
        const e = m.get(r) ?? { min: Infinity, max: -Infinity, minHard: Infinity, maxHard: -Infinity };
        e.min = Math.min(e.min, x); e.max = Math.max(e.max, x);
        if (!c.thin) { e.minHard = Math.min(e.minHard, x); e.maxHard = Math.max(e.maxHard, x); }
        m.set(r, e);
      }
      return m;
    };

    /* our letters sit at row 1, columns -1 and +1 */
    const clearOfLetters = (rows, side) => {
      const e = rows.get(1);
      if (!e) return true;
      if (side < 0) return e.maxHard <= -3 && e.max <= -2;
      return e.minHard >= 3 && e.min >= 2;
    };

    const apart = (L, R) => {
      for (const [r, a] of L) {
        const b = R.get(r);
        if (b && a.max + 1 >= b.min) return false;
      }
      return true;
    };

    const placed = [];
    if (subs.length === 2) {
      for (let half = 2; ; half++) {
        const L = rowsOf(subs[0].sub, subs[0].dr, -half);
        const R = rowsOf(subs[1].sub, subs[1].dr, +half);
        if (clearOfLetters(L, -1) && clearOfLetters(R, +1) && apart(L, R)) {
          placed.push({ ...subs[0], x: -half }, { ...subs[1], x: +half });
          break;
        }
      }
    } else if (subs.length === 1) {
      const k = subs[0];
      for (let d = 2; ; d++) {
        const x = k.side * d;
        if (clearOfLetters(rowsOf(k.sub, k.dr, x), k.side)) { placed.push({ ...k, x }); break; }
      }
    }

    /* the junction and its marks */
    cell(0, -1, ".", part("mark", dot));
    cell(0, 0, "┴", part("fork", p));
    cell(0, 1, "-", part("mark", dash));

    /* our two characters, under their marks */
    cell(1, -1, model.label(dot).ch, label(model, dot));
    cell(1, 1, model.label(dash).ch, label(model, dash));

    for (const k of placed) {
      const arm = part("arm", k.code);
      const step = k.side;               // -1 left, +1 right
      cell(0, k.x, step < 0 ? "┌" : "┐", arm);
      for (let x = k.x - step; Math.abs(x) > 1; x -= step) cell(0, x, "─", arm);
      for (let r = 1; r < k.dr; r++) cell(r, k.x, "│", arm, true);
      for (const c of k.sub) cells.push({ ...c, r: c.r + k.dr, x: c.x + k.x });
    }

    return cells;
  }

  const cells = layout("");
  const minX = Math.min(...cells.map(c => c.x));
  const maxX = Math.max(...cells.map(c => c.x));
  const maxR = Math.max(...cells.map(c => c.r));
  const g = grid(maxX - minX + 1, maxR + 1);
  let overlaps = 0;
  for (const c of cells) {
    if (g[c.r][c.x - minX]) overlaps++;
    put(g, c.r, c.x - minX, c.ch, c.owner);
  }
  g.overlaps = overlaps;   // should always be 0 (checked in tests)
  return g;
}


/*
 * ============================================================
 * CLASSIC, VERTICAL — dot up, dash down
 * ============================================================
 *
 *     .E│      dot child
 *     ──┤      junction (the parent)
 *     -T│      dash child
 */

export function vertical(model) {
  const isUnit = pairUnit(model);
  const { pos, size } = place(isUnit, 4, 1);
  const deepest = Math.max(...[...pos.keys()].map(c => c.length));
  const g = grid(3 * (deepest + 1) + 1, size);

  for (const [parent, y] of pos) {
    const c = 3 * (parent.length + 1);
    const dot = parent + ".";
    const dash = parent + "-";
    const hasDot = isUnit(dot);
    const hasDash = isUnit(dash);

    /* the "──" into the fork belongs to the step OUT of this node,
       so it lights in the colour of the next mark (like the fork) */
    const lead = part("bar", parent);

    put(g, y - 1, c - 2, ".", part("mark", dot));
    put(g, y - 1, c - 1, model.label(dot).ch, label(model, dot));
    if (hasDot) put(g, y - 1, c, "│", part("stem", dot));

    put(g, y, c - 2, "─", lead);
    put(g, y, c - 1, "─", lead);
    if (hasDot || hasDash) put(g, y, c, fork("┤", "┘", "┐", hasDot, hasDash), part("bar", parent));

    put(g, y + 1, c - 2, "-", part("mark", dash));
    put(g, y + 1, c - 1, model.label(dash).ch, label(model, dash));
    if (hasDash) put(g, y + 1, c, "│", part("stem", dash));

    if (hasDot) {
      const yA = pos.get(dot);
      for (let y2 = yA + 1; y2 <= y - 2; y2++) put(g, y2, c, "│", part("arm", dot));
      put(g, yA, c, "┌", part("arm", dot));
    }
    if (hasDash) {
      const yB = pos.get(dash);
      for (let y2 = y + 2; y2 <= yB - 1; y2++) put(g, y2, c, "│", part("arm", dash));
      put(g, yB, c, "└", part("arm", dash));
    }
  }

  return g;
}


/*
 * ============================================================
 * BRANCHES — one character per node, the line is the symbol
 * ============================================================
 *
 *                        ●
 *            ┌···········┴━━━━━━━━━━━┓
 *            E                       T
 *      ┌·····┴━━━━━┓           ┌·····┴━━━━━┓
 *      I           A           N           M
 *
 * Dotted line = dot (left), heavy line = dash (right), so a
 * lit path spells its own code. Roomy: bottom nodes 4 apart.
 * Compact: 2 apart.
 */

function branchLayout(model, pitch) {
  const { pos, size } = place(model.has, pitch, pitch === 4 ? 1 : 0);
  const g = grid(size, 2 * model.depth + 1);

  put(g, 0, pos.get(""), "●", part("root", ""));

  for (const [parent, px] of pos) {
    const dot = parent + ".";
    const dash = parent + "-";
    const hasDot = model.has(dot);
    const hasDash = model.has(dash);
    if (!hasDot && !hasDash) continue;

    const yLine = 2 * parent.length + 1;
    const yNode = yLine + 1;

    put(g, yLine, px, fork("┴", "┘", "└", hasDot, hasDash), part("fork", parent));

    if (hasDot) {
      const xl = pos.get(dot);
      put(g, yLine, xl, "┌", part("edge", dot));
      for (let x = xl + 1; x < px; x++) put(g, yLine, x, "·", part("edge", dot));
      put(g, yNode, xl, model.label(dot).ch, label(model, dot));
    }
    if (hasDash) {
      const xr = pos.get(dash);
      for (let x = px + 1; x < xr; x++) put(g, yLine, x, "━", part("edge", dash));
      put(g, yLine, xr, "┓", part("edge", dash));
      put(g, yNode, xr, model.label(dash).ch, label(model, dash));
    }
  }

  return g;
}

export const branches = model => branchLayout(model, 4);
export const branchesCompact = model => branchLayout(model, 2);


/*
 * ============================================================
 * BRANCHES, VERTICAL — dot up, dash down
 * ============================================================
 *
 *        ┌·I
 *     ┌·E┤
 *     ·  ┗━A
 *     ●┤
 *     ┃  ┌·N
 *     ┗━T┤
 *        ┗━M
 *
 * Three columns per level (character, fork, one branch
 * char), so even the shortest branch shows its · or ━.
 */

function branchLayoutV(model, pitch) {
  const { pos, size } = place(model.has, pitch, 0);
  const g = grid(3 * model.depth + 1, size);

  put(g, pos.get(""), 0, "●", part("root", ""));

  for (const [parent, py] of pos) {
    const dot = parent + ".";
    const dash = parent + "-";
    const hasDot = model.has(dot);
    const hasDash = model.has(dash);
    if (!hasDot && !hasDash) continue;

    const c = 3 * parent.length + 1;

    put(g, py, c, fork("┤", "┘", "┐", hasDot, hasDash), part("fork", parent));

    if (hasDot) {
      const yA = pos.get(dot);
      for (let y = yA + 1; y < py; y++) put(g, y, c, "·", part("edge", dot));
      put(g, yA, c, "┌", part("edge", dot));
      put(g, yA, c + 1, "·", part("edge", dot));
      put(g, yA, c + 2, model.label(dot).ch, label(model, dot));
    }
    if (hasDash) {
      const yB = pos.get(dash);
      for (let y = py + 1; y < yB; y++) put(g, y, c, "┃", part("edge", dash));
      put(g, yB, c, "┗", part("edge", dash));
      put(g, yB, c + 1, "━", part("edge", dash));
      put(g, yB, c + 2, model.label(dash).ch, label(model, dash));
    }
  }

  return g;
}

export const branchesV = model => branchLayoutV(model, 4);
export const branchesVCompact = model => branchLayoutV(model, 2);


/*
 * Plain text, for tests and the docs.
 */

export function toText(g) {
  return g
    .map(row => row.map(cell => (cell ? cell.ch : " ")).join("").trimEnd())
    .join("\n");
}


/*
 * ============================================================
 * HIGHLIGHT RULES
 * ============================================================
 *
 * path = the code keyed so far, e.g. ".-" while landing on A.
 */

export function isOn(kind, code, path) {
  if (!path || !path.startsWith(code)) return false;
  switch (kind) {
    case "lbl":  return code === path;           // current character only
    case "mark":
    case "stem":
    case "edge": return code !== "";             // the line into a node on the path
    case "root": return true;
    case "fork": return path.length > code.length;   // left this node
    case "arm":
    case "bar": return path.length > code.length;
    case "jct": return path.length > code.length + 1;
  }
  return false;
}


/*
 * Junctions are coloured by the step taken out of them.
 * Returns "dot", "dash" or null.
 */

export function stepSide(kind, code, path) {
  if (kind !== "bar" && kind !== "jct" && kind !== "fork") return null;
  const step = path[code.length];
  return step === "." ? "dot" : step === "-" ? "dash" : null;
}


/*
 * ============================================================
 * DOM
 * ============================================================
 */

const LAYOUTS = { horizontal, vertical, branches, branchesV };
const COMPACT = {
  horizontal: horizontalCompact,
  vertical,                         // already tight
  branches: branchesCompact,
  branchesV: branchesVCompact
};

const VERTICAL = new Set(["vertical", "branchesV"]);

const LEGEND = {
  horizontal: ["←DOT", "──", "DASH→"],
  vertical:   ["↑DOT", " ", "↓DASH"],
  branches:   ["←··· DOT", "  ", "DASH ━━━→"],
  branchesV:  ["↑· DOT", "  ", "↓━ DASH"]
};


export function createTree(element, initialLayout, { legend: showLegend = true } = {}) {
  let layout = initialLayout;
  let spans = [];
  let lit = [];
  let landed = [];
  let currentPath = "";
  let currentLanded = null;

  /*
   * compact: true / false, or "auto" = roomy if it fits,
   * compact if it doesn't. Wide trees must fit the width;
   * tall ones (vertical) must fit most of the screen height.
   */
  function render(model, compact = "auto") {
    if (compact === "auto") {
      draw(model, false);
      const tooWide = element.scrollWidth > element.clientWidth + 1;
      const tooTall = VERTICAL.has(layout) && element.scrollHeight > window.innerHeight * 0.85;
      if (tooWide || tooTall) draw(model, true);
    } else {
      draw(model, compact);
    }
  }

  function draw(model, compact) {
    const g = (compact ? COMPACT : LAYOUTS)[layout](model);
    element.dataset.compact = compact && COMPACT[layout] !== LAYOUTS[layout] ? "yes" : "no";
    const width = g[0].length;

    element.textContent = "";
    spans = [];
    lit = [];
    landed = [];

    /* legend line (unless the page draws its own) */
    if (showLegend) {
      const [dot, mid, dash] = LEGEND[layout];
      const legend = dot + mid + dash;
      const pad = !VERTICAL.has(layout)
        ? " ".repeat(Math.max(0, Math.floor((width - legend.length) / 2)))
        : "";
      element.append(pad);
      element.append(span(dot, "legend dot"));
      element.append(mid);
      element.append(span(dash, "legend dash"));
      element.append("\n\n");
    }

    /* rows: merge neighbouring cells that share an owner */
    for (const row of g) {
      let x = 0;
      const end = lastFilled(row);

      while (x <= end) {
        const cell = row[x];

        if (!cell) {
          let text = "";
          while (x <= end && !row[x]) { text += " "; x++; }
          element.append(text);
          continue;
        }

        let text = "";
        const key = keyOf(cell);
        while (x <= end && row[x] && keyOf(row[x]) === key) { text += row[x].ch; x++; }

        const classes = [cell.kind, cell.side];
        if (cell.cat) classes.push(cell.cat);

        const s = span(text, classes.join(" "));
        s.dataset.kind = cell.kind;
        s.dataset.code = cell.code;
        if (cell.reveal) {
          s.dataset.rest = text;
          s.dataset.reveal = cell.reveal;
        }
        spans.push(s);
        element.append(s);
      }
      element.append("\n");
    }

    /* a redraw mid-message picks up where it was */
    show(currentPath);
    land(currentLanded);
  }

  /*
   * Light up everything on the path to `path`.
   */
  function show(path) {
    currentPath = path;
    for (const s of lit) s.classList.remove("on");
    lit = spans.filter(s => isOn(s.dataset.kind, s.dataset.code, path));
    for (const s of lit) {
      s.classList.add("on");
      const side = stepSide(s.dataset.kind, s.dataset.code, path);
      if (side) {
        s.classList.toggle("dot", side === "dot");
        s.classList.toggle("dash", side === "dash");
      }
    }
    revealHidden();
  }

  /*
   * A hidden character (*) shows itself only while the
   * animation is on it: lit, or just landed.
   */
  function revealHidden() {
    for (const s of spans) {
      if (!s.dataset.reveal) continue;
      const active = s.classList.contains("on") || s.classList.contains("landed");
      s.textContent = active ? s.dataset.reveal : s.dataset.rest;
    }
  }

  function land(path) {
    currentLanded = path;
    for (const s of landed) s.classList.remove("landed");
    landed = spans.filter(s => s.dataset.kind === "lbl" && s.dataset.code === path);
    for (const s of landed) s.classList.add("landed");
    revealHidden();
  }

  function clear() {
    show("");
    land(null);
  }

  /* the whole way to a character, lit at once (before it's traced) */
  function flash(path) {
    show(path);
    land(path);
  }

  /*
   * Keyer events → highlight.
   */
  function handle(event) {
    switch (event.type) {
      case "start":  clear(); element.classList.add("live"); break;
      case "beat":   land(null); show(event.path); break;
      case "letter": land(event.path); break;
      case "word":   show(""); break;   /* keep the last letter marked */
      case "end":    element.classList.remove("live"); land(event.path); break;
    }
  }

  function setLayout(name) {
    layout = name;
  }

  return { render, handle, setLayout, flash, element };
}


function span(text, className) {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}

function keyOf(cell) {
  return cell.kind + "|" + cell.code;
}

function lastFilled(row) {
  for (let x = row.length - 1; x >= 0; x--) if (row[x]) return x;
  return -1;
}

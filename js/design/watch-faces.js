/*
 * Watch faces for Garmin (docs/garmin.md), drawn here first to set
 * the look before any Monkey C. Each face is one SVG on a 260 box, a
 * round screen or a square one, made by a function that draws what
 * stays and hands back `update(now)` for what moves:
 *
 *   face(svg, options)  → update({ digits, sec, ms, beat })
 *     digits   "1237", H H M M
 *     sec      0 to 60, with its fraction: how far the minute is
 *     ms       the same in ms, for the rewrite at the turn
 *     beat     true for the first moment of each second: the key down
 *
 * They are redrawn whole when the time's digits or an option change,
 * which is once a minute; between, only the moving parts are touched.
 */

import { codeOf } from "/js/core/morse.js";
import { timeline } from "/js/shared/playback.js";
import { STROKES, CUT_STROKES, createLetter } from "/js/core/strokes.js";
import { logoSVG, BAKELITE, RING, LEVER, ANGLE } from "/js/shared/logo.js";

const NS = "http://www.w3.org/2000/svg";
export const SIZE = 260;
const C = SIZE / 2;

function node(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  parent?.append(el);
  return el;
}

/* A digit's marks laid out in units, as it would sound: a dot is one,
   a dash three, the gap between them one

     0  - - - - -    ███ ███ ███ ███ ███     19 units, the longest */
function units(code) {
  let at = 0;
  return [...code].map(mark => {
    const from = at, to = at + (mark === "." ? 1 : 3);
    at = to + 1;
    return { mark, from, to };
  });
}
const span = code => { const u = units(code); return u.at(-1).to; };
const kind = mark => (mark === "." ? "dot" : "dash");

/* The key, the site's logo, drawn by js/shared/logo.js and coloured from the
   theme. Both ways round are drawn, one shown: up at rest, down (the
   colours flip) for a moment each second, so it beats like a key */
function key(parent, cx, cy, size) {
  const g = node("g", { class: "key" }, parent);
  for (const closed of [false, true]) {
    const svg = new DOMParser().parseFromString(logoSVG({ closed }), "image/svg+xml").documentElement;
    svg.removeAttribute("id");
    for (const el of svg.querySelectorAll("[fill], [stroke]")) {
      for (const attr of ["fill", "stroke"]) {
        const v = el.getAttribute(attr);
        if (!v || v === "none") continue;
        el.removeAttribute(attr);
        el.style[attr] = v === BAKELITE ? "var(--bakelite)" : "var(--paper)";
      }
    }
    const nested = document.importNode(svg, true);
    for (const [name, value] of Object.entries({ x: cx - size / 2, y: cy - size / 2, width: size, height: size, class: closed ? "down" : "up" })) {
      nested.setAttribute(name, value);
    }
    g.append(nested);
  }
  /* the ring around the disc, so the key reads as a key on bakelite */
  node("circle", { cx, cy, r: size / 2, class: "key-rim" }, g);
  return beat => g.classList.toggle("beat", beat);
}

/* The other key: the switch alone, no disc, as a circuit diagram
   draws it, set into a line. The line comes in to the ring; the lever
   is the break in it, up at rest, down flat on the beat, where it
   meets the line again and the switch goes brass:

                ╱
     ───────◯╱    ───────      ───────◯━━━━━━━───────
      (open: paper)                 (shut: brass)

   It is the logo's own switch (js/shared/logo.js: the ring, and the stem
   whose middle runs through the ring's centre and turns on it), at
   a scale that fits it to the gap the line leaves, cx ± size/2: from
   the ring's outer edge to the stem's end, lying flat */
function wired(parent, cx, cy, size) {
  const reach = RING.r + RING.width / 2 + LEVER.from + LEVER.length;   // the ring's left edge to the stem's end
  const k = size / reach;
  const ringX = cx - size / 2 + (RING.r + RING.width / 2) * k;
  const g = node("g", { class: "switch" }, parent);
  node("circle", { cx: ringX, cy, r: RING.r * k, "stroke-width": RING.width * k, class: "ring" }, g);
  const h = LEVER.thick * k;
  const lever = node("rect", { x: ringX + LEVER.from * k, y: cy - h / 2, width: LEVER.length * k, height: h, rx: h / 2, class: "lever" }, g);
  return beat => {
    g.classList.toggle("beat", beat);
    lever.setAttribute("transform", `rotate(${beat ? ANGLE.closed : ANGLE.open} ${ringX} ${cy})`);
  };
}

/* either key, as the sheet's menu has it: the favicon's disc, or the
   switch in the line */
const keyOf = (inline, parent, cx, cy, size) => (inline ? wired : key)(parent, cx, cy, size);

/* How much of the minute is lit: in whole beats, so it grows a chunk
   at a time as the key goes down (the first at :00), full for the
   last beat before the turn */
const chunked = (sec, every) => Math.min(60, (Math.floor(sec / every) + 1) * every);

/* the lit line: paper, and brass for a moment as it grows */
function grow(line, { sec, beat }, every) {
  line.setAttribute("stroke-dasharray", `${chunked(sec, every)} 60`);
  line.classList.toggle("pulse", beat);
}

/* The screen: glass and bezel. Round clips what's drawn to it */
let clips = 0;
function screen(svg, round) {
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  svg.replaceChildren();
  const id = `screen-${++clips}`;
  const clip = node("clipPath", { id }, node("defs", {}, svg));
  const shape = round
    ? { tag: "circle", attrs: { cx: C, cy: C, r: C - 1 } }
    : { tag: "rect", attrs: { x: 1, y: 1, width: SIZE - 2, height: SIZE - 2, rx: 18 } };
  node(shape.tag, shape.attrs, clip);
  node(shape.tag, { ...shape.attrs, class: "glass" }, svg);
  const face = node("g", { "clip-path": `url(#${id})` }, svg);
  node(shape.tag, { ...shape.attrs, class: "bezel" }, svg);
  return face;
}

function numeral(parent, x, y, text, anchor = "middle", size = 11) {
  const t = node("text", { x, y, class: "numeral", "text-anchor": anchor, "dominant-baseline": "central", "font-size": size }, parent);
  t.textContent = text;
  return t;
}

/* A dot as the sheet's menu has it: square (the site's dit), a
   squircle or a circle, s across, on cx, cy, turned by deg. The
   squircle is a superellipse, |x|⁴ + |y|⁴ = 1, not a rounded square:
   its sides are never quite straight

     ▪   ▢   ●       square, squircle, circle */
function squircle(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48 * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
    pts.push(`${(cx + r * Math.sign(c) * Math.sqrt(Math.abs(c))).toFixed(2)} ${(cy + r * Math.sign(s) * Math.sqrt(Math.abs(s))).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}
function dot(parent, cx, cy, s, shape, deg = 0) {
  const attrs = { class: "m dot" };
  if (deg) attrs.transform = `rotate(${deg} ${cx} ${cy})`;
  if (shape === "squircle") return node("path", { d: squircle(cx, cy, s / 2), ...attrs }, parent);
  return node("rect", { x: cx - s / 2, y: cy - s / 2, width: s, height: s, ...(shape === "circle" ? { rx: s / 2 } : {}), ...attrs }, parent);
}
/* a mark in a box: a dash fills it, and so does a square dot (the tall
   barcode's is a bar a third high); a round one sits in its middle */
const mark = (parent, mk, x, y, w, h, shape) => mk === "." && shape && shape !== "square"
  ? dot(parent, x + w / 2, y + h / 2, Math.min(w, h), shape)
  : node("rect", { x, y, width: w, height: h, class: `m ${kind(mk)}` }, parent);

/* keep: the full digit drawn, the marks its cut keeps lit and the rest
   grey, so both are there to read. The cut drops repeated dashes: from
   the end for 1 to 5, from the front for 6 to 0, keeping one

     1  .----   ▪ ▬ ░ ░ ░      .-     7  --...   ░ ▬ ▪ ▪ ▪      -...
     5  .....   ▪ ░ ░ ░ ░      .      0  -----   ░ ░ ░ ░ ▬      -

   4 and 6 keep all theirs. spareOf(digit, keep)(k): is the full
   digit's mark k one the cut leaves out? */
function spareOf(digit, keep) {
  const full = codeOf(digit), cut = codeOf(digit, { cut: true });
  if (!keep || cut === full) return () => false;
  const front = "12345".includes(digit);
  return k => (front ? k >= cut.length : k < full.length - cut.length);
}
const spared = (el, yes) => { if (yes) el.classList.add("spare"); return el; };


/*
 * 1. Square, true to the brand: a ruled box, a row each for H H M M in
 * full digits, and the key in the bottom of the box. The border fills
 * from the key clockwise as the minute goes, a chunk each beat:
 *
 *   ┌────────────────┐      at :15        ████████████████┐
 *   │ ▪ ▬ ▬ ▬ ▬      │                    █               │
 *   │ ▪ ▪ ▬ ▬ ▬      │                    █               │
 *   │ ▪ ▪ ▪ ▬ ▬      │                    █               │
 *   │ ▬ ▬ ▪ ▪ ▪      │                    █               │
 *   └──────(o/──────┘                    ███████(o/──────┘
 *
 * The lit part is paper, and pulses brass as it grows with the key
 * down. Full at the last beat; the minute turns, the rows are keyed
 * again (quickly, top to bottom) and the border starts over.
 *
 * The rows are justified: every mark has a dash's room, a dot in the
 * middle of it with a unit either side, so the five marks of any full
 * digit fill the row, and the marks stand in columns down the box:
 *
 *   1  .----    ░▪░ ▬▬▬ ▬▬▬ ▬▬▬ ▬▬▬
 *   3  ...--    ░▪░ ░▪░ ░▪░ ▬▬▬ ▬▬▬
 *
 * alt: no key and no box. The marks are painted in, one every three seconds:
 * four full digits are twenty marks, twenty threes are the minute.
 *
 * upright: the marks stood on end, a dash a bar three units tall, a
 * dot one unit in its middle, a unit between them, as a barcode is
 * read. A full digit is nine units across, not nineteen, so the rows
 * are narrow and the marks can be bigger:
 *
 *   1  .----    ▪ █ █ █ █
 *   3  ...--    ▪ ▪ ▪ █ █
 */
const REWRITE = 50;   // ms a mark, as the rows are rewritten at the turn

/*
 * wide: the box in the top half, as low as the rows need: a unit
 * between rows, as between marks, so the four sit close as text. Its
 * bottom edge runs through the middle of the screen with the key in
 * it, and the bottom half is left open, for stats (made up here):
 *
 *       ┌───────────────┐
 *       │ ▪ ▬ ▬ ▬ ▬   1 │
 *       │ ▪ ▪ ▬ ▬ ▬   2 │
 *       │ ▪ ▪ ▪ ▬ ▬   3 │
 *       │ ▬ ▬ ▪ ▪ ▪   7 │
 *       └─────(o/───────┘     ← the middle of the screen
 *            17 TUE
 *           ▂▅▃█▆▄▁
 *         6412 steps
 *
 * wide and upright: the marks stood on end, the rows a unit apart, in
 * a box in the left half, its right edge down the middle of the
 * screen; as tall as the round allows, so taller than wide, the key in
 * its bottom edge opening up into it, as the square's. The right half
 * is for the stats:
 *
 *       ┌───────────┐
 *       │ 1 ▪ █ █ █ █│
 *       │ 2 ▪ ▪ █ █ █│      17 TUE
 *       │ 3 ▪ ▪ ▪ █ █│     ▂▅▃█▆▄▁
 *       │ 7 █ █ ▪ ▪ ▪│    6412 steps
 *       │            │
 *       └────(o/─────┘
 */

/* the stand-in stats, centred on cx, cy: the day, a week, the steps */
function standIn(face, cx, cy, stats) {
  const mid = node("g", { class: "middle" }, face);
  numeral(mid, cx, cy - 32, stats.day, "middle", 12);
  const bars = stats.week, w = 8, gap = 3, h = 30;
  const left = cx - (bars.length * (w + gap) - gap) / 2;
  bars.forEach((b, i) => node("rect", { x: left + i * (w + gap), y: cy + 14 - b * h, width: w, height: b * h, class: i === bars.length - 1 ? "bar today" : "bar" }, mid));
  numeral(mid, cx, cy + 30, stats.steps, "middle", 11);
}

export function square(svg, { round, cut, numerals, alt, still, inline, every, upright, dots, keep, wide }, { stats } = {}) {
  return digits => {
    const face = screen(svg, round);
    const keySize = inline ? (round ? 40 : 50) : (round ? 30 : 38);
    if (wide && upright) {
      /* as big as the left half allows, the box's far corners inside
         the round: taller than wide, the key in its bottom edge */
      const v = round ? 7 : 9, pad = round ? 10 : 12, num = numerals ? 14 : 0;
      /* round: as tall as its far corners allow; square: the full height,
         the rows in the middle of the room above the key */
      const w = 2 * pad + num + 9 * v, rows = 15 * v, below = keySize / 2 + 8;
      const h = round ? 2 * pad + rows + below : 228;
      const x1 = C - w, x2 = C, y1 = C - h / 2, y2 = C + h / 2, kx = (x1 + x2) / 2;
      const top = y1 + (h - below - rows) / 2;
      const g = inline ? keySize / 2 : keySize / 2 + 4;
      const d = `M${kx - g} ${y2} H${x1} V${y1} H${x2} V${y2} H${kx + g}`;
      node("path", { d, class: "track" }, face);
      const lit = node("path", { d, class: "lit", pathLength: 60, "stroke-dasharray": "0 60" }, face);
      const beat = keyOf(inline, face, kx, y2, keySize);
      const left = x1 + pad + num, marks = [];
      [...digits].forEach((digit, row) => {
        const y = top + row * 4 * v + 1.5 * v;   // a row is a dash's height and a unit
        const spare = spareOf(digit, keep);
        [...codeOf(digit, { cut })].forEach((mk, i) => {
          const bar = mk === "." ? v : 3 * v;
          marks.push(spared(mark(face, mk, left + 2 * i * v, y - bar / 2, v, bar, dots), spare(i)));
        });
        if (numerals) numeral(face, x1 + pad, y, digit, "start");
      });
      if (stats) standIn(face, C + (round ? 60 : 64), C, stats);
      return now => {
        const shown = still ? marks.length : Math.floor(now.ms / REWRITE) + 1;
        marks.forEach((m, i) => m.classList.toggle("ghost", i >= shown));
        grow(lit, now, every);
        beat(now.beat);
      };
    }
    let [x1, y1, x2, y2] = round ? [44, 44, 216, 216] : [16, 16, 244, 244];
    if (wide) {
      [x1, x2, y2] = round ? [46, 214, C] : [16, 244, C];
      const pad = round ? 10 : 14, u = (x2 - x1 - 2 * pad - (numerals ? 18 : 0)) / 19;
      y1 = y2 - (pad + 8 * u + keySize / 2 + 6);
    }
    const g = inline ? keySize / 2 : keySize / 2 + 4;   // the border stops short of the key, or meets the switch
    /* alt has no border at all: no key to fill from, the marks alone */
    const d = `M${C - g} ${y2} H${x1} V${y1} H${x2} V${y2} H${C + g}`;
    if (!alt) node("path", { d, class: "track" }, face);
    const lit = alt ? null : node("path", { d, class: "lit", pathLength: 60, "stroke-dasharray": "0 60" }, face);
    const beat = alt ? null : keyOf(inline, face, C, y2, keySize);

    /* the rows: five marks, each a dash's room, four gaps: 19 units */
    const pad = wide ? (round ? 10 : 14) : round ? 12 : 18;
    const room = x2 - x1 - 2 * pad - (numerals ? 18 : 0);
    const u = room / 19;
    const top = y1 + pad, bottom = y2 - (alt ? pad : keySize / 2 + 8);
    const step = wide ? 2 * u : (bottom - top) / 4;   // wide: a unit between rows
    /* upright: a dash as tall as most of the row; the five marks
       centred in the box, the numeral past them */
    const v = step * 0.8 / 3;
    const left = (x1 + x2) / 2 - 4.5 * v - (numerals ? 9 : 0);
    const marks = [];
    [...digits].forEach((digit, row) => {
      const y = top + step * (row + 0.5);
      const code = codeOf(digit, { cut }), spare = spareOf(digit, keep);
      [...code].forEach((mk, i) => {
        if (upright) {
          const h = mk === "." ? v : 3 * v;
          marks.push(spared(mark(face, mk, left + 2 * i * v, y - h / 2, v, h, dots), spare(i)));
          return;
        }
        const from = 4 * i + (mk === "." ? 1 : 0), width = mk === "." ? 1 : 3;
        marks.push(spared(mark(face, mk, x1 + pad + from * u, y - u / 2, width * u, u, dots), spare(i)));
      });
      if (numerals) numeral(face, upright ? left + 9 * v + 14 : x2 - pad, y, digit, upright ? "start" : "end");
    });

    /* wide: the bottom half, for stats; a stand-in, as the border's */
    if (wide && stats) standIn(face, C, C + 66, stats);

    return now => {
      const { sec, ms, beat: down } = now;
      const shown = alt ? Math.min(marks.length, Math.floor(sec / 3) + 1)
        : still ? marks.length : Math.floor(ms / REWRITE) + 1;
      marks.forEach((m, i) => m.classList.toggle("ghost", i >= shown));
      if (lit) grow(lit, now, every);
      beat?.(down);
    };
  };
}


/*
 * Which quarter each of H H M M goes in, for the quadrant faces (not
 * the stroke numbers, which always read as text does).
 * Two choices, as the sheet's menu has them:
 *
 *   order    clockwise: round the face        lines: as text is read,
 *                                              left to right, line
 *   origin   where the first quarter is:       by line
 *            9 (top left) or 12 (top right)
 *
 *              clockwise          lines
 *   from 9      H1 │ H2          H1 │ H2
 *              ────┼────        ────┼────
 *               M2 │ M1          M1 │ M2
 *
 *   from 12     M2 │ H1          M1 │ H1
 *              ────┼────        ────┼────
 *               M1 │ H2          M2 │ H2
 *
 * From 12 is from 9 turned a quarter clockwise, the whole pattern with
 * it, so the lines run down from twelve as they ran across from nine.
 * Each quarter is its signs, x and y (-1 left or top, 1 right or bottom)
 */
const FROM_NINE = {
  clockwise: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  lines: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
};
export function quarters({ order = "lines", origin = 9 } = {}) {
  const turn = ([x, y]) => [-y, x];   // a quarter turn clockwise
  return FROM_NINE[order].map(q => (origin === 12 ? turn(q) : q));
}
/* a quarter's middle as an angle, clockwise from twelve */
const middleOf = ([x, y]) => Math.atan2(x, -y);

/*
 * 2. Quadrant: the cut digits, one to a quarter, the key in the middle
 *
 *          .-    │   ..-
 *         ───── (o/ ─────
 *          ...-  │   -...
 *
 * upright, the barcode: the same, the marks stood on end as in the
 * square's upright rows
 *
 *          ▪ █   │  ▪ ▪ █
 *         ───── (o/ ─────
 *         ▪ ▪ ▪ █ │ █ ▪ ▪ ▪
 *
 * tall, the barcode in full: full digits, five bars, and the bars sized
 * to the quarter as in the scaled quadrant radial: a dash as tall as
 * the quarter has room for, a dot its middle third. Each quarter's box
 * keeps clear of the key (and the switch's lever, up) and its outer
 * corner just inside the round:
 *
 *        █ █ █ █ █    ▪ ▪ █ █ █         1  .----     2  ..---
 *      ▪ █ █ █ █    ▪ ▪ █ █ █
 *        █ █ █ █ █    ▪ ▪ █ █ █
 *       ──────────(o/──────────
 */
export function quadrant(svg, { round, numerals, inline, order, origin, upright, tall, dots, keep }) {
  return digits => {
    const face = screen(svg, round);
    /* the switch is set into the rule across; the lever, up, still
       clears the rule that goes up and down */
    const gap = inline ? (tall ? 24 : 30) : 26;
    node("path", { d: `M0 ${C} H${C - gap} M${C + gap} ${C} H${SIZE} M${C} 0 V${C - 26} M${C} ${C + 26} V${SIZE}`, class: "rule" }, face);
    const beat = inline ? wired(face, C, C, 2 * gap) : key(face, C, C, tall ? 30 : 36);
    if (tall) {
      const u = round ? 7 : 9;
      const p = 22, w = 9 * u;                        // off the rules, and across
      const h = round ? Math.sqrt(124 ** 2 - (p + w) ** 2) - p : C - 14 - p;
      quarters({ order, origin }).forEach(([x, y], i) => {
        const left = x < 0 ? C - p - w : C + p, top = y < 0 ? C - p - h : C + p;
        const spare = spareOf(digits[i], keep);
        [...codeOf(digits[i])].forEach((mk, k) => {
          const bar = mk === "." ? h / 3 : h;
          spared(mark(face, mk, left + 2 * k * u, top + (h - bar) / 2, u, bar, dots), spare(k));
        });
        /* the numeral beside its bars, on the outer side */
        if (numerals) numeral(face, x < 0 ? left - 8 : left + w + 8, top + h / 2, digits[i], "middle", 9);
      });
      return ({ beat: down }) => beat(down);
    }
    const q = round ? 50 : 64;
    const u = upright ? (round ? 9 : 10) : (round ? 7 : 8);
    const where = quarters({ order, origin });
    [...digits].forEach((digit, i) => {
      const [x, y] = where[i];
      const cx = C + x * q, cy = C + y * q * (round ? 0.9 : 1);
      const code = codeOf(digit, { cut: true });
      if (upright) {
        const left = cx - (2 * code.length - 1) * u / 2;
        [...code].forEach((mk, k) => {
          const h = mk === "." ? u : 3 * u;
          mark(face, mk, left + 2 * k * u, cy - h / 2, u, h, dots);
        });
      } else {
        const left = cx - span(code) * u / 2;
        for (const { mark: mk, from, to } of units(code)) mark(face, mk, left + from * u, cy - u / 2, (to - from) * u, u, dots);
      }
      if (numerals) numeral(face, cx, cy + (upright ? 2.6 : 2.4) * u, digit);
    });
    return ({ beat: down }) => beat(down);
  };
}


/*
 * 3. Radial: a ring each, read from out in, H H M M, each starting at
 * the origin (twelve, or nine) and going clockwise. A dot is as long on its ring as it is
 * wide, on every ring, so the inner ones go further round. The
 * seconds run in a hairline outside them all
 */
/* an arc of radius r about the middle, from angle a0 to a1 (radians,
   clockwise from twelve) */
const arc = (r, a0, a1) => {
  const p = a => [C + r * Math.sin(a), C - r * Math.cos(a)];
  const [sx, sy] = p(a0), [ex, ey] = p(a1);
  return `M${sx} ${sy} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${ex} ${ey}`;
};

/* the seconds, a hairline round the outside (or at r), from twelve (or
   from start, clockwise from twelve in radians), and the key in the
   middle: the radial faces' moving parts */
/* end: where an arc of seconds stops short of the round (beams with
   right-aligned hands, which leave the room for stats out), clockwise
   from start, in radians */
function hub(face, { inline, every, r = 122, start = 0, end }) {
  /* a circle's path begins at three: a quarter back is twelve */
  const seconds = end === undefined
    ? node("circle", { cx: C, cy: C, r, class: "lit thin", pathLength: 60, transform: `rotate(${start * 180 / Math.PI - 90} ${C} ${C})` }, face)
    : node("path", { d: arc(r, start, end), class: "lit thin", pathLength: 60 }, face);
  const beat = keyOf(inline, face, C, C, inline ? 36 : 30);
  return now => { grow(seconds, now, every); beat(now.beat); };
}

/*
 * Radar (the sheet's menu, for the faces read round): a hand sweeps the
 * face once a second from the origin, under the marks, and each mark
 * lights as it passes, then fades back to dim before the next turn,
 * like pings on a scope:
 *
 *          ░ ░  ▓ █ ┃         the marks just swept bright, those
 *        ░        ▓ ┃         behind fading, the rest dim
 *        ░    (o/ ━┛
 *
 * Each mark is lit by where its middle is, as an angle from the centre
 * (a long arc lights all at once, when the hand reaches its middle).
 * radar(face, opts, update) hands back update with the sweep added.
 */
const TRAIL = 0.45;   // of a turn: how far behind the hand a mark is still lit

function radar(face, { radar: on, origin }, update) {
  if (!on) return update;
  const start = origin === 9 ? -Math.PI / 2 : 0;
  /* the hand and its wake under the marks: slices behind it, each
     fainter, as the marks fade (SVG has no sweep gradient) */
  const sweep = node("g", { class: "sweep" });
  face.prepend(sweep);
  const SLICES = 12, p = a => `${C - 200 * Math.sin(a)} ${C - 200 * Math.cos(a)}`;
  for (let k = 0; k < SLICES; k++) {
    const a0 = k / SLICES * TRAIL * 2 * Math.PI, a1 = (k + 1.05) / SLICES * TRAIL * 2 * Math.PI;
    node("path", { d: `M${C} ${C} L${p(a0)} A200 200 0 0 0 ${p(a1)} Z`, class: "wake", "fill-opacity": (0.16 * (1 - k / SLICES)).toFixed(3) }, sweep);
  }
  node("line", { x1: C, y1: C, x2: C, y2: C - 200, class: "beam" }, sweep);
  let marks = null;
  return now => {
    /* where each mark is, once it's laid out: its middle, from the
       face's centre, measured on screen so turned groups count */
    if (!marks) {
      const centre = new DOMPoint(C, C).matrixTransform(face.getScreenCTM());
      marks = [...face.querySelectorAll(".m, .a, .seg:not(.off)")].map(el => {
        const b = el.getBBox();
        const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(el.getScreenCTM());
        return { el, a: Math.atan2(p.x - centre.x, centre.y - p.y) };
      });
    }
    const turn = (now.ms % 1000) / 1000, hand = start + turn * 2 * Math.PI;
    sweep.setAttribute("transform", `rotate(${hand * 180 / Math.PI} ${C} ${C})`);
    for (const { el, a } of marks) {
      const behind = ((hand - a) / (2 * Math.PI) % 1 + 1) % 1;   // 0 just swept, to 1
      el.style.opacity = 0.25 + 0.75 * Math.max(0, 1 - behind / TRAIL);
    }
    update(now);
  };
}

/* A mark on a ring, an arc from a0 to a1; a dot not drawn square is
   drawn in its shape at the arc's middle, turned to the ring */
function onRing(parent, mk, r, a0, a1, u, shape) {
  if (mk === "." && shape && shape !== "square") {
    const a = (a0 + a1) / 2;
    return dot(parent, C + r * Math.sin(a), C - r * Math.cos(a), u, shape, a * 180 / Math.PI);
  }
  return node("path", { d: arc(r, a0, a1), class: `a ${kind(mk)}`, "stroke-width": u }, parent);
}

/* The seconds start where the marks do, at the origin. They run round
   the outside, or (the sheet's menu) inside, the innermost ring, round
   the key, the four rings moved out to make room:

     outside   ( seconds ( H ( H ( M ( M (o/ ) ) ) ) ) )
     inside    ( H ( H ( M ( M ( seconds (o/ ) ) ) ) ) ) */
export function radial(svg, { round, cut, numerals, inline, every, origin, dots, keep, seconds = "outside", radar: sweeping }) {
  return digits => {
    const face = screen(svg, round);
    const inside = seconds === "inside";
    const rings = inside ? [114, 94, 74, 54] : [108, 88, 68, 48];
    const u = 9;
    const start = origin === 9 ? -Math.PI / 2 : 0;
    [...digits].forEach((digit, i) => {
      const r = rings[i];
      node("circle", { cx: C, cy: C, r, class: "track thin" }, face);
      const spare = spareOf(digit, keep);
      units(codeOf(digit, { cut })).forEach(({ mark: mk, from, to }, k) =>
        spared(onRing(face, mk, r, start + from * u / r, start + to * u / r, u, dots), spare(k)));
      /* the numeral just before where its ring's marks begin */
      if (numerals) {
        if (origin === 9) numeral(face, C - r, C + 8, digit, "middle", 9);
        else numeral(face, C - 8, C - r, digit, "end", 9);
      }
    });
    return radar(face, { radar: sweeping, origin }, hub(face, { inline, every, start, r: inside ? 34 : 122 }));
  };
}


/*
 * 3b. Quadrant radial: a quarter each, H H M M as in the quadrant face,
 * and in each quarter the digit's marks one to a ring, from out in, an
 * arc centred in the quarter. A dot's arc is as long as it is wide, a
 * dash's three times that, on every ring
 *
 *          ╭─▬▬▬─╮ ╭──▪──╮        1  .----   top left
 *          ╰─▬▬▬─╯ ╰──▪──╯        2  ..---   top right
 *              ...    (o/        and so on, inward
 *
 * scaled: the marks grow with their ring instead, as if seen down the
 * barrel. A dash reaches from one side of its quarter to the other, a
 * dot is the third of it in the middle, on every ring; the rings stay
 * as they are, the same width and evenly apart. Along the quarters'
 * lines, from the innermost ring out, a channel a unit wide (a ring's
 * width) keeps the dashes of two quarters from running together, its
 * sides straight and parallel, the line down its middle:
 *
 *     ◢██████◣ │ ◢██████◣      a dash: the whole quarter
 *       ◢██◣   │   ◢██◣        a dot: its middle third
 *              │               the channel, a unit, either side
 */
export function quadrantRadial(svg, { round, cut, numerals, inline, every, order, origin, scaled, dots, keep, seconds = "outside", radar: sweeping }) {
  return digits => {
    const face = screen(svg, round);
    const rings = [108, 92, 76, 60, 44];
    const u = 9;
    const gap = 30;
    const cross = `M0 ${C} H${C - gap} M${C + gap} ${C} H${SIZE} M${C} 0 V${C - gap} M${C} ${C + gap} V${SIZE}`;
    if (!scaled) node("path", { d: cross, class: "rule thin" }, face);
    for (const r of rings) node("circle", { cx: C, cy: C, r, class: "track thin faint" }, face);
    const middles = quarters({ order, origin }).map(middleOf);
    [...digits].forEach((digit, i) => {
      const mid = middles[i];
      const spare = spareOf(digit, keep);
      [...codeOf(digit, { cut })].forEach((mark, k) => {
        const r = rings[k], dots = mark === "." ? 1 : 3;
        const half = scaled ? dots * Math.PI / 12 : dots * u / 2 / r;   // scaled: 45° for a dash, 15° a dot
        /* scaled, a dot is a third of the quarter: an arc whatever the
           menu says, there's no circle that shape */
        spared(onRing(face, mark, r, mid - half, mid + half, u, scaled ? null : dots), spare(k));
      });
      if (numerals) {
        /* inside the innermost ring, between it and the key */
        /* inside the innermost ring, between it and the key; or, with
           the seconds there, past the outermost */
        const r = seconds === "inside" ? 121 : 31;
        numeral(face, C + r * Math.sin(mid), C - r * Math.cos(mid), digit, "middle", 9);
      }
    });
    if (scaled) {
      /* the channel: cut out of the marks in the screen's own colour,
         from the innermost ring's inside edge to the rim */
      const from = rings.at(-1) - u / 2;
      node("path", { d: `M0 ${C} H${C - from} M${C + from} ${C} H${SIZE} M${C} 0 V${C - from} M${C} ${C + from} V${SIZE}`, class: "channel", "stroke-width": u }, face);
      node("path", { d: cross, class: "rule thin" }, face);
    }
    /* the seconds start on the tens of hours' line, the middle of H1's
       quarter, not at the origin */
    return radar(face, { radar: sweeping, origin }, hub(face, { inline, every, start: middles[0], r: seconds === "inside" ? 34 : 122 }));
  };
}


/*
 * 3c. Beams: the quadrant radial turned inside out and laid in line.
 * A beam from the ring round the key out through the middle of each
 * quarter, H H M M, the digit's marks along it from the inside out,
 * as they'd sound, like light from a lamp:
 *
 *        ▬ ▬ ▬ ▪          ▪ ▪ ▬ ▬
 *              ╲  ╭───╮  ╱
 *                 │(o/│
 *              ╱  ╰───╯  ╲
 *
 * The longest digit, 0's nineteen units, just reaches the seconds
 * hairline, which sets the unit; cut digits leave the beams long and
 * mostly bare.
 *
 * hands: each quarter has a beam for every value its digit can take,
 * H1 0 to 2 (0 to 1 on twelve hours), H2 0 to 9, M1 0 to 5, M2 0 to 9,
 * clockwise from the quarter's start like a dial; the digit's own beam
 * carries the marks, the rest are hairlines. So four beams are always
 * lit, one a quarter, and where they point says the time too.
 *
 *   justified   each quarter's beams spread evenly across it, so the
 *               quarters differ: H1's three wide apart, H2's ten close
 *   right       every beam a tenth of a quarter apart, as in H2 and M2,
 *               all in one run clockwise from H1's 0: H1's 3, H2's 10,
 *               then the minutes' 6 and 10, and the room left over
 *               (eleven tenths) is one open space, for something else
 *               (made up here: a heart rate, a temperature). The ticks
 *               stand in the same place whatever the order; the order
 *               only says which minute takes which run. By lines M2's
 *               ten come first (bottom right), M1's six after; clockwise
 *               M1's six first, so the face reads 1 2 3 7 round, and M2's
 *               ten run on past six into the bottom left:
 *
 *     from 9:      H1 ╲╲╲ │ ║║║║ H2      H1's 0 1 2 against H2, the room
 *           72 bpm       (o/              either side of nine
 *           18°      ╱╱╱  │ ║║║║          by lines: M1 there, M2 right;
 *                                         clockwise: the run's last ten M2
 */
const VALUES = [3, 10, 6, 10];   // how many values each of H H M M can take

export function beams(svg, { round, cut, numerals, inline, every, order, origin, dots, keep, hands, h12, seconds = "outside", radar: sweeping }, { stats } = {}) {
  return digits => {
    const face = screen(svg, round);
    const was = svg.dataset.was, moved = [];
    svg.dataset.was = digits;
    /* the seconds inside are the ring round the key, and the beams
       can reach further out */
    const inside = seconds === "inside";
    const r0 = 30, reach = inside ? 120 : 114;
    const u = (reach - r0) / 19;
    node("circle", { cx: C, cy: C, r: r0 - 6, class: "track thin" }, face);
    const quarter = Math.PI / 2;
    let h1 = 0;   // H1's beam: where the seconds start
    const counts = VALUES.map((n, i) => (i === 0 && h12 ? 2 : n));
    const slot = quarter / 10;
    /* right: the run of ticks. H1's 0 sits so H1's last is just before
       the second quarter from the origin; the digits take their runs in
       order round the face, the minutes as the menu says */
    let tickOf = null, zero = null, last = null;
    if (hands === "right") {
      zero = (origin === 9 ? -Math.PI / 2 : 0) + (10 - counts[0] + 0.5) * slot;
      const first = [];
      let k = 0;
      for (const i of order === "clockwise" ? [0, 1, 2, 3] : [0, 1, 3, 2]) { first[i] = k; k += counts[i]; }
      tickOf = (i, v) => zero + (first[i] + v) * slot;
      last = zero + (k - 1) * slot;
    }
    const mids = quarters({ order, origin }).map(middleOf);
    mids.forEach((mid, i) => {
      /* the beam for this digit: the quarter's middle, or its hand */
      let a = mid;
      if (hands) {
        const n = counts[i], start = mid - quarter / 2;
        const at = v => hands === "right" ? tickOf(i, v) : start + (v + 0.5) * quarter / n;
        for (let v = 0; v < n; v++) {
          if (v === +digits[i]) continue;
          const b = at(v);
          node("path", { d: `M${C + (r0 - 6) * Math.sin(b)} ${C - (r0 - 6) * Math.cos(b)} L${C + 200 * Math.sin(b)} ${C - 200 * Math.cos(b)}`, class: "rule thin faint" }, face);
        }
        a = at(+digits[i]);
      }
      /* drawn lying along +x from the middle, then turned onto the beam */
      if (i === 0) h1 = a;
      const g = node("g", { class: "hand", transform: `rotate(${a * 180 / Math.PI - 90} ${C} ${C})` }, face);
      if (was && was[i] !== digits[i]) moved.push(g);
      node("path", { d: `M${C + r0 - 6} ${C} H${C + 200}`, class: hands ? "rule thin" : "rule thin faint" }, g);
      const code = codeOf(digits[i], { cut });
      const spare = spareOf(digits[i], keep);
      units(code).forEach(({ mark: mk, from, to }, k) => spared(mark(g, mk, C + r0 + from * u, C - u / 2, (to - from) * u, u, dots), spare(k)));
      if (numerals) {
        /* just past the beam's last mark, upright */
        const r = r0 + span(code) * u + 9;
        numeral(face, C + r * Math.sin(a), C - r * Math.cos(a), digits[i], "middle", 9);
      }
    });
    /* right: the stats in the room, in its middle, a line each */
    if (hands === "right") {
      const b = (last + zero + 2 * Math.PI) / 2, r = 80;
      const lines = [stats?.heart, stats?.temp].filter(Boolean);
      lines.forEach((text, k) => numeral(face, C + r * Math.sin(b), C - r * Math.cos(b) + (k - (lines.length - 1) / 2) * 14, text, "middle", 10));
    }
    /* the hand that moved flashes brass as the minute turns, and fades
       back as the first second goes: which ones moved, from the digits
       this face last showed (none the first time, nor on a redraw for an
       option) */
    /* the seconds start on the tens of hours' beam: H1's, or the lit
       one of its hands; with right-aligned hands, on its 0 always,
       stopping at the run's last tick, and leave the room alone */
    const [start, end] = hands === "right" ? [zero, last] : [h1, undefined];
    const tick = hub(face, { inline, every, start, end, r: inside ? r0 - 6 : 122 });
    return radar(face, { radar: sweeping, origin }, now => {
      for (const g of moved) g.classList.toggle("flash", now.sec < 1);
      tick(now);
    });
  };
}


/*
 * 4. Border: 22 even segments a quarter (a side of the square, a
 * quarter of the round), H H M M clockwise from the top. A digit's
 * units light their segments, centred in the 22 (auto margins): the
 * longest, 0, is 19 units, so there's always some margin
 *
 *   top:   ░░ ▓ ░ ▓▓▓ ░ ▓▓▓ ░ ▓▓▓ ░ ▓▓▓ ░░     1  .----
 *
 * The middle is left for stats or a chart: here a stand-in.
 */
const SEGMENTS = 22;
const GAP_FRAC = 0.22;   // of a cell: the gap left after each piece

/* a point a fraction t along quarter q of the border: an arc of the
   round from 10:30 for the top, or a side of the square */
function borderAt(round, q, t) {
  if (round) {
    const a = -3 * Math.PI / 4 + (q + t) * Math.PI / 2;
    return [C + 118 * Math.cos(a), C + 118 * Math.sin(a)];
  }
  const m = 12, L = SIZE - 2 * m;
  const corner = [[m, m], [SIZE - m, m], [SIZE - m, SIZE - m], [m, SIZE - m]][q];
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][q];
  return [corner[0] + dir[0] * t * L, corner[1] + dir[1] * t * L];
}

/* cells i to k (one, or a dash's three as one piece) of quarter q: a
   line or an arc, a small gap left after it */
function borderSeg(parent, round, q, i, k = i) {
  const a = i / SEGMENTS, b = (k + 1 - GAP_FRAC) / SEGMENTS;
  if (round) {
    const [sx, sy] = borderAt(round, q, a), [ex, ey] = borderAt(round, q, b);
    return node("path", { d: `M${sx} ${sy} A118 118 0 0 1 ${ex} ${ey}` }, parent);
  }
  const shift = GAP_FRAC / SEGMENTS / 2;
  const [sx, sy] = borderAt(round, q, a + shift), [ex, ey] = borderAt(round, q, b + shift);
  return node("path", { d: `M${sx} ${sy} L${ex} ${ey}` }, parent);
}

export function border(svg, { round, cut, numerals, keep, origin, radar: sweeping }, { stats }) {
  return digits => {
    const face = screen(svg, round);
    const seg = (q, i, k) => borderSeg(face, round, q, i, k);
    [...digits].forEach((digit, q) => {
      const code = codeOf(digit, { cut });
      const margin = Math.floor((SEGMENTS - span(code)) / 2);
      const lit = units(code);
      for (let i = 0; i < SEGMENTS; i++) {
        const j = i - margin;
        if (!lit.some(({ from, to }) => j >= from && j < to)) seg(q, i).setAttribute("class", "seg off");
      }
      const spare = spareOf(digit, keep);
      lit.forEach(({ mark, from, to }, k) => seg(q, margin + from, margin + to - 1).setAttribute("class", `seg ${kind(mark)}${spare(k) ? " spare" : ""}`));
    });

    /* the middle: what a face would show there, made up */
    const mid = node("g", { class: "middle" }, face);
    if (numerals) numeral(mid, C, C - 46, `${digits.slice(0, 2)}:${digits.slice(2)}`, "middle", 18);
    numeral(mid, C, C - 22, stats.day, "middle", 12);
    const bars = stats.week, w = 10, gap = 4, h = 36;
    const left = C - (bars.length * (w + gap) - gap) / 2;
    bars.forEach((v, i) => node("rect", { x: left + i * (w + gap), y: C + 22 - v * h, width: w, height: v * h, class: i === bars.length - 1 ? "bar today" : "bar" }, mid));
    numeral(mid, C, C + 36, stats.steps, "middle", 11);
    return radar(face, { radar: sweeping, origin }, () => { });
  };
}


/*
 * 5. Stroke numbers: the digits drawn by js/core/strokes.js, one to a
 * quarter, full or cut. The pen goes through all four in the minute,
 * as if they were keyed once, slowly, from :00 to :60: how much is
 * inked is how far the minute has gone. At the turn it starts over
 */
export function strokes(svg, { round, cut }) {
  return digits => {
    const face = screen(svg, round);
    const codes = [...digits].map(d => codeOf(d, { cut }));
    const { marks, letters, duration } = timeline([codes], { unit: 100, letter: 300, word: 700 });
    const size = round ? 80 : 104, q = round ? 42 : 58;
    /* always as text reads, left to right, line by line: these are
       numbers to read, 12 over 37, so the menu's order and origin
       (for the faces read round) leave them alone */
    const where = quarters({ order: "lines", origin: 9 });
    const drawn = [...digits].map((digit, i) => {
      const own = marks.slice(letters[i].first, letters[i].last + 1);
      const letter = createLetter((cut ? CUT_STROKES : STROKES)[digit], own);
      const [x, y] = where[i];
      const cx = C + x * q, cy = C + y * q;
      for (const [name, value] of Object.entries({ x: cx - size / 2, y: cy - size / 2, width: size, height: size })) letter.el.setAttribute(name, value);
      face.append(letter.el);
      return letter;
    });
    /* the last mark lands just before the minute does */
    return ({ sec }) => { for (const l of drawn) l.at(sec / 59.5 * duration); };
  };
}


/*
 * 6. Parachute: the time in words, "four thirty three", a word to a
 * ring from the inside out, each ring cut into gores like a canopy.
 * Each unit of a word's Morse is a gore: a dot lights one, a dash
 * three as one panel, the gaps between marks, letters (three) and the
 * word's end (seven, the seam where it starts again) are left plain.
 * A short word has fewer, wider gores; a long one more, narrower:
 *
 *                 ╭──────────────╮       outside: the seconds, a
 *              ╭──╯ T H I R T Y  ╰──╮    gore each, lit as the
 *              │   ╭── F O U R ──╮  │    minute goes
 *              │   │    (o/      │  │
 *
 * Read from the origin, clockwise. Always the twelve-hour clock, as
 * the time is said; on the hour it's "four o'clock", in the first ten
 * minutes "four oh five".
 */
const WORDS = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
  "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY"];
export function spoken(digits) {
  const h = +digits.slice(0, 2) % 12 || 12, m = +digits.slice(2);
  if (m === 0) return [WORDS[h], "O'CLOCK"];
  if (m < 10) return [WORDS[h], "OH", WORDS[m]];
  if (m < 20) return [WORDS[h], WORDS[m]];
  return [WORDS[h], TENS[Math.floor(m / 10)], WORDS[m % 10]].filter(Boolean);
}

/* a gore: the panel between radii r0 and r1, angles a0 to a1 */
function wedge(r0, r1, a0, a1) {
  const p = (r, a) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

export function parachute(svg, { round, numerals, inline, every, origin, radar: sweeping }) {
  return digits => {
    const face = screen(svg, round);
    const words = spoken(digits);
    const start = origin === 9 ? -Math.PI / 2 : 0;
    const inner = 26, outer = 104, gap = 4;
    const band = (outer - inner - gap * (words.length - 1)) / words.length;
    words.forEach((word, k) => {
      const r0 = inner + k * (band + gap), r1 = r0 + band;
      /* the word's units: each letter's marks, three between letters */
      const cells = [], letters = [];
      let at = 0;
      [...word].forEach((ch, j) => {
        if (j) at += 3;
        const code = codeOf(ch);
        for (const { mark: mk, from, to } of units(code)) cells.push({ mk, from: at + from, to: at + to });
        letters.push({ ch, mid: at + span(code) / 2 });
        at += span(code);
      });
      const n = at + 7, g = 2 * Math.PI / n, seam = Math.min(g * 0.15, 0.02);
      const angle = i => start + i * g;
      for (let i = 0; i < n; i++) {
        if (!cells.some(c => i >= c.from && i < c.to)) node("path", { d: wedge(r0, r1, angle(i) + seam, angle(i + 1) - seam), class: "gore" }, face);
      }
      for (const c of cells) node("path", { d: wedge(r0, r1, angle(c.from) + seam, angle(c.to) - seam), class: `m ${kind(c.mk)}` }, face);
      /* the letters, over their marks, as the canopy's diagram has them */
      if (numerals) for (const { ch, mid } of letters) {
        const a = angle(mid), r = (r0 + r1) / 2;
        numeral(face, C + r * Math.sin(a), C - r * Math.cos(a), ch, "middle", 8).classList.add("over");
      }
    });

    /* outside, the minute: sixty gores from twelve, lit a chunk a beat */
    const seconds = Array.from({ length: 60 }, (_, i) =>
      node("path", { d: wedge(110, 121, i * Math.PI / 30 + 0.012, (i + 1) * Math.PI / 30 - 0.012), class: "gore" }, face));
    const beat = keyOf(inline, face, C, C, inline ? 36 : 30);
    return radar(face, { radar: sweeping, origin }, now => {
      const lit = chunked(now.sec, every);
      seconds.forEach((s, i) => {
        s.classList.toggle("on", i < lit);
        s.classList.toggle("pulse", now.beat && i >= lit - every && i < lit);
      });
      beat(now.beat);
    });
  };
}


/*
 * 8. Tape, round: after the recorders that inked incoming code on a
 * moving paper strip, a pen line that steps for each mark. The time is
 * H H M M as it would be keyed: letters three units apart, the hours
 * and the minutes a word apart.
 */
const TAPE = { unit: 1, letter: 3, word: 7 };

/* the digits k minutes before these, on the same clock */
function minutesBefore(digits, k, h12) {
  const hh = +digits.slice(0, 2), mm = +digits.slice(2);
  const day = h12 ? 720 : 1440;
  const t = (((h12 ? hh % 12 : hh) * 60 + mm - k) % day + day) % day;
  const hours = h12 ? Math.floor(t / 60) || 12 : Math.floor(t / 60);
  return String(hours).padStart(2, "0") + String(t % 60).padStart(2, "0");
}

function traceOf(digits, cut) {
  const codes = [...digits].map(d => codeOf(d, { cut }));
  return timeline([codes.slice(0, 2), codes.slice(2)], TAPE);
}

/*
 * The siphon recorder's way: one pen line, round the border from
 * twelve, clockwise, a mark stepping in toward the middle. The minute's H H M M
 * is spread to go once round, so the pen is the second hand too: at
 * the turn it has just closed the circle. Then the line is wiped, from
 * twelve round (a moment, the first half second), and the next minute
 * is written from the top. The key in the middle keys the tape: down
 * while the pen writes a mark, up between, not on the beat.
 *
 *             ┌┐ ┌──┐ ┌──┐            the pen, at 20 s, a third of the
 *        ─┘└──    ...     ●          way round; the rest of the border
 *       │                            bare until it gets there
 *                (o/
 *
 * register: the older way, the Morse register's, an inked wheel that
 * touched the paper only while the key was down: no line, the marks
 * alone, the paper bare between. Laid out as the border face is, 22
 * cells a quarter, a digit centred in each, H H M M from the top, only
 * the marked cells drawn; the stylus rides the border once round in
 * the minute from the top quarter's start, inking each cell it enters,
 * and the key keys it.
 *
 *          ▪ ▬▬▬ ▬▬▬ ▬▬▬ ▬▬▬         1  .----, top, centred in its 22
 *        ▬                  ●       the stylus, writing 2
 */
const WIPE = 500;   // ms, the line wiped at the turn

export function tapeRound(svg, options) {
  return options.register ? registerFace(svg, options) : siphon(svg, options);
}

function registerFace(svg, { round, cut, numerals, inline, h12 }) {
  return digits => {
    const face = screen(svg, round);
    const N = 4 * SEGMENTS;
    /* the marks of a time, as cells round the border, 0 to 88 */
    const cellsOf = ds => [...ds].flatMap((digit, q) => {
      const code = codeOf(digit, { cut });
      const margin = Math.floor((SEGMENTS - span(code)) / 2);
      return units(code).map(({ mark: m, from, to }) => ({ q, m, from: q * SEGMENTS + margin + from, to: q * SEGMENTS + margin + to }));
    });
    const now = cellsOf(digits), before = cellsOf(minutesBefore(digits, 1, h12));
    const ink = node("g", { class: "register" }, face);
    const pen = node("circle", { r: 2.4, class: "pen" }, face);
    if (numerals) numeral(face, C, C - 30, `${digits.slice(0, 2)}:${digits.slice(2)}`, "middle", 14);
    const beat = keyOf(inline, face, C, C, inline ? 36 : 30);
    return ({ ms }) => {
      /* the stylus, in cells: wiping the minute before in the first
         half second, then writing this one */
      const wiping = ms < WIPE, cells = wiping ? before : now;
      const p = wiping ? ms / WIPE * N : Math.min(1, (ms - WIPE) / (59500 - WIPE)) * N;
      const here = Math.floor(p) + 1;
      ink.replaceChildren();
      for (const c of cells) {
        const a = wiping ? Math.max(c.from, here) : c.from, b = wiping ? c.to : Math.min(c.to, here);
        if (b > a) borderSeg(ink, round, c.q, a - c.q * SEGMENTS, b - 1 - c.q * SEGMENTS).setAttribute("class", `seg ${kind(c.m)}`);
      }
      const q = Math.min(3, Math.floor(p / SEGMENTS)), [x, y] = borderAt(round, q, p / SEGMENTS - q);
      pen.setAttribute("cx", x);
      pen.setAttribute("cy", y);
      beat(!wiping && cells.some(c => p >= c.from && p < c.to));
    };
  };
}

function siphon(svg, { round, cut, numerals, inline, h12 }) {
  return digits => {
    const face = screen(svg, round);
    const rb = round ? 116 : 118, h = 8;
    const at = (r, a) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
    /* the line from unit t0 to t1 of a trace that goes once round */
    const line = ({ marks, duration }, t0, t1) => {
      const ang = t => t / duration * 2 * Math.PI;
      const up = t => marks.some(m => t >= m.start && t < m.end);
      /* the points where it steps: each mark's ends, within t0 to t1 */
      const cuts = [t0, ...marks.flatMap(m => [m.start, m.end]).filter(t => t > t0 && t < t1), t1];
      let d = "", r = up(t0) ? rb - h : rb;
      cuts.forEach((t, k) => {
        if (!k) { d = `M${at(r, ang(t))}`; return; }
        /* along the border at this height, then step at the cut */
        const prev = cuts[k - 1], span = ang(t) - ang(prev);
        for (let a = ang(prev) + Math.PI / 2; a < ang(t); a += Math.PI / 2) d += ` A${r} ${r} 0 0 1 ${at(r, a)}`;
        if (span > 0) d += ` A${r} ${r} 0 0 1 ${at(r, ang(t))}`;
        if (k < cuts.length - 1) { r = up(t) ? rb - h : rb; d += ` L${at(r, ang(t))}`; }
      });
      return d;
    };
    const now = traceOf(digits, cut), before = traceOf(minutesBefore(digits, 1, h12), cut);
    node("circle", { cx: C, cy: C, r: rb, class: "rule thin faint" }, face);
    const ink = node("path", { class: "trace" }, face);
    const pen = node("circle", { r: 2.4, class: "pen" }, face);
    if (numerals) numeral(face, C, C - 30, `${digits.slice(0, 2)}:${digits.slice(2)}`, "middle", 14);
    const beat = keyOf(inline, face, C, C, inline ? 36 : 30);
    return ({ ms }) => {
      let trace = now, t0 = 0, t1;
      if (ms < WIPE) {
        /* the minute before, wiped from twelve round */
        trace = before; t0 = ms / WIPE * before.duration; t1 = before.duration;
      } else t1 = Math.min(1, (ms - WIPE) / (59500 - WIPE)) * now.duration;
      ink.setAttribute("d", t1 > t0 ? line(trace, t0, t1) : "");
      const a = (ms < WIPE ? t0 : t1) / trace.duration * 2 * Math.PI;
      /* the key keys the tape: down while the pen writes a mark, as the
         key on a line would be, not on the beat */
      const keyed = ms >= WIPE && trace.marks.some(m => t1 > m.start && t1 < m.end);
      const r = keyed ? rb - h : rb;
      pen.setAttribute("cx", C + r * Math.sin(a));
      pen.setAttribute("cy", C - r * Math.cos(a));
      beat(keyed);
    };
  };
}


/*
 * 9. Lamp, a feature for any face (the sheet's menu): the screen is
 * the lamp. At each turn of the minute, and whenever the wrist comes up
 * (the sheet's "raise"), the screen behind the marks flashes the time
 * once in brass at a readable speed (a unit of 120 ms, ten words a
 * minute), the face drawn over it as ever. Strongest on AMOLED, where
 * black is off; the nearest a face can come to the app's flash, since
 * a face can't buzz.
 */
const LAMP = { unit: 120, letter: 360, word: 840 };

/* lit(svg, digits, options, update) hands back update with the lamp
   added, under the face's marks */
export function lit(svg, digits, { cut }, update) {
  const face = svg.querySelector("g[clip-path]");
  const glow = node("rect", { x: 0, y: 0, width: SIZE, height: SIZE, class: "lampfill" });
  face.prepend(glow);
  const codes = [...digits].map(d => codeOf(d, { cut }));
  const { marks } = timeline([codes.slice(0, 2), codes.slice(2)], LAMP);
  return state => {
    const t = Math.min(state.ms, state.raised ?? Infinity);
    glow.classList.toggle("on", marks.some(m => t >= m.start && t < m.end));
    update(state);
  };
}


/*
 * 10. Tree, grid: the Morse tree as drawn on a panel (and on coins),
 * square, every step either along or down. The dot side runs right
 * from the root, the dash side left; a step that repeats the side's
 * first mark goes on outward, the other turns down. The ten digits
 * make a pair of combs, a stem for each:
 *
 *    0 ━ 9 ━ 8 ━ 7 ━ 6 ━ (o/ ─ 1 ─ 2 ─ 3 ─ 4 ─ 5    the top row: runs
 *                    ·    ━   ━   ━   ━              of a side's mark;
 *                ·   ·    ━   ━   ━                  the stems hang
 *            ·   ·   ·    ━   ━                      down from them
 *        ·   ·   ·   ·    ━
 *
 * In full, 1 .---- is a step right and four down; 6 -.... a step left
 * and four down; 5 and 0 run straight along the top. Cut, the combs
 * shorten: 6 to 9 stack in one column under T, 1 to 4 hang a step
 * under the dots. A step's mark sits on it, a dot or a bar; the time's
 * four routes are lit, the rest of the tree faint. The root (the key)
 * is the middle of the screen, the tree below it, the top half for
 * stats.
 */
const runOf = code => code.match(code[0] === "." ? /^\.+/ : /^-+/)[0].length;

export function treeGrid(svg, { round, cut, numerals, inline, every, keep }, { stats } = {}) {
  return digits => {
    const face = screen(svg, round);
    /* the root, the key, in the middle of the screen; the tree hangs
       below it and the top half is left for stats */
    const [gx, off, gy, top] = round ? [18, 14, 23, C] : [20, 16, 26, C];
    if (stats) standIn(face, C, C - 62, stats);
    const keyR = inline ? 18 : 15;
    /* where a code's node is: along by its first run, down by the rest */
    const pos = code => {
      if (!code) return [C, top];
      const run = runOf(code), x = run * gx + off;
      return [C + (code[0] === "." ? x : -x), top + (code.length - run) * gy];
    };
    const codes = [..."1234567890"].map(d => codeOf(d, { cut }));
    const prefixes = new Set(codes.flatMap(c => [...c].map((_, k) => c.slice(0, k + 1))));
    /* a step: its line (from the key's edge, off the root) and its mark */
    const step = (p, lit, spare) => {
      let [x0, y0] = pos(p.slice(0, -1));
      const [x1, y1] = pos(p);
      if (p.length === 1) x0 += Math.sign(x1 - x0) * keyR;
      const g = node("g", { class: lit ? "step lit-step" : "step" }, face);
      node("path", { d: `M${x0} ${y0} L${x1} ${y1}`, class: lit ? "route-line" : "rule thin faint" }, g);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, along = y0 === y1, m = p.at(-1);
      const el = m === "."
        ? node("circle", { cx: mx, cy: my, r: lit ? 3 : 2.2 }, g)
        : node("rect", along ? { x: mx - 5, y: my - 1.5, width: 10, height: 3 } : { x: mx - 1.5, y: my - 5, width: 3, height: 10 }, g);
      el.setAttribute("class", lit ? `m ${kind(m)}` : "glyph");
      if (lit && spare) { el.classList.add("spare"); g.classList.add("spare"); }
    };
    const shown = [...digits].map(d => codeOf(d, { cut }));
    for (const p of prefixes) if (!shown.some(c => c.startsWith(p))) step(p, false);
    /* lit: a step is spare (keep) only if it's spare for every digit
       that passes along it */
    for (const p of prefixes) {
      const through = [...digits].filter(d => codeOf(d, { cut }).startsWith(p));
      if (through.length) step(p, true, through.every(d => spareOf(d, keep)(p.length - 1)));
    }
    /* the digits' places: under a stem's foot, or above a run's end */
    [..."1234567890"].forEach((digit, i) => {
      const c = codes[i], [x, y] = pos(c);
      const label = numeral(face, x, y + (c.length > runOf(c) ? 11 : -10), digit, "middle", 9);
      if (digits.includes(digit)) label.classList.add("on");
    });
    /* the time in the gap under the key, between the two combs' first
       stems: HH over MM */
    if (numerals) {
      const below = top + keyR + (round ? 20 : 24), size = round ? 18 : 22;
      numeral(face, C, below, digits.slice(0, 2), "middle", size).classList.add("time");
      numeral(face, C, below + size * 1.15, digits.slice(2), "middle", size).classList.add("time");
    }
    const seconds = node("circle", { cx: C, cy: C, r: 122, class: "lit thin", pathLength: 60, transform: `rotate(-90 ${C} ${C})` }, face);
    const beat = keyOf(inline, face, C, top, 2 * keyR);
    return now => { grow(seconds, now, every); beat(now.beat); };
  };
}


/*
 * 11. Spiral: the time in words, as the parachute says it, written
 * along a spiral from the key outward, clockwise from the origin, the
 * way Morse is sometimes set round a disc: the turns close, the words
 * winding out as far as they go and the groove running on bare to the
 * rim. A dash is a stretch of the line, a dot a dot. Over the minute
 * the words are sent along it: what's to come dim, the mark going out
 * brass.
 *
 * inward: the other way, from the rim at the origin winding in to the
 * key, as a record plays; the bare groove is then the middle's.
 */
export function spiral(svg, { round, inline, every, origin, dots, inward, radar: sweeping }) {
  return digits => {
    const face = screen(svg, round);
    const words = spoken(digits);
    const { marks, duration } = timeline(words.map(w => [...w].map(ch => codeOf(ch))), TAPE);
    /* turns close together, as on a disc: the words wind out from the
       key as far as they go, and the spiral runs on to the rim bare, a
       groove, so its shape is the face's whatever the time comes to */
    const r0 = 24, R = 118, b = 10, u = 6.4, w = 4.6;
    const start = origin === 9 ? -Math.PI / 2 : 0;
    /* the spiral, walked in small steps: each point, its angle, and the
       length so far */
    const pts = [];
    for (let th = 0, s = 0, last = null; ; th += 0.004) {
      /* inward: from the rim, at the origin, winding in to the key */
      const r = inward ? R - b * th / (2 * Math.PI) : r0 + b * th / (2 * Math.PI), a = start + th;
      const p = [C + r * Math.sin(a), C - r * Math.cos(a), a];
      if (last) s += Math.hypot(p[0] - last[0], p[1] - last[1]);
      pts.push([...p, s]);
      last = p;
      if (r > R || r < r0) break;
    }
    /* the groove, the whole spiral, faint */
    let groove = "";
    for (let j = 0; j < pts.length; j += 6) groove += `${j ? "L" : "M"}${pts[j][0].toFixed(1)} ${pts[j][1].toFixed(1)}`;
    node("path", { d: groove, class: "rule thin faint" }, face);
    const index = s => { let j = 0; while (j < pts.length - 1 && pts[j + 1][3] < s) j++; return j; };
    const drawn = marks.map(({ start: s0, end: s1, mark: m }) => {
      if (m === ".") {
        const [x, y, a] = pts[index((s0 + s1) / 2 * u)];
        return dot(face, x, y, w, dots, a * 180 / Math.PI);
      }
      let d = "";
      for (let j = index(s0 * u); j < pts.length && pts[j][3] <= s1 * u; j += 3) d += `${d ? "L" : "M"}${pts[j][0].toFixed(1)} ${pts[j][1].toFixed(1)}`;
      return node("path", { d, class: "a dash", "stroke-width": w }, face);
    });
    const beat = keyOf(inline, face, C, C, inline ? 36 : 30);
    return radar(face, { radar: sweeping, origin }, now => {
      const t = Math.min(1, now.sec / 59.5) * duration;
      marks.forEach((m, j) => {
        drawn[j].classList.toggle("ahead", m.start > t);
        drawn[j].classList.toggle("now", t >= m.start && t < m.end);
      });
      beat(now.beat);
    });
  };
}


/*
 * 3d. Beams, words: the beams with the time in words, as the parachute
 * says it. A beam to a letter all round the face, clockwise from the
 * origin, each letter's marks from the inside out, and a bare beam
 * between words: many and fine, like the plaque's rays.
 *
 *        T W E L V E · T H I R T Y · S E V E N     round, from 9
 *
 * inward: each letter read from the outside in, its first mark at the
 * beam's outer end, the letters' names inside, by the key.
 *
 * ring: outward, round a wide middle, as on a sticker's wheel: the
 * middle's radius is the rim's less a Y (-.--, 13 units, as long as a
 * letter gets but J and Q, the same), so the longest letters just
 * reach the rim and the beams are only as long as they need be. The
 * letters' names stand round the inside of the ring. On the hour the
 * apostrophe of O'CLOCK (19 units) shrinks the unit to fit.
 */
export function wordBeams(svg, { round, numerals, inline, every, origin, dots, inward, ring, seconds = "outside", radar: sweeping }) {
  return digits => {
    const face = screen(svg, round);
    const rays = [];
    spoken(digits).forEach((word, k) => { if (k) rays.push(null); rays.push(...word); });
    const inside = seconds === "inside";
    const reach = inside && !ring ? 120 : 114;
    const longest = Math.max(...rays.filter(Boolean).map(ch => span(codeOf(ch))));
    const r0 = ring ? reach - 13 * 4.4 : 30;
    /* the longest, the apostrophe .----., is 19 units; ring: a Y's 13,
       unless the apostrophe's here */
    const u = ring ? (reach - r0) / Math.max(13, longest) : (reach - r0) / 19;
    const start = origin === 9 ? -Math.PI / 2 : 0;
    node("circle", { cx: C, cy: C, r: r0 - 6, class: "track thin" }, face);
    rays.forEach((ch, j) => {
      const a = start + (j + 0.5) * 2 * Math.PI / rays.length;
      const g = node("g", { class: "hand", transform: `rotate(${a * 180 / Math.PI - 90} ${C} ${C})` }, face);
      node("path", { d: `M${C + r0 - 6} ${C} H${C + 200}`, class: ch ? "rule thin" : "rule thin faint" }, g);
      if (!ch) return;
      const code = codeOf(ch);
      /* inward: the first mark at the outer end, reading in */
      for (const { mark: mk, from, to } of units(code)) {
        const x = inward ? C + reach - to * u : C + r0 + from * u;
        mark(g, mk, x, C - u / 2, (to - from) * u, u, dots);
      }
      if (numerals) {
        /* past the beam's last mark: outside it, or (inward) inside */
        const r = ring ? r0 - 14 : inward ? reach - span(code) * u - 8 : r0 + span(code) * u + 8;
        numeral(face, C + r * Math.sin(a), C - r * Math.cos(a), ch, "middle", 8);
      }
    });
    /* the seconds start on the first letter's beam */
    const first = start + Math.PI / rays.length;
    return radar(face, { radar: sweeping, origin }, hub(face, { inline, every, start: first, r: inside ? r0 - 6 : 122 }));
  };
}


/*
 * 12. Halftone: a disc of level lines, as a halftone screen draws one.
 * The left half of each line is solid; the right half, past a gap down
 * the middle, carries a letter of the time in words, then runs on
 * solid to the disc's edge, so the disc stays whole and the message
 * sits in it like a texture. A solid line between words, and a few at
 * the top and bottom, where the lines are too short for a letter:
 *
 *            ━━━━━━━ ━━━━━━━
 *        ━━━━━━━━━━━ ━ ━━━ ━━━ ━━━━━     T  -
 *       ━━━━━━━━━━━━ ▪ ━━━ ━━━ ━━━━━     W  .--
 *       ━━━━━━━━━━━━ ▪ ━━━━━━━━━━━━━     E  .
 *        ━━━━━━━━━━━ ...
 *
 * A letter's tail starts a letter's gap (three units) after it, and is
 * longer than any dash, so it doesn't read as one. Over the minute the
 * lines are sent top to bottom: those to come dim.
 */
export function halftone(svg, { round, dots }) {
  return digits => {
    const face = screen(svg, round);
    const rows = [];
    spoken(digits).forEach((word, k) => { if (k) rows.push(null); rows.push(...word); });
    const pad = 2, m = rows.length + 2 * pad;
    const R = round ? 112 : 118, step = 2 * R / m, h = step * 0.55, gap = 3;
    const yOf = i => C - R + step * (i + 0.5);
    const half = y => Math.sqrt(Math.max(0, R * R - (y - C) ** 2));
    /* the unit: as big as lets every letter, and its tail's gap, fit in
       its line's right half, and no thicker than a line and a half */
    let u = h * 1.6;
    rows.forEach((ch, j) => {
      if (!ch) return;
      const room = half(yOf(j + pad)) - gap - 1;
      u = Math.min(u, room / (span(codeOf(ch)) + 3 + 4));
    });
    const lines = [];
    for (let i = 0; i < m; i++) {
      const y = yOf(i), w = half(y), ch = rows[i - pad];
      const solid = (x0, x1) => x1 - x0 > 0.5 && node("rect", { x: x0, y: y - h / 2, width: x1 - x0, height: h, class: "solid" }, face);
      solid(C - w, C - gap);
      if (!ch) { solid(C + gap, C + w); lines.push([]); continue; }
      const code = codeOf(ch), x0 = C + gap;
      const marks = units(code).map(({ mark: mk, from, to }) => mark(face, mk, x0 + from * u, y - h / 2, (to - from) * u, h, dots));
      const tail = solid(x0 + (span(code) + 3) * u, C + w);
      lines.push(tail ? [...marks, tail] : marks);
    }
    return ({ sec }) => {
      const sent = Math.min(1, sec / 59.5) * m;
      lines.forEach((els, i) => els.forEach(el => el.classList.toggle("ahead", i > sent)));
    };
  };
}

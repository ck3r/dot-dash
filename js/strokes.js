/*
 * ============================================================
 * STROKES — letters drawn by the marks that spell them
 * ============================================================
 *
 * Each character is its pen strokes, in the order they're
 * written, and its marks lie along those strokes in the same
 * order. So the code reads off the letter as a hand would draw it:
 *
 *      /\          A  .-
 *     /  █         stroke 1, down the left: the dot
 *    ■----█        stroke 2, down the right: the dash
 *   /      █       stroke 3, the bar: nothing on it
 *
 * A stroke with several marks has them as substrokes, stretches of
 * the same path (the three dashes of O go round one loop). A stroke
 * with none is only ever the thin line.
 *
 * The data is just where each substroke is centred, as a fraction
 * of its stroke:
 *
 *   ["M50 0 L8 100", .6]     one mark, 60% of the way along
 *   ["M23 65 H77"]           none
 *
 * Which mark it is comes from the code, and how long it is comes
 * from the mark, so a dash is always three dots, as it is in time.
 * That also keeps the pen at one speed through a letter. (A letter
 * with more code than line shrinks all its marks: see tight.)
 *
 * Three layers, and only the top one moves:
 *
 *   the thin letter    a scaffold, always there; grey, then paper
 *                      once the whole letter is keyed (class "keyed")
 *   grey substrokes    the marks to come
 *   coloured           the same again, filling along the pen's
 *                      path while that mark sounds
 *
 *   createLetter(strokes, marks)     marks: from timeline(), with
 *     el                             start, end and mark (. or -)
 *     at(ms)                         fill to this moment
 */

export const WEIGHT = 22;   // a substroke's width: a dot comes out square
export const DOT = WEIGHT;
export const DASH = 3 * DOT;

/* Every letter sits on the same 100 × 100 grid, like the site's
   monospace, with room left for the weight around it */
const BOX = "-14 -14 128 128";


/* Some codes are longer than their letter: the five dashes of 0 won't
   go round its ring at full size. Those marks all shrink together,
   so a dash is still three dots */
const tight = (scale, strokes) => Object.assign(strokes, { scale });

/* The numbers run longer still, and curl tighter, so as a family they
   are drawn finer: length and width together, so a dot stays square.
   1 has the most line to fill and takes a little off its lengths too */
const FIGURE = 15 / WEIGHT;
const figure = (strokes, scale = FIGURE) => Object.assign(strokes, { scale, weight: FIGURE * WEIGHT });

/* Any other size and weight, set by eye in the editor
   (/design/strokes/edit/), which writes these lines */
const sized = (scale, weight, strokes) => Object.assign(strokes, { scale, weight });

const RING = "M50 0 A40 50 0 1 0 50 100 A40 50 0 1 0 50 0";
const STEM = "M18 0 V100";                                  // B D
const UPPER = "M18 0 H50 A25 25 0 0 1 50 50 H18";           // B
const LOWER = "M18 50 H55 A25 25 0 0 1 55 100 H18";         // B
const ZERO = "M50 0 A38 50 0 1 0 50 100 A38 50 0 1 0 50 0";
const TWO = "M14 26 C14 8 32 0 50 0 C70 0 86 12 86 28 C86 44 70 56 12 100";
const THREE = "M44 42 C70 38 90 50 90 70 C90 90 70 100 50 100 C36 100 22 96 12 84";
const FIVE = "M24 50 C32 42 42 38 52 38 A31 31 0 0 1 52 100 C38 100 26 94 20 84";
const SIX = "M70 0 C44 14 20 40 20 70 A30 30 0 1 0 80 70 A30 30 0 1 0 20 70";
const EIGHT = "M50 0 C30 0 20 12 20 24 C20 38 34 44 50 50 C68 56 82 62 82 76 C82 90 68 100 50 100 C32 100 18 90 18 76 C18 62 32 56 50 50 C66 44 80 38 80 24 C80 12 70 0 50 0";
const NINE = "M76 30 A30 30 0 1 0 16 30 A30 30 0 1 0 76 30";
const TAIL = "M76 30 C76 62 66 84 44 104";

export const STROKES = {
  A: [["M50 0 L8 100", .548], ["M50 0 L92 100", .53], ["M23 65 H77"]],
  B: [[STEM, .358, .847], [UPPER, .488], [LOWER, .507]],
  C: [["M86 18 A42 50 0 1 0 86 82", .182, .423, .667, .915]],
  D: [[STEM, .5], ["M18 0 H38 A50 50 0 0 1 38 100 H18", .3, .7]],
  E: [["M20 0 V100", .25], ["M20 0 H82"], ["M20 50 H72"], ["M20 100 H82"]],
  F: [["M20 0 V100", .275, .75], ["M20 0 H92", .5], ["M20 50 H80", .6]],
  G: [["M86 18 A42 50 0 1 0 96 50", .275, .717], ["M56 50 H96", .51]],
  H: [["M16 0 V100", .25, .75], ["M84 0 V100", .25, .75], ["M16 50 H84"]],
  I: [["M50 0 V100", .27, .73], ["M20 0 H80"], ["M20 100 H80"]],
  J: sized(.7, 16.5, [["M76 0 V64 A36 36 0 1 1 4 64", .049, .262, .568, .869]]),
  K: sized(1, 19.5, [["M18 0 V100", .5], ["M82 0 L18 62", .337], ["M34 46 L86 100", .502]]),
  L: [["M22 0 V100", .12, .63], ["M22 100 H90", .4, .82]],
  M: [["M12 0 V100", .5], ["M88 0 V100", .5], ["M12 0 L50 72"], ["M88 0 L50 72"]],
  N: [["M14 0 V100", .5], ["M86 0 V100", .5], ["M14 0 L86 100"]],
  O: [[RING, .17, .5, .83]],
  P: [["M20 0 V100", .14, .635], ["M20 0 H52 A28 28 0 0 1 52 56 H20", .372, .763]],
  Q: [[RING, .14, .42, .82], ["M50 60 L96 110", .5]],
  R: [["M20 0 V100", .267], ["M20 0 H52 A27 27 0 0 1 52 54 H20", .402], ["M48 54 L90 100", .548]],
  S: [["M86 16 C76 4 62 0 50 0 C30 0 14 10 14 26 C14 42 30 47 50 50 C70 53 86 58 86 74 C86 90 70 100 50 100 C38 100 24 96 14 84", .16, .5, .84]],
  T: [["M50 0 V100", .5], ["M12 0 H88"]],
  U: [["M14 0 V62 A36 38 0 0 0 86 62", .2, .66], ["M86 0 V100", .4]],
  V: [["M10 0 L50 100", .12, .48, .84], ["M90 0 L50 100", .4]],
  W: [["M0 0 L25 100", .215], ["M50 0 L25 100", .42], ["M50 0 L75 100"], ["M100 0 L75 100", .42]],
  X: tight(.8, [["M6 0 L94 100", .2, .8], ["M94 0 L6 100", .2, .8]]),
  Y: sized(.66, 19.5, [["M14 0 L60 50", .375], ["M90 0 L30 100", .088, .398, .813]]),
  Z: [["M12 0 H88", .5], ["M88 0 L12 100", .5], ["M12 100 H88", .202, .775]],
  1: figure([["M50 0 L16 30", .703], ["M50 0 V100", .25, .683], ["M6 100 H94", .25, .75]], .576),
  2: figure([[TWO, .147, .335, .583, .842], ["M12 100 H88", .704]]),
  3: figure([["M16 0 H80 L44 42", .123, .41, .937], [THREE, .343, .77]]),
  4: figure([["M24 0 V56", .2, .778], ["M24 56 H96", .847], ["M64 0 V100", .1, .775]]),
  5: figure([["M24 0 V50", .22, .85], [FIVE, .48, .908], ["M24 0 H78", .861]]),
  6: figure([[SIX, .125, .31, .463, .65, .79]]),
  7: figure([["M0 0 H100", .245, .735], ["M100 0 L38 100", .3, .59, .877]]),
  8: figure([[EIGHT, .065, .25, .428, .62, .9]]),
  9: figure([[NINE, .13, .4, .67], [TAIL, .335, .803]]),
  0: figure([[ZERO, .1, .3, .5, .7, .9]]),
};

/* The numbers as cut for contests (CUT in morse.js). Fewer marks, so
   they're back at full size; 4 and 6 have nothing to cut */
export const CUT_STROKES = {
  1: [["M50 0 L10 36", .75], ["M50 0 V100", .55], ["M6 100 H94"]],
  2: [[TWO, .09, .33, .76], ["M12 100 H88"]],
  3: [["M16 0 H80 L44 42", .1, .39, .86], [THREE, .5]],
  4: STROKES[4],
  5: [["M24 0 V50", .5], [FIVE], ["M24 0 H78"]],
  6: STROKES[6],
  7: [["M0 0 H100", .5], ["M100 0 L38 100", .3, .6, .88]],
  8: [[EIGHT, .25, .6, .9]],
  9: [[NINE, .42], [TAIL, .8]],
  0: [[ZERO, .5]],
};


const NS = "http://www.w3.org/2000/svg";

function shape(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  parent?.append(node);
  return node;
}

/* Where each mark lies, in the code's order: its stroke's path and
   the stretch of it, in grid units along the pen's way (x, y: the
   stretch's middle) */
export function substrokes(strokes, code) {
  const out = [];
  const scale = strokes.scale ?? 1;
  for (const [d, ...middles] of strokes) {
    const path = shape("path", { d });
    const length = path.getTotalLength();
    for (const middle of middles) {
      const mark = code[out.length];
      const half = scale * (mark === "." ? DOT : DASH) / 2;
      const { x, y } = path.getPointAtLength(middle * length);
      out.push({ d, mark, length, x, y, from: middle * length - half, to: middle * length + half });
    }
  }
  return out;
}

/* round: dots as circles, for where colour can't tell the marks apart.
   Slightly over the weight, as a square that size is the bigger shape */
export const ROUND = 1.12;

let wipes = 0;   // each circle's mask needs an id of its own on the page

export function createLetter(strokes, marks, { round = false } = {}) {
  const el = shape("svg", { viewBox: BOX, class: "stroked", "aria-hidden": "true" });
  const scaffold = shape("g", { class: "scaffold" }, el);
  const grey = shape("g", { class: "grey" }, el);
  const fill = shape("g", { class: "fill" }, el);
  const weight = strokes.weight ?? WEIGHT;
  const radius = ROUND * weight / 2;

  for (const [d] of strokes) shape("path", { d }, scaffold);
  /* the thin letter inked as the pen goes: paper over the scaffold,
     uncovered along each stroke in step with the marks (pen, below).
     A mask does the uncovering, a band along the stroke in the
     letter's own units (the hairline keeps one width on screen, and
     a dash pattern on it would too, so it can't be the measure); a
     mask a stroke, so a band never shows a stroke it crosses */
  const ink = shape("g", { class: "ink" });
  el.insertBefore(ink, grey);   // over the scaffold, under the marks
  const inkDefs = shape("defs", {}, el);
  const inked = strokes.map(([d]) => {
    const id = `ink-${++wipes}`;
    const mask = shape("mask", { id, maskUnits: "userSpaceOnUse", x: -14, y: -14, width: 128, height: 128 }, inkDefs);
    const band = shape("path", { d, fill: "none", stroke: "white", "stroke-width": 6, "stroke-dasharray": "0 9999" }, mask);
    shape("path", { d, mask: `url(#${id})` }, ink);
    return { band, length: band.getTotalLength() };
  });

  /* the dash pattern is the fill: one dash as long as the mark has
     got to, slid along to where the mark starts */
  const stretch = (group, { d, from, to }, cls) => {
    const path = shape("path", { d, class: cls, "stroke-width": weight, "stroke-dashoffset": -from }, group);
    path.setAttribute("stroke-dasharray", `${to - from} 9999`);
    return path;
  };
  const disc = (group, { x, y }, cls) => shape("circle", { cx: x, cy: y, r: radius, class: cls }, group);
  const defs = round ? shape("defs", {}, el) : null;

  const parts = substrokes(strokes, marks.map(m => m.mark).join("")).map((sub, i) => {
    /* a circle fills the way the pen goes too: wiped in along its
       stroke, behind a band as wide as the circle that runs across it

         ( ░░ )  →  (█░░ )  →  (███ )        the band's front edge,
                                             square to the stroke   */
    if (round && sub.mark === ".") {
      disc(grey, sub);
      const id = `wipe-${++wipes}`;
      const mask = shape("mask", { id, maskUnits: "userSpaceOnUse", x: -14, y: -14, width: 128, height: 128 }, defs);
      const across = 2 * radius + 4;        // a little over: the front edge squares off a curve
      const band = shape("path", { d: sub.d, stroke: "white", "stroke-width": across, "stroke-dashoffset": -((sub.from + sub.to) / 2 - across / 2) }, mask);
      const circle = disc(fill, sub, "dot");
      circle.setAttribute("mask", `url(#${id})`);
      return { mark: marks[i], show: done => band.setAttribute("stroke-dasharray", `${across * done} 9999`) };
    }
    stretch(grey, sub);
    const path = stretch(fill, sub, sub.mark === "." ? "dot" : "dash");
    return { mark: marks[i], show: done => path.setAttribute("stroke-dasharray", `${(sub.to - sub.from) * done} 9999`) };
  });

  /*
   * The pen: how far along the whole letter (its strokes end to end)
   * it has got at each moment. A mark sounding: everything up to it
   * lit at once, as it starts, then inked along with it. In a gap it
   * waits (the line between marks isn't timed: its length has nothing
   * to do with the gap's). The line after the last mark (A's bar)
   * lights as the letter ends.
   *
   *   A   ·          down the left to the dot, lit; the dot inks
   *       (gap)      waits
   *       ─          on to the dash, lit; the dash inks
   *       end        the bar, lit
   */
  const before = [];   // where each stroke starts, along the letter
  let total = 0;
  for (const { length } of inked) { before.push(total); total += length; }
  const strokeOf = strokes.flatMap(([, ...middles], k) => middles.map(() => k));   // each mark's stroke
  const along = substrokes(strokes, marks.map(m => m.mark).join("")).map((sub, i) => ({
    ...marks[i],
    from: before[strokeOf[i]] + Math.max(0, sub.from),
    to: before[strokeOf[i]] + Math.min(sub.length, sub.to)
  }));

  /* when the last mark ends, not the moment after: the letter lands on
     the end of its sound. Scrubbed back, it's unfinished again */
  const end = marks[marks.length - 1].end;
  const pen = ms => {
    if (ms >= end) return total;
    const m = along.findLast(m => ms >= m.start);
    if (!m) return 0;
    return m.from + (m.to - m.from) * Math.min(1, (ms - m.start) / (m.end - m.start));
  };

  /* played through to its end (not just drawn finished, as it's made
     or redrawn): a "keyed" event, bubbling, for the page to mark it */
  let was = null;
  return {
    el,
    at(ms) {
      for (const { mark, show } of parts) {
        show(Math.min(1, Math.max(0, (ms - mark.start) / (mark.end - mark.start))));
      }
      const p = pen(ms);
      inked.forEach(({ band, length }, k) => band.setAttribute("stroke-dasharray", `${Math.min(length, Math.max(0, p - before[k]))} 9999`));
      el.classList.toggle("keyed", ms >= end);
      if (was !== null && was < end && ms >= end) el.dispatchEvent(new Event("keyed", { bubbles: true }));
      was = ms;
    },
  };
}

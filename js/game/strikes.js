/*
 * Strikes, counted in thirds: three whole ones and the run is over.
 *
 *   ▓▓▓ ▓░░ ░░░      one and a third of three
 *
 * What costs a strike, and how much, is each game's own rule; this
 * only counts them, fills the boxes, and buzzes a phone that can
 * (eyes are on the road, not on the boxes): short for a part of one,
 * longer for a whole one.
 *
 *   createStrikes({ element }) → {
 *     add(thirds)     so many more; true if that makes three
 *     heal(thirds)    so many back (never under none)
 *     reset()
 *     any()           is there one, or part of one
 *     out()           three
 *     said()          "1⅓", for "1⅓ of 3"
 *   }
 *
 * element: a box for each strike (its children), each filled by --fill.
 */
const THIRD = ["", "⅓", "⅔"];

export function createStrikes({ element }) {
  const boxes = [...element.children];
  const full = boxes.length * 3;
  let thirds = 0;

  const said = () => `${Math.floor(thirds / 3) || (thirds % 3 ? "" : "0")}${THIRD[thirds % 3]}`;

  function show() {
    for (const [i, box] of boxes.entries()) box.style.setProperty("--fill", Math.min(1, Math.max(0, thirds / 3 - i)));
    element.setAttribute("aria-label", `${said()} of ${boxes.length} strikes`);
  }

  const set = next => { thirds = Math.min(full, Math.max(0, next)); show(); };

  return {
    add(n) {
      set(thirds + n);
      if (n > 0) try { navigator.vibrate?.(n >= 3 ? 90 : 35); } catch { /* not allowed just now */ }
      return thirds >= full;
    },
    heal(n) { set(thirds - n); },
    reset() { set(0); },
    any: () => thirds > 0,
    out: () => thirds >= full,
    said,
  };
}

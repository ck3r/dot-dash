/*
 * A win, said in Morse: V, ...- (victory), keyed once on the results'
 * border, brass while each mark is down, and in the tab's title as the
 * station keys a message (js/shared/tab-keyer.js), the page's own
 * title back after. The border stays brass: it was a win.
 *
 *   border   ▮ ▮ ▮ ▮▮▮        then brass, steady
 *   title    E  I  S  V       then "key hero · dot-da.sh"
 *
 *   const win = createWin({ frame });
 *   win.key()     a run won: key it
 *   win.rest()    a new run: the border back to grey, the title its own
 *
 * Reduced motion: no keying; the border brass at once, the title as it was.
 */
import * as keyer from "../shared/tab-keyer.js";

const V = "...-";
const UNIT_MS = 110;            // about 11 wpm: slow enough to read on a border
const TITLE_BACK_MS = 1500;     // the last guess (V) held a moment

export function createWin({ frame }) {
  const own = document.title;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let timers = [], back = null, keying = false;

  /* the tab: back to the page's own title whenever it's done keying,
     and whenever the keyer has had its say (hidden, it says the
     site's name: a game's tab keeps its own) */
  keyer.on(event => {
    if (event.type === "start") clearTimeout(back);
    if (event.type === "end") back = setTimeout(() => { document.title = own; keying = false; }, keying ? TITLE_BACK_MS : 0);
  });

  function rest() {
    timers.forEach(clearTimeout);
    timers = [];
    clearTimeout(back);
    if (keying) document.title = own;
    keying = false;
    frame.classList.remove("won", "mark", "keying");
  }

  function key() {
    rest();
    frame.classList.add("won");
    if (still.matches) return;
    keying = true;
    keyer.play([[V]]);
    /* the border: each mark down for its length, a unit apart */
    frame.classList.add("keying");      // grey between the marks, so they read
    let t = 0;
    for (const m of V) {
      const len = m === "." ? 1 : 3;
      timers.push(setTimeout(() => frame.classList.add("mark"), t * UNIT_MS));
      timers.push(setTimeout(() => frame.classList.remove("mark"), (t + len) * UNIT_MS));
      t += len + 1;
    }
    timers.push(setTimeout(() => frame.classList.remove("keying"), (t + 2) * UNIT_MS));
  }

  return { key, rest };
}

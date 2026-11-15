/*
 * The station's own boxes, in a game: ticked here as they were left
 * there, and the other way round (the same keys in storage).
 *
 *   ctrl     the Ctrl keys as paddles (a VBand adapter)
 *   mouse    its buttons as the keys, left dit and right dah
 *   color    dots red, dashes blue (on unless it's been turned off)
 *   invert   the light theme, the same instrument printed on paper
 *
 *   createLook({ ctrl, mouse, color, theme }) → { ctrl(), mouse() }
 *
 * The four are the tick boxes; what comes back says whether the two
 * that change the keys are ticked (paddles.js asks).
 */
import { keep, keptBox } from "./store.js";

export function createLook({ ctrl, mouse, color, theme }) {
  const look = () => {
    document.body.classList.toggle("signal", color.checked);
    document.documentElement.classList.toggle("light", theme.checked);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.checked ? "#ebe5d7" : "#1c1916");
  };
  keptBox(color, "dot-dash:signal", { fallback: true, change: look });
  /* the theme is kept by name, and the page's head has set it already */
  theme.checked = document.documentElement.classList.contains("light");
  theme.addEventListener("change", () => { look(); keep("dot-dash:theme", theme.checked ? "light" : "dark"); theme.blur(); });
  look();
  return {
    ctrl: keptBox(ctrl, "dot-dash:tx-ctrl-keys"),
    mouse: keptBox(mouse, "dot-dash:tx-mouse-key"),
  };
}

/*
 * ============================================================
 * THE POP-OUT — a small window on top of the others
 * ============================================================
 *
 * Document Picture-in-Picture (Chrome and Edge; elsewhere, no button):
 * the code going out, its character large, the switch, play and how
 * far. Leave the tab and it keeps up. The station's player (js/station/
 * pip.js) and the extension's card (apps/extension/card.js) both open
 * it, so it's one look and one reading of the message:
 *
 *     ╭────────────────────────────╮
 *     │           -.-.             │
 *     │            C               │
 *     │  o/  ▷ 00:05/00:31 ━━┃──── │
 *     ╰────────────────────────────╯
 *
 * The extension can't import (its card is handed to the page whole),
 * so apps/extension/copies.cjs copies this file in, its background
 * hands the card PIP_CSS and PIP_BODY, and the card keeps its own
 * copies of the three functions below, word for word:
 * tests/pip-same.cjs fails the moment they differ. Change one, change
 * the other.
 *
 * No imports, nothing from a page at import: the extension's
 * background (a service worker) loads it too.
 */

export const PIP_CSS = `
  /* the station's colours: dark, or printed on paper (invert); the
     dits and dahs in theirs, or in paper (color off) */
  .card, body { --bk: #1c1916; --pa: #e9e3d5; --gr: #8c857a; --wi: #4a443c; --br: #d6a650; --dot: #e2604f; --dash: #6ea8e0; }
  .card.light, body.light { --bk: #ebe5d7; --pa: #1f1b17; --gr: #6d665b; --wi: #c2baab; --br: #9a6a12; --dot: #c4412e; --dash: #2b69ad; }
  .card.plain, body.plain { --dot: var(--pa); --dash: var(--pa); }
  body { margin: 0; background: var(--bk); color: var(--pa); font: 13px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
    display: grid; grid-template-rows: 1fr auto; height: 100vh; box-sizing: border-box; border: 1px solid var(--wi); overflow: hidden; }
  body.down { border-color: var(--br); box-shadow: inset 0 0 22px rgba(214,166,80,.18); }
  .now { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 0; }
  /* the window can be dragged bigger: the code and its character grow with it */
  .code { font-size: clamp(22px, 11vmin, 72px); letter-spacing: 2px; min-height: 1.3em; white-space: pre; }
  .dot { color: var(--dot); } .dash { color: var(--dash); }
  .ch { font-size: clamp(54px, 30vmin, 240px); font-weight: 700; line-height: 1; min-height: 1em; }
  .ch.gap { color: var(--gr); font-weight: 400; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; }
  svg.sw { width: 26px; height: 28px; flex: none; overflow: visible; color: var(--pa); }
  .arm { transform-box: view-box; transform-origin: 16.02px 47.22px; transform: rotate(-30deg); }
  .down .arm { transform: none; } .led { fill: transparent; } .down .led { fill: var(--br); }
  button { font: inherit; color: var(--pa); background: none; border: 0; padding: 0; cursor: pointer; display: inline-flex; }
  button svg { width: 18px; height: 18px; }
  .play { width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; }
  .play:focus-visible { outline: 1px solid var(--br); }
  body:not(.lamp) { cursor: pointer; }
  .bars, .on .tri { display: none; } .on .bars { display: block; }
  .time { color: var(--gr); font-size: 12px; font-variant-numeric: tabular-nums; }
  .track { flex: 1; height: 1px; background: var(--wi); position: relative; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--pa); }
  .head { position: absolute; top: -8px; width: 4px; height: 17px; border-radius: 2px; background: var(--br); margin-left: -2px; }
  .hint { display: none; }

  /* the signal lamp (light: lamp), as the station's (station.css
     .lamp): true black between marks, the dark theme's paper lit,
     whatever the theme; the code and its character barely there */
  body.lamp { --off: #000; --on: #e9e3d5; background: var(--off); border-color: var(--off); box-shadow: none; cursor: pointer;
    color: color-mix(in srgb, var(--on) 16%, var(--off)); user-select: none; }
  body.lamp.down { --lit: color-mix(in srgb, var(--on) 85%, var(--off)); background: var(--lit); border-color: var(--lit);
    color: color-mix(in srgb, var(--off) 14%, var(--lit)); }
  body.lamp .dot, body.lamp .dash, body.lamp .ch.gap { color: inherit; }
  body.lamp .bar { display: none; }
  body.lamp .hint { display: block; text-align: center; font-size: 11px; margin: 0; padding: 0 0 8px; }
`;

export const PIP_BODY = `
  <div class="now"><div class="code"></div><div class="ch"></div></div>
  <div class="bar">
    <svg class="sw" viewBox="0 0 73 79" fill="none" aria-hidden="true">
      <circle cx="13.66" cy="52.81" r="7" stroke="currentColor" stroke-width="6"/>
      <rect class="arm" x="16.02" y="47.22" width="56" height="7" rx="3.5" fill="currentColor"/>
      <circle class="led" cx="13.66" cy="52.81" r="3.6"/>
    </svg>
    <button class="play" aria-label="play">
      <svg class="tri" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5Z"/></svg>
      <svg class="bars" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z"/></svg>
    </button>
    <span class="time"></span>
    <span class="track"><span class="fill"></span><span class="head"></span></span>
  </div>
  <p class="hint">click to play or pause</p>`;

/* the window, filled: its title, its classes (light, plain, lamp),
   the look and the markup */
function fillPip(pip, { title, classes, css, body }) {
  const d = pip.document;
  d.title = title;
  for (const [name, on] of Object.entries(classes)) d.body.classList.toggle(name, !!on);
  try {
    const sheet = new pip.CSSStyleSheet();
    sheet.replaceSync(css);
    d.adoptedStyleSheets = [sheet];
  } catch {
    const style = d.createElement("style");
    style.textContent = css;
    d.head.append(style);
  }
  d.body.innerHTML = body;
  return d;
}

/*
 * What the pop-out shows at pos: the character sounding, held
 * through the letter gap after it, so it reads steadily; but a "/"
 * through a word gap, and nothing through the gap between two of
 * the same, so SEE flashes E, blank, E, not one long E. Cells are
 * { start, end, code, ch, word }, in any one unit (pos in the same).
 *
 *    S   gap  E   gap      E   word gap   N
 *   [S] [S]  [E] [ ]      [E]  [ / ]     [N]
 */
function pipShows(cells, pos, started) {
  if (!started) return null;
  const i = cells.findIndex(c => pos < c.end);
  if (i < 0) return cells[cells.length - 1] ?? null;               // done: the last stays
  const c = cells[i], prev = cells[i - 1];
  if (pos >= c.start || !prev) return pos >= c.start ? c : null;   // sounding, or not yet begun
  if (prev.word !== c.word) return "/";
  if (prev.code === c.code) return null;
  return prev;
}

/* drawn: what pipShows said, playing or not, the time, how far (0–1),
   the key down or up */
function drawPip(d, shows, { playing, time, done, down }) {
  const cell = typeof shows === "object" ? shows : null;
  d.querySelector(".ch").classList.toggle("gap", shows === "/");
  const code = d.querySelector(".code");
  code.textContent = "";
  for (const run of (cell?.code ?? "").split(/(\.+|-+)/)) {
    if (!run) continue;
    const span = d.createElement("span");
    span.className = run[0] === "." ? "dot" : "dash";
    span.textContent = run;
    code.append(span);
  }
  d.querySelector(".ch").textContent = shows === "/" ? "/" : cell?.ch ?? "";
  d.querySelector(".play").classList.toggle("on", playing);
  d.querySelector(".time").textContent = time;
  const pct = Math.min(100, done * 100) + "%";
  d.querySelector(".fill").style.width = pct;
  d.querySelector(".head").style.left = pct;
  if (down !== undefined) d.body.classList.toggle("down", down);
}

export { fillPip, pipShows, drawPip };

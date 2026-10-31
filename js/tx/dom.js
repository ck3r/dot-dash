/*
 * Small DOM helpers, shared by the station's modules.
 *
 *   $(selector)                 the first match, or null
 *   el(tag, className, text)    a new element
 *   icon(name)                  an icon from the sprite in index.html, as markup
 *   toast(msg, {ms, action})    a short note over the message, for a moment
 *                               (action: [label, fn], a button in it)
 *   flash(part, word)           a moment's word over the part tapped
 *   nearest(items, x, y)        the item a held finger is on, or nearest it
 */
export const $ = s => document.querySelector(s);

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/*
 * A held menu (the keyboard's fan, the quick lists): the finger
 * slides along it like the scrub bar's playhead, and the item it's
 * on, or nearest (past either end: the end one), is the one picked.
 * A row is read by its columns, so a finger drifting off it up or
 * down still picks along it; a list that wraps, by its rows too.
 *
 *    ┌────┬────┬─────┬────┐
 *    │ off│tone│sound│ …  │     ← nearest the finger: lit
 *    └────┴────┴──▲──┴────┘
 *                 ● the finger, anywhere below
 */
export function nearest(items, x, y) {
  let best = null, bestD = Infinity;
  for (const i of items) {
    const r = i.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = dy * 1e4 + dx;   // the row first, then along it
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/*
 * A moment's word over the part tapped ("copied", "soon", "hidden"):
 * one tip for the page, fixed on top of everything, so nothing near
 * the part (the tree, ↵, a scrolled edge) can cover or clip it. The
 * part keeps data-flash while it shows, saying what it said.
 *
 *     3 chars ┌──────┐
 *     3 words │copied│   centred on the part, over its neighbours
 *             └──────┘
 */
export function flash(part, word, ms = 1200) {
  let tip = $("#flash-tip");
  if (!tip) {
    tip = el("span", "flash-tip");
    tip.id = "flash-tip";
    tip.setAttribute("role", "status");
    document.body.append(tip);
  }
  const r = part.getBoundingClientRect();
  tip.textContent = word;
  tip.style.left = `${r.left + r.width / 2}px`;
  tip.style.top = `${r.top + r.height / 2}px`;
  tip.hidden = false;
  part.dataset.flash = word;
  clearTimeout(flash.timer);
  if (flash.part && flash.part !== part) delete flash.part.dataset.flash;
  flash.part = part;
  flash.timer = setTimeout(() => { tip.hidden = true; delete part.dataset.flash; }, ms);
}

/*
 * A short note, in the middle of the message (what's on screen of
 * it): clear of the top bar, and of the brass line a pull at the
 * top of the history runs along.
 *
 *   ┌ message ──────────────┐
 *   │━━━━━━━━               │   the pull's line, still in sight
 *   │      ┌──────────┐     │
 *   │      │  copied  │     │
 *   │      └──────────┘     │
 *   └───────────────────────┘
 */
export function toast(msg, { ms = 1800, action = null } = {}) {
  const t = $("#toast");
  t.textContent = msg;
  /* one thing to do about it (a link's settings: keep) */
  if (action) {
    const [label, act] = action;
    const b = el("button", "toast-act", label);
    b.type = "button";
    b.addEventListener("click", () => { t.hidden = true; act(); });
    t.append(" ", b);
  }
  t.classList.toggle("acts", !!action);
  const field = $(".field")?.getBoundingClientRect();
  if (field) {
    const top = Math.max(field.top, 0), bottom = Math.min(field.bottom, innerHeight);
    t.style.left = `${field.left + field.width / 2}px`;
    t.style.top = `${bottom > top ? (top + bottom) / 2 : innerHeight / 2}px`;
  }
  t.hidden = false;
  /* a wide one (with its button) still on screen, 8px in from either side */
  if (field) {
    const half = t.offsetWidth / 2, x = field.left + field.width / 2;
    t.style.left = `${Math.max(half + 8, Math.min(innerWidth - half - 8, x))}px`;
  }
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

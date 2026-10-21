/*
 * Small DOM helpers, shared by the station's modules.
 *
 *   $(selector)                 the first match, or null
 *   el(tag, className, text)    a new element
 *   icon(name)                  an icon from the sprite in index.html, as markup
 *   toast(msg)                  a short note at the bottom, for a moment
 */
export const $ = s => document.querySelector(s);

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const icon = name => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}

/*
 * Phrases: each a row, its words and its Morse, a play button that
 * sounds it here (the marks lighting as they go), and ⋯ for the rest:
 * the station, its sound as a .wav, a link to copy.
 *
 *   ▷  I love you                                        ⋯
 *      .. / .-.. --- ...- . / -.-- --- ..-
 *
 *   phraseRow(text)      the row, as HTML: the reference draws its rows
 *                        with it, and npm run ref the phrases' page
 *                        (tools/ref-groups.cjs), so they're one
 *   enhance(list)        the play buttons and the ⋯ menus, on a page
 *   renderPhrases(list)  the reference's section: every row, enhanced
 *
 * With no script the phrase is a link to the station, which plays it.
 */
import { encode, format, pretty } from "../core/morse.js";
import { PHRASES, PHRASE_NOTES } from "../core/phrases.js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slugOf = text => text.toLowerCase().replace(/ /g, "-");

/* its marks, each its own span (lit as it sounds); the gaps as written */
const marksHTML = code => [...code].map(m => (m === "." ? `<i class="dot">.</i>` : m === "-" ? `<i class="dash">-</i>` : m)).join("");

export function phraseRow(text) {
  const words = encode(text), link = format(words), note = PHRASE_NOTES[text];
  return `<li class="phrase" id="${slugOf(text)}" data-link="${link}">` +
    `<a class="phrase-text" href="/?/${link}">${esc(text)}</a>` +
    `<span class="phrase-code">${marksHTML(pretty(words))}</span>` +
    (note ? `<small class="phrase-note">${note}</small>` : "") +
    `</li>`;
}

const PLAY = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
const MORE = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>`;

/* one ⋯ menu open at a time; a tap elsewhere or Escape shuts it */
let openMenu = null;
const shut = () => {
  if (!openMenu) return;
  openMenu.hidden = true;
  openMenu.previousElementSibling?.setAttribute("aria-expanded", "false");
  openMenu = null;
};
/* (no document when npm run ref imports this for phraseRow) */
globalThis.document?.addEventListener("pointerdown", e => { if (openMenu && !e.target.closest(".phrase-menu, .phrase-more")) shut(); });
globalThis.document?.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });

export function enhance(list) {
  for (const li of list.querySelectorAll("li.phrase")) {
    if (li.querySelector(".phrase-play")) continue;
    const link = li.dataset.link, text = li.querySelector(".phrase-text").textContent;
    const code = li.querySelector(".phrase-code").textContent;

    const play = Object.assign(document.createElement("button"), { type: "button", className: "phrase-play", title: `play ${text}` });
    play.setAttribute("aria-label", `play ${text}`);
    play.innerHTML = PLAY;
    play.addEventListener("click", async () => {
      const { playMarks } = await import("../shared/play-marks.js");   // (the page maker imports this file: no sound at import)
      const lights = [...li.querySelectorAll(".phrase-code i")];
      li.classList.add("playing");
      playMarks(code, { lights, end: () => li.classList.remove("playing") });
    });

    const more = Object.assign(document.createElement("button"), { type: "button", className: "phrase-more", title: "more: the station, the .wav, a link" });
    more.setAttribute("aria-label", `more for ${text}`);
    more.setAttribute("aria-haspopup", "true");
    more.setAttribute("aria-expanded", "false");
    more.innerHTML = MORE;
    const menu = Object.assign(document.createElement("div"), { className: "phrase-menu", hidden: true });
    const note = Object.assign(document.createElement("p"), { className: "phrase-said" });
    note.setAttribute("aria-live", "polite");
    menu.innerHTML = `<a href="/?/${link}">in the station</a><a href="/og/${link}.wav" download="${slugOf(text)}.wav">save a .wav</a><button type="button">copy link</button>`;
    menu.append(note);
    menu.querySelector("button").addEventListener("click", async () => {
      const { siteOrigin } = await import("../core/where.js");
      try { await navigator.clipboard.writeText(`${siteOrigin()}/?/${link}`); note.textContent = "copied"; } catch { note.textContent = "couldn't copy"; }
    });
    more.addEventListener("click", () => {
      const was = openMenu === menu;
      shut();
      if (was) return;
      note.textContent = "";
      menu.hidden = false;
      more.setAttribute("aria-expanded", "true");
      openMenu = menu;
    });

    li.prepend(play);
    li.append(more, menu);
  }
}

export function renderPhrases(list) {
  list.innerHTML = PHRASES.map(phraseRow).join("");
  enhance(list);
}

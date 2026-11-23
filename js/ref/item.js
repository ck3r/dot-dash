/*
 * A reference page of its own (/ref/k/, made by npm run ref): the
 * card at its head is already there as plain HTML, for a crawler or
 * a reader with no script. Here it's drawn again in place by the same
 * code as the station's (i) and the reference's selected character
 * (overview.js renderCard), so it plays as it opens, a tap on the
 * tile plays it again, its name says itself, and the marks copy.
 *
 *   no script          with script
 *   ┌ the letter K ┐   ┌ the letter K ┐
 *   │ the card,    │ → │ the card,    │   the same rows, the same
 *   │ at rest      │   │ alive        │   words: one source
 *   └──────────────┘   └──────────────┘
 *
 * A character the card mentions goes to that character's own page,
 * where it has one (ref/pages.js); anything else, to its card in the
 * reference, as the link was made.
 *
 * A word (a Q code: /ref/qrz/) has no one card: its letters' tiles in
 * a row, drawn again the same way (overview.js renderWord).
 *
 * The tab keys it too, as the station's does a message
 * (js/shared/tab-keyer.js): the page's own title as it loads, for a
 * search engine and a bookmark, then the marks, the title guessing
 * along the tree, and back to its own title once they're done.
 *
 *   K in Morse code · dot-da.sh  →  T  →  N  →  K  →  K in Morse code · dot-da.sh
 */
import { renderCard, renderWord } from "../shared/overview.js";
import { PAGES } from "./pages.js";
import { say } from "../shared/voice.js";
import { encode } from "../core/morse.js";
import * as keyer from "../shared/tab-keyer.js";

/* a word's page (/ref/qrz/) has its letters' tiles there instead */
const card = document.querySelector("#item-card"), word = document.querySelector("#item-word");
if (word) {
  renderWord(word, word.dataset.word, { means: word.dataset.means });
  for (const a of word.querySelectorAll("a[data-code]")) if (PAGES[a.dataset.code]) a.setAttribute("href", `/ref/${PAGES[a.dataset.code]}/`);
}
if (card) {
  /* the card redraws parts of itself as it plays (the little tree
     walks down a step a mark), so the links are set right whenever
     it changes, not once */
  const point = () => {
    for (const a of card.querySelectorAll("a[data-code]")) {
      const slug = PAGES[a.dataset.code];
      const to = slug ? `/ref/${slug}/` : null;
      if (to && a.getAttribute("href") !== to) a.setAttribute("href", to);
    }
  };
  new MutationObserver(point).observe(card, { childList: true, subtree: true });
  /* its name says itself, as in the reference (no volume here: full) */
  renderCard(card, card.dataset.code, { say: ch => say(ch).catch(() => { }) });
  point();
}

{
  const own = document.title;
  const words = card ? [[card.dataset.code]] : word ? encode(word.dataset.word) : null;
  const START_MS = 600, HOLD_MS = 1500;   // the page settled first; then its last guess held a moment
  if (words) {
    let back = null;
    keyer.on(event => {
      if (event.type === "start") clearTimeout(back);   // (keying again: back in view)
      if (event.type === "end") back = setTimeout(() => { document.title = own; }, HOLD_MS);
    });
    setTimeout(() => keyer.play(words), START_MS);
  }
}

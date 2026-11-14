/*
 * A reference page of its own (/ref/k/, made by npm run ref): the
 * card at its head is already there as plain HTML, for a crawler or
 * a reader with no script. Here it's drawn again in place by the same
 * code as the station's (i) and the reference's selected character
 * (overview.js renderCard), so it plays as it opens, a tap on the
 * tile plays it again, and the marks copy.
 *
 *   no script          with script
 *   ┌ the letter K ┐   ┌ the letter K ┐
 *   │ the card,    │ → │ the card,    │   the same rows, the same
 *   │ at rest      │   │ alive        │   words: one source
 *   └──────────────┘   └──────────────┘
 *
 * A character the card mentions goes to that character's own page,
 * where it has one (ref-pages.js); anything else, to its card in the
 * reference, as the link was made.
 */
import { renderCard } from "./overview.js";
import { PAGES } from "./ref-pages.js";

const card = document.querySelector("#item-card");
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
  renderCard(card, card.dataset.code);
  point();
}

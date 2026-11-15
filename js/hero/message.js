/*
 * The message, on its way round the screen: in at the top right, down
 * the road, and back up the left as it's keyed.
 *
 *   ┌ keyed ────┐  ┌ incoming ────────┐
 *   │ CQ CQ     │  │D̲E̲ K              │ ◀ the top line feeds right to
 *   │           │  │╱╲   CQ CQ DE K   │   left, its word on deck over
 *   └─────▲─────┘  └┬─────────────────┘   the road's far end; the lines
 *         │       ╱ ▼  ╲                  under it wait, then feed up,
 *    a word floats  a letter peels off    like rounds in a magazine
 *    up when it's   and drops down the
 *    done           road (road.js)
 *   > D̲         the word being spelled, by the caret at the bar
 *  ━━━━━━━      (the letter being keyed is the road's: road.js)
 *
 * Incoming. The word on deck is underlined, and loses its letters
 * from the front as their marks come onto the road. Nothing else
 * moves until the whole word has gone; then the line steps left to
 * the next word (a step a word, not a twitch a letter). A line used
 * up, the next one comes up.
 *
 * Keyed. A letter is done when its dotted line passes the bar: it
 * joins the word at the caret, lit if it was keyed,
 * grey if a mark was missed, brass if every mark landed. A word done
 * floats up to its place in the message, as a line does in a chat.
 *
 *   createMessage({ feed, keyed, word }) → {
 *     load(letters, unit)   a chart's letters (js/game/chart.js)
 *     draw(now)             peel, feed, and move on what's done
 *   }
 *
 * It reads the grade the page writes on each letter.
 */
import { el } from "../tx/dom.js";

export const PEEL = 21;   // units from the bar: about where the road comes out of the dark
const FLOAT = 900;        // ms: a word's way up
const LONGEST = 14;       // letters: what fits either side of the middle, on deck (hero.css --mid)

export function createMessage({ feed, keyed, word }) {
  const rows = feed.querySelector(".rows");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let letters = [], words = [], pieces = [], unit = 100;   // pieces: the words as they're laid out, a long one in several
  let peeled = 0;         // letters before this one have left the feed
  let at = 0;             // the letter at the bar

  function load(list, u) {
    letters = list;
    unit = u;
    peeled = at = 0;
    keyed.textContent = "";
    word.textContent = "";
    for (const flying of document.querySelectorAll(".flying")) flying.remove();

    words = [];
    for (const letter of letters) (words[letter.word] ??= { letters: [] }).letters.push(letter);

    /* the lines: as many letters as fit across (the type is monospace) */
    rows.textContent = "";
    rows.style.setProperty("--k", 0);
    const probe = rows.appendChild(el("span", "", "0000000000"));
    const room = feed.clientWidth - parseFloat(getComputedStyle(rows).paddingLeft);   // the lines that wait start clear of the road
    const cols = Math.max(6, Math.floor(room / (probe.getBoundingClientRect().width / 10 || 8)));
    probe.remove();
    /*
     * A word too long for a line (or for the room either side of the
     * middle, on deck) is broken, and goes on in the line under:
     *
     *   SUPERCALIFRAGI      each piece is on deck in its turn
     *   LISTIC NOW
     */
    const most = Math.min(cols, LONGEST);
    pieces = [];
    let run = null, col = 0, row = -1;
    for (const w of words) {
      for (let from = 0; from < w.letters.length; from += most) {
        const piece = { letters: w.letters.slice(from, from + most), el: el("span", "w") };
        const n = piece.letters.length;
        if (!run || from > 0 || col + n > cols) {
          run = rows.appendChild(el("span", "row")).appendChild(el("span", "run"));
          col = 0;
          row++;
        }
        Object.assign(piece, { run, row, col });
        for (const letter of piece.letters) { piece.el.append(letter.queued = el("b", "", letter.ch)); letter.piece = piece; }
        run.append(piece.el, " ");
        col += n + 1;
        pieces.push(piece);
      }
    }
    if (pieces[0]) deck(pieces[0]);
    draw(0);
  }

  /* the word on deck: its line slides till the word's middle is in
     the middle of the screen (hero.css), over the road's far end */
  function deck(w) {
    w.el.classList.add("deck");
    w.run.style.setProperty("--c", w.col + w.letters.length / 2);
    rows.style.setProperty("--k", w.row);
  }

  /* a word has gone down the road: on to the next, in this line or the one under it */
  function next(w) {
    w.el.classList.remove("deck");
    const then = pieces[pieces.indexOf(w) + 1];
    if (then) return deck(then);
    w.run.parentElement.classList.add("spent");      // the last one: its line stays where it was
  }

  /*
   * A word done: it takes its place in the message at once, unseen,
   * and a copy of it makes the way there from where it was spelled.
   * (A copy, on the page itself: the message's box clips, and the way
   * up starts outside it.)
   */
  function float() {
    const from = word.getBoundingClientRect();
    const placed = el("span", "w");
    placed.append(...word.childNodes);
    keyed.append(placed, " ");
    keyed.scrollTop = keyed.scrollHeight;       // a long message: the newest end stays in view
    if (still.matches || !placed.animate) return;
    const to = placed.getBoundingClientRect();
    const flying = placed.cloneNode(true);
    flying.classList.add("flying");
    Object.assign(flying.style, { left: `${to.left}px`, top: `${to.top}px` });
    document.body.append(flying);
    placed.style.visibility = "hidden";
    flying.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }],
      { duration: FLOAT, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
    ).finished.catch(() => { }).then(() => { flying.remove(); placed.style.visibility = ""; });
  }

  function draw(now) {
    /* (not before the song starts: waiting, the whole message is there to read) */
    while (now > 0 && peeled < letters.length && letters[peeled].t0 - now < PEEL * unit) {
      const letter = letters[peeled++];
      letter.queued.classList.add("gone");
      if (letter === letter.piece.letters.at(-1)) next(letter.piece);
    }
    /* its closing dotted line at the bar, and graded: the same moment
       the line pushes the letter on down the road (road.js) */
    while (at < letters.length && now >= letters[at].over && letters[at].grade) {
      const letter = letters[at++];
      word.append(el("b", letter.grade, letter.ch));
      if (letter.last) float();
    }
  }

  return { load, draw };
}

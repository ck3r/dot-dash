/*
 * The chart: a message laid out in time, a note for every mark.
 *
 *   K           M
 *   ▓▓▓ ▓ ▓▓▓ ┊ ▓▓▓ ▓▓▓ ┊
 *   └── lead ──┘ the road starts empty, so the first note is seen
 *                coming the whole way
 *             ┊ where a letter ends: half way to the next one
 *
 *   chart(words, timing, { lead }) → {
 *     notes     [{ lane: "." or "-", t0, t1, len, letter }]   ms, len in units
 *     letters   [{ ch, t0, end, until, notes, space, word, last }]
 *                 t0: its first mark; end: its last mark's end;
 *                 over: its closing dotted line, a dot's length
 *                 after that; until: half way to the next letter (a
 *                 key still down by then is cut there); space: it
 *                 starts a new word; word: which word; last: it
 *                 ends its word
 *     end       when the last note is over
 *   }
 *
 * words is morse.js's own shape (a list of words, each a list of
 * codes); timing is tx-keyer's timing(wpm, fwpm), so Farnsworth's
 * longer spaces come with it.
 */
import { DECODE } from "../morse.js";

export function chart(words, timing, { lead = 0 } = {}) {
  const { unit, letter: letterGap, word: wordGap } = timing;
  const notes = [], letters = [];
  let at = lead, word = -1;
  for (const codes of words) {
    if (!codes.length) continue;
    word++;
    let space = letters.length > 0;
    for (const code of codes) {
      const letter = { ch: DECODE[code] ?? "?", t0: at, notes: [], space, word, last: false };
      space = false;
      letters.push(letter);
      for (const mark of code) {
        const len = mark === "-" ? 3 : 1;
        const note = { lane: mark, t0: at, t1: at + len * unit, len, letter };
        notes.push(note);
        letter.notes.push(note);
        at += (len + 1) * unit;          // the mark, and the gap inside a letter
      }
      letter.end = at - unit;
      letter.over = letter.end + unit;
      at += letterGap - unit;            // that last gap grows into a letter space
    }
    letters[letters.length - 1].last = true;
    at += wordGap - letterGap;           // and the last letter space into a word space
  }
  for (const [i, letter] of letters.entries()) {
    const next = letters[i + 1];
    letter.until = next ? (letter.end + next.t0) / 2 : letter.end + 1.5 * unit;
  }
  const last = notes[notes.length - 1];
  return { notes, letters, end: last ? last.t1 : lead };
}

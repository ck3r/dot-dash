/*
 * The phrases people look up: few, and chosen (a page of every phrase
 * there is would be nobody's reading). One list, for the reference's
 * Phrases (js/ref/phrases.js) and its page, /ref/phrases/ (made by
 * npm run ref, tools/ref-groups.cjs).
 *
 * A note is HTML: a line under the phrase, where it has more to say.
 */
export const PHRASES = [
  "SOS", "hello", "hi", "I love you", "I miss you", "help", "yes", "no", "please", "thank you", "sorry",
  "good morning", "good night", "goodbye", "happy birthday", "merry christmas", "happy new year",
  "be safe", "what hath God wrought", "CQ CQ CQ", "73"
];

export const PHRASE_NOTES = {
  SOS: "as a word, its letters apart; the distress signal is <a href=\"/ref/sos/\">the prosign</a>, run together: <b>...---...</b>",
  "what hath God wrought": "the first message Samuel Morse sent from Washington to Baltimore, in 1844",
  "CQ CQ CQ": "<a href=\"/ref/cq/\">calling any station</a>",
  73: "<a href=\"/ref/73/\">best regards</a>, at the end of a contact"
};

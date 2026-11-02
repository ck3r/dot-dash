/*
 * A phonetic name as a stair, like the old charts: each syllable
 * steps down and across, centred on its column, the stairs evenly
 * apart. The station's about column and the about card both draw it.
 *
 *        U
 *       N
 *        I
 *      F
 *       O
 *        R
 *         M
 *
 *   spokenOf(ch)              Alfa, Fower … (or undefined)
 *   syllablesOf(ch, spoken)   ["AL", "FA"]: each a stair
 *   layStair(box, syllables, stressed)
 *                             the letters into box, each placed by
 *                             --dx (across, in letters) and --y (down,
 *                             em); --h on the box is its height
 */
import { PHONETIC } from "./characters.js";

/* the names in syllables, for the stair: each space starts a new
   stair; a "·" is a syllable break within one (not drawn) */
const SYLLABLES = {
  A: "AL FA", B: "BRA VO", C: "CHAR LIE", D: "DEL TA", E: "ECH O", F: "FOX TROT",
  G: "GOLF", H: "HO TEL", I: "IN DI A", J: "JU LI ETT", K: "KI LO", L: "LI MA",
  M: "MIKE", N: "NO VEM BER", O: "OS CAR", P: "PA PA", Q: "QUE BEC", R: "RO ME O",
  S: "SI ER RA", T: "TAN GO", U: "U·NI FORM", V: "VIC TOR", W: "WHIS KEY",
  X: "X RAY", Y: "YAN KEE", Z: "ZU LU",
  0: "ZE RO", 1: "WUN", 2: "TOO", 3: "TREE", 4: "FOW ER", 5: "FIFE",
  6: "SIX", 7: "SEV EN", 8: "AIT", 9: "NIN ER"
};

/* the stressed syllable(s), from the official ICAO / ITU spellings
   (AL fah, hoh TELL, no VEM ber, JEW lee ETT …); the first when
   not listed */
export const STRESS = { H: [1], J: [0, 2], N: [1], P: [1], Q: [1], S: [1] };

const SPOKEN_DIGITS = {
  0: "Zero", 1: "Wun", 2: "Too", 3: "Tree", 4: "Fower",
  5: "Fife", 6: "Six", 7: "Seven", 8: "Ait", 9: "Niner"
};

export const spokenOf = ch => PHONETIC[ch] ?? SPOKEN_DIGITS[ch];
export const syllablesOf = (ch, spoken) => (SYLLABLES[ch] ?? spoken.toUpperCase()).split(" ");

/*
 * Each stair centred on the column, and the stairs evenly apart:
 * their middles (where each crosses the column's centre) a fixed
 * step down, the step the closest pair needs so their letters
 * keep a syllable's gap. (Rows alone, NO came nearer VEM than
 * VEM did BER: a shorter stair's middle sits higher.)
 *
 *     N              ╲ NO
 *      O             ╲ VEM     the ╲s equally apart
 *    V               ╲ BER
 *     E
 *      M
 *    B
 *     E
 *      R
 */
const ROW = 0.56, GAP = 0.3;   // em: a letter's step down, and the extra between stairs

export function layStair(box, syllables, stressed = [0]) {
  /* a group is one stair; a "·" inside it is a syllable break that
     isn't drawn (U·NI FORM: two stairs, three syllables, U stressed) */
  const lens = syllables.map(g => g.replaceAll("·", "").length);
  const half = n => (n - 1) / 2 * ROW;   // a stair's top to its middle
  const step = Math.max(0, ...lens.slice(1).map((n, g) => ROW + GAP + half(lens[g]) + half(n)));
  let syl = 0;
  syllables.forEach((group, gi) => {
    const top = half(lens[0]) + gi * step - half(lens[gi]);
    let k = 0;
    for (const c of group) {
      if (c === "·") { syl++; continue; }      // a break, not drawn: the bold shows it
      /* only the stressed syllable stands out */
      const e = document.createElement("span");
      if (stressed.includes(syl)) e.className = "stress";
      e.textContent = c;
      e.style.setProperty("--dx", String(k - (lens[gi] - 1) / 2));   // centred on the column
      e.style.setProperty("--y", (top + k * ROW).toFixed(3));
      k++;
      box.append(e);
    }
    syl++;
  });
  const last = lens.length - 1;
  box.style.setProperty("--h", (half(lens[0]) + last * step + half(lens[last]) + ROW + 0.45).toFixed(3));   // the last letter, and its line
  box.classList.add("stair");
}

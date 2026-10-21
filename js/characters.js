/*
 * What the about column needs at startup, small: the phonetic names,
 * the prosigns by their code, and how marks could be misheard. Kept
 * apart from overview.js (the reference's overview and the about
 * card), which loads only when it's first used.
 */
import { DECODE } from "./morse.js";

export const PHONETIC = {
  A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
  M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
  S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu"
};

/*
 * Prosigns: letters run together with no letter gap. Four of
 * them share a code with a symbol, so the same marks mean
 * different things depending on context.
 *
 *   code      prosign  sent as  meaning                  also
 */
export const PROSIGNS_BY_CODE = {
  "...---...": ["SOS", "S O S", "distress"],
  "...-.-":    ["SK",  "S K",   "end of contact"],
  "........":  ["HH",  "H H",   "error"],
  "-.-..-..":  ["CL",  "C L",   "closing down"],
  "-...-.-":   ["BK",  "B K",   "break"],
  "-..---":    ["DO",  "D O",   "shift to Wabun (Japanese) code"],
  "...-.":     ["SN",  "S N",   "understood (also written VE)"],
  "-.-.-":     ["KA",  "K A",   "attention / start of message (also written CT)"],
  ".-.-":      ["AA",  "A A",   "new line"],
  ".-.-.":     ["AR",  "A R",   "end of message (new page)"],
  "-...-":     ["BT",  "B T",   "new paragraph / pause"],
  "-.--.":     ["KN",  "K N",   "over, to the named station only"],
  ".-...":     ["AS",  "A S",   "wait"]
};

/*
 * Every way to cut the same marks into other characters
 * (what you'd hear if the gaps inside it came out too long).
 */

export function splits(code) {
  const out = [];
  (function walk(rest, parts) {
    if (!rest) {
      if (parts.length > 1) out.push(parts);
      return;
    }
    for (let i = 1; i <= rest.length; i++) {
      const piece = rest.slice(0, i);
      const name = DECODE[piece] ?? null;
      if (name && !name.startsWith("<")) walk(rest.slice(i), [...parts, piece]);
    }
  })(code, []);
  return out.sort((a, b) => a.length - b.length);
}

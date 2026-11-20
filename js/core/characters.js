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
 * The operators' words, as on /ref (its Q codes and abbreviations,
 * kept in step by hand): the about column names one when the word
 * showing is one. A Q code sent with ? asks instead; with cut
 * numbers on, 5NN reads 599, so it's here both ways.
 */
export const TERMS = {
  QRL: "this frequency is in use", "QRL?": "is this frequency in use?",
  QRM: "man-made interference", "QRM?": "is there interference?",
  QRN: "static, natural noise", "QRN?": "are you troubled by static?",
  QRO: "increase power", "QRO?": "shall I increase power?",
  QRP: "reduce power; low power", "QRP?": "shall I reduce power?",
  QRQ: "send faster", "QRQ?": "shall I send faster?",
  QRS: "send slower", "QRS?": "shall I send slower?",
  QRT: "stop sending; closing down", "QRT?": "shall I stop sending?",
  QRU: "I have nothing for you", "QRU?": "have you anything for me?",
  QRV: "I am ready", "QRV?": "are you ready?",
  QRX: "wait, stand by", "QRX?": "when will you call again?",
  QRZ: "you are being called by …", "QRZ?": "who is calling me?",
  QSB: "your signal is fading", "QSB?": "is my signal fading?",
  QSK: "I can hear you between my signals", "QSK?": "can you hear me between your signals?",
  QSL: "I confirm receipt", "QSL?": "can you confirm receipt?",
  QSO: "a contact, a conversation", "QSO?": "can you make contact with …?",
  QSY: "change frequency", "QSY?": "shall I change frequency?",
  QTH: "my location is …", "QTH?": "what is your location?",
  QTR: "the correct time is …", "QTR?": "what is the correct time?",
  "5NN": "599, a perfect report (cut numbers)", 599: "a perfect report (sent cut: 5NN)",
  73: "best regards", 88: "love and kisses", AGN: "again", ANT: "antenna",
  BK: "break, back to you", CQ: "calling any station", CUL: "see you later",
  DE: "from; this is", ES: "and", FB: "fine business: great",
  GA: "good afternoon", GE: "good evening", GM: "good morning", HI: "laughter",
  HR: "here", K: "over, go ahead", OM: "old man: any operator", PSE: "please",
  R: "received, roger", RIG: "radio", RST: "signal report: readability, strength, tone",
  TNX: "thanks", TU: "thank you", UR: "your, you're", WX: "weather",
  YL: "young lady: any operator"
};
export const isQ = term => /^Q[A-Z]{2}\??$/.test(term);

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

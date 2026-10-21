/*
 * The about column (under the collapsed tree): the character
 * that's showing, its marks, its phonetic name as a stair, its
 * cut and what it could be misheard as; and the (i) below it.
 *
 *   createAbout({ hiding, redact, openHeard, openCut, greet })
 *     .draw(code)    show this character ("" for none)
 *     .current()     the character showing
 *   aboutHref(code)  its page on the reference
 */
import { DECODE, ENCODE, CUT, NAME_CODE } from "../morse.js";
import { PHONETIC, PROSIGNS_BY_CODE, splits } from "../characters.js";
import { $, el } from "./dom.js";

export const aboutHref = code => `/ref/?/_${code}_`;

export function createAbout({ hiding, redact, openHeard, openCut, greet }) {
  /*
   * ============================================================
   * ABOUT (under the collapsed tree)
   * ============================================================
   *
   * The rest of the column, for the letter that's showing:
   *
   *     ▪        its marks, one per row
   *     ▬
   *
   *     A        its phonetic name, first letter bold
   *     L
   *     F
   *     A
   *
   *     ~        what the same marks could be heard as, with the
   *     E        gaps inside it too long
   *     T
   *
   *     (i)      the full about, on the reference page (always
   *              there, even with the whole tree open)
   *
   * Each part does its own thing: the marks copy, the name will say
   * itself (recordings to come), the cut opens the reference tree in
   * cut numbers, and ~ explains mishearing. Only (i) goes to the
   * character's page (a new tab, so the message stays put).
   */
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
  const STRESS = { H: [1], J: [0, 2], N: [1], P: [1], Q: [1], S: [1] };

  const SPOKEN_DIGITS = {
    0: "Zero", 1: "Wun", 2: "Too", 3: "Tree", 4: "Fower",
    5: "Fife", 6: "Six", 7: "Seven", 8: "Ait", 9: "Niner"
  };


  let aboutCode = "";

  function drawAbout(code) {
    aboutCode = code;
    const box = $("#about");
    box.textContent = "";
    const ch = code ? DECODE[code] : null;

    /* (i), always at the foot of the column (tree open or not):
       this character's page, or the reference itself */
    const info = $("#tree-info");
    const secret = hiding() === "letters";      // don't name the letter in the tooltip either
    info.href = code ? aboutHref(code) : "/ref/";
    info.title = code && !secret ? `everything about ${ch ?? code}` : code ? "everything about this character" : "the reference: every character";
    info.setAttribute("aria-label", info.title);
    if (!code) return;
    if (box.hidden) return buildAbout(box, code, ch);

    buildAbout(box, code, ch);
    fitAbout();
  }

  /* a moment's word in the column ("copied", "soon"), over the part tapped */
  function flashWord(button, word) {
    button.dataset.flash = word;
    clearTimeout(button.flashTimer);
    button.flashTimer = setTimeout(() => delete button.dataset.flash, 1200);
  }

  function buildAbout(box, code, ch) {
    box.textContent = "";
    /* the marks (always full size), and its name: the phonetic word
       stepped down the column by syllable, the stressed one bold,
       or the prosign, across */
    const main = el("span", "about-main");
    const marks = el("button", "about-marks");
    marks.type = "button";
    marks.title = `copy ${code}`;
    marks.setAttribute("aria-label", `copy the marks, ${code}`);
    for (const m of code) marks.append(el("i", m === "." ? "dot" : "dash"));
    marks.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code); flashWord(marks, "copied"); }
      catch { flashWord(marks, "can't copy"); }
    });
    main.append(marks);
    /* the site's own marks (· − − · −, empty in the tree): its name,
       stepped like the others; a tap keys it in the tab */
    const isName = code === NAME_CODE;
    const spoken = isName ? "dot-da.sh" : ch && (PHONETIC[ch] ?? SPOKEN_DIGITS[ch]);
    const prosign = ch?.startsWith("<") ? ch : PROSIGNS_BY_CODE[code] ? `<${PROSIGNS_BY_CODE[code][0]}>` : null;
    if (spoken) {
      const name = el("button", "about-name");
      name.type = "button";
      name.title = isName ? "dot-da.sh: this site's name, in its own marks (tap: the tab keys it)" : `say ${spoken} (recordings coming soon)`;
      name.setAttribute("aria-label", name.title);
      name.addEventListener("click", () => {
        if (!isName) return flashWord(name, "soon");
        greet();
        flashWord(name, "in the tab");
      });
      /* each letter its own row; across, it steps one column per
         letter and back to the first at each syllable (the stair) */
      const syllables = isName ? ["dot", "-da", ".sh"] : (SYLLABLES[ch] ?? spoken.toUpperCase()).split(" ");
      /* a group is one stair; a "·" inside it is a syllable break that
         isn't drawn (U·NI FORM: two stairs, three syllables, U stressed) */
      const stressed = STRESS[ch] ?? [0];
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
      const lens = syllables.map(g => g.replaceAll("·", "").length);
      const half = n => (n - 1) / 2 * ROW;   // a stair's top to its middle
      const step = Math.max(0, ...lens.slice(1).map((n, g) => ROW + GAP + half(lens[g]) + half(n)));
      let syl = 0;
      syllables.forEach((group, gi) => {
        const top = half(lens[0]) + gi * step - half(lens[gi]);
        let k = 0;
        for (const c of group) {
          if (c === "·") { syl++; continue; }      // a break, not drawn: the bold shows it
          /* only the stressed syllable stands out (the letter itself is
             shown big in the tree, just above) */
          const e = el("span", stressed.includes(syl) ? "stress" : "", c);
          e.style.setProperty("--dx", String(k - (lens[gi] - 1) / 2));   // centred on the column
          e.style.setProperty("--y", (top + k * ROW).toFixed(3));
          k++;
          name.append(e);
        }
        syl++;
      });
      const last = lens.length - 1;
      name.style.setProperty("--h", (half(lens[0]) + last * step + half(lens[last]) + ROW + 0.45).toFixed(3));   // the last letter, and its line
      name.classList.add("stair");
      main.append(name);
    } else if (prosign) {
      const sign = el("span", "about-prosign", prosign);
      sign.dataset.len = prosign.length;
      main.append(sign);
    }
    box.append(main);

    /* at the foot, stacked up from the bottom: the cut number it
       stands for (or stands in for it), then what it could be
       misheard as */
    const foot = el("span", "about-foot");
    const stack = (s, label, codes) => {
      s.append(el("span", "about-label", label));
      for (const c of codes) s.append(el("b", "", DECODE[c]));
      foot.append(s);
      return s;
    };
    /* the cut: what cut numbers are (a popup), this one picked out */
    const cutStack = (title, shown, short) => {
      const b = el("button", "about-cut");
      b.type = "button";
      b.title = title + " (what are cut numbers?)";
      b.setAttribute("aria-haspopup", "dialog");
      b.addEventListener("click", () => openCut(code));
      return stack(b, "cut", [shown]);
    };

    /* cut numbers: T for 0, N for 9 … (the long digits, shortened) */
    const own = DECODE[code];
    const cutFor = CUT[code];                                     // this code is a cut: for that digit
    const cutCode = Object.keys(CUT).find(k => CUT[k] === own && k !== code);   // this digit's cut
    if (cutFor && cutFor !== own) cutStack(`also sent as a cut ${cutFor}`, ENCODE[cutFor], code);
    else if (cutCode) cutStack(`often sent cut, as ${DECODE[cutCode]}`, cutCode, cutCode);

    /* ~: what the same marks could be heard as; tap for why */
    const alt = own ? splits(code) : [];
    if (alt.length) {
      const b = el("button", "about-heard");
      b.type = "button";
      b.title = "could be misheard as " + alt.slice(0, 6).map(p => p.map(c => DECODE[c]).join("")).join(", ") + " (why?)";
      b.setAttribute("aria-haspopup", "dialog");
      b.addEventListener("click", () => openHeard(true));
      stack(b, "~", alt[0]);
    }
    if (foot.firstChild) box.append(foot);

    /* the eye: what's hidden on the line is hidden (and inert) here too */
    const h = hiding();
    if (h === "morse") {
      redact(marks);
      const heard = box.querySelector(".about-heard");      // A ~ E T spells out ·−
      if (heard) redact(heard);
    }
    if (h === "letters") {
      for (const e of box.querySelectorAll(".about-name, .about-prosign, .about-cut, .about-heard")) redact(e);
    }
  }

  /*
   * Fit the column. Everything has one size (the name is --fs-s); a
   * short screen lets go of the misheard line, then the cut, then
   * lays the name flat, then drops it. The marks and (i) always stay.
   */
  function fitAbout() {
    const box = $("#about");
    if (box.hidden || !box.firstChild) return;
    const name = box.querySelector(".about-name");
    const heard = box.querySelector(".about-heard");
    const cut = box.querySelector(".about-cut");
    for (const o of [name, heard, cut]) if (o) o.hidden = false;
    if (name) { name.classList.remove("flat"); name.classList.add("stair"); }

    /* a prosign runs across: as big as the column allows */
    const sign = box.querySelector(".about-prosign");
    if (sign) sign.style.fontSize = Math.min(15, (box.clientWidth - 6) / (sign.dataset.len * 0.62)) + "px";

    const over = () => box.scrollHeight > box.clientHeight + 1;
    if (over() && heard) heard.hidden = true;
    if (over() && cut) cut.hidden = true;
    if (over() && name) { name.classList.remove("stair"); name.classList.add("flat"); }
    if (over() && name) name.hidden = true;
  }


  return { draw: drawAbout, current: () => aboutCode };
}

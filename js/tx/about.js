/*
 * The about column (under the collapsed tree): the character
 * that's showing, its marks, its phonetic name as a stair, its
 * cut and what it could be misheard as; and the (i) below it.
 *
 *   createAbout({ hiding, redact, openHeard, openCut, openWord, greet })
 *     .draw(code, sent, word)   show this character ("" for none); sent:
 *                    playing, how many of its marks have gone so far
 *                    (see below); null when it's whole. word: the
 *                    word it's in, { codes, at }, if known
 *     .redraw()      again, as it was (the column changed size)
 *     .current()     the character showing
 *     .word()        the word it's in, as drawn ({ codes, at }, or null)
 *   aboutHref(code)  its page on the reference
 *   termOf(word)     the operators' word it is (QTH, 73), or null
 */
import { DECODE, ENCODE, CUT, NAME_CODE, READING, namesOf } from "../morse.js";
import { PROSIGNS_BY_CODE, TERMS, splits } from "../characters.js";
import { STRESS, spokenOf, syllablesOf, layStair } from "../stair.js";
import { $, el, flash } from "./dom.js";
import { say, symbolWord, codeSaid } from "./voice.js";

export const aboutHref = code => `/ref/?/_${code}_`;

/* the word as it reads (5NN, or 599 with cut on), if it's one of the
   operators' words; named from its last letter, once it's all there
   (in the (i)'s popup: the column itself keeps to the letter) */
export function termOf(word) {
  if (!word || word.at !== word.codes.length - 1) return null;
  const text = namesOf(word.codes).join("");
  return Object.hasOwn(TERMS, text) ? text : null;
}

export function createAbout({ hiding, redact, openHeard, openCut, openWord, greet }) {
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
   *     cut      the cut number it stands for
   *     T
   *
   *     ~        what the same marks could be heard as, with the
   *     E        gaps inside it too long
   *     T
   *
   *     (i)      the full about, on the reference page (always
   *              there, even with the whole tree open)
   *
   * Playing, it doesn't give the letter away early. From its first
   * mark the column holds the whole letter, in grey; the marks fill
   * in as they're sent, and the rest comes up when the letter lands
   * (on the tape, its name white and underlined):
   *
   *     ▪  sent          ▪        ▪
   *     ▫  to come       ▪        ▪
   *     alfa (grey)      alfa     alfa (bright)
   *
   * Each part does its own thing: the marks copy, the name says
   * itself (voice.js), the cut opens the reference tree in
   * cut numbers, and ~ explains mishearing. Only (i) goes to the
   * character's page (a new tab, so the message stays put).
   */
  let aboutCode = "";
  let last = { sent: null, word: null };   // what the column was last drawn with, to redraw it

  /*
   * What the column shows, each part switched in the about note
   * (the tray's "about" word): name (or the prosign), cut, ~.
   * The tray's box shows or hides the whole column; the (i) stays.
   */
  const PARTS = ["name", "cut", "heard"];
  const shows = part => $(`#opt-about-${part}`)?.checked ?? true;
  for (const part of ["", ...PARTS]) {
    const box = $(`#opt-about${part && "-" + part}`);
    if (!box) continue;
    const key = `dot-dash:tx-about${part && "-" + part}`;
    try { box.checked = localStorage.getItem(key) !== "0"; } catch { }
    box.addEventListener("change", () => {
      try { localStorage.setItem(key, box.checked ? "1" : "0"); } catch { }
      showColumn();
      drawAbout(aboutCode, last.sent, last.word);
    });
  }
  /* the reading ranks the parts (see fitAbout) */
  for (const id of ["#opt-cut"]) $(id)?.addEventListener("change", () => drawAbout(aboutCode, last.sent, last.word));
  /* hidden, it keeps its room: the (i) stays where it is */
  const showColumn = () => $("#about").classList.toggle("off", !($("#opt-about")?.checked ?? true));
  showColumn();

  function drawAbout(code, sent = null, word = null) {
    aboutCode = code;
    last = { sent, word };
    const box = $("#about");
    box.textContent = "";
    box.classList.toggle("pending", sent !== null);
    const ch = code ? DECODE[code] : null;

    /* (i), always at the foot of the column (tree open or not):
       this character's page, or the reference itself */
    const info = $("#tree-info");
    const secret = hiding() === "letters";      // don't name the letter in the tooltip either
    info.href = code ? aboutHref(code) : "/ref/";
    info.title = code && !secret ? `everything about ${ch ?? code}` : code ? "everything about this character" : "the reference: every character";
    info.setAttribute("aria-label", info.title);
    if (!code) return;
    if (box.hidden) return buildAbout(box, code, ch, sent);

    buildAbout(box, code, ch, sent);
    fitAbout();
  }

  /* a moment's word in the column ("copied"), over the part tapped */
  const flashWord = (button, word) => flash(button, word);

  function buildAbout(box, code, ch, sent) {
    box.textContent = "";
    /* the marks (always full size), and its name: the phonetic word
       stepped down the column by syllable, the stressed one bold,
       or the prosign, across */
    const main = el("span", "about-main");
    const marks = el("button", "about-marks");
    marks.type = "button";
    marks.title = `copy ${code}`;
    marks.setAttribute("aria-label", `copy the marks, ${code}`);
    [...code].forEach((m, i) => marks.append(el("i", (m === "." ? "dot" : "dash") + (sent !== null && i >= sent ? " todo" : ""))));
    marks.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code); flashWord(marks, "copied"); }
      catch { flashWord(marks, "can't copy"); }
    });
    main.append(marks);
    /* the site's own marks (· − − · −, empty in the tree): its name,
       stepped like the others; a tap keys it in the tab */
    const isName = code === NAME_CODE;
    const spoken = isName ? "dot-da.sh" : ch && spokenOf(ch);
    const prosign = ch?.startsWith("<") ? ch : PROSIGNS_BY_CODE[code] ? `<${PROSIGNS_BY_CODE[code][0]}>` : null;
    /* a symbol: no stair (its word is no spelling), the symbol itself,
       big, as on the card's tile; a tap says its word */
    const word = !prosign && ch && symbolWord(ch);
    if (!shows("name")) {
      /* switched off: nothing under the marks */
    } else if (spoken) {
      const name = el("button", "about-name");
      name.type = "button";
      name.title = isName ? "dot-da.sh: this site's name, in its own marks (tap: the tab keys it)" : `say ${codeSaid(ch) ?? spoken}`;
      name.setAttribute("aria-label", name.title);
      name.addEventListener("click", () => {
        if (!isName) {
          say(ch, Number($("#opt-vol").value) / 100).catch(() => flashWord(name, "can't say it here"));
          return;
        }
        greet();
        flashWord(name, "in the tab");
      });
      /* each letter its own row; across, it steps one column per
         letter and back to the first at each syllable (js/stair.js) */
      layStair(name, isName ? ["dot", "-da", ".sh"] : syllablesOf(ch, spoken), STRESS[ch]);
      main.append(name);
    } else if (word) {
      const name = el("button", "about-name about-symbol");
      name.type = "button";
      name.title = `say ${codeSaid(ch) ?? word.toLowerCase()}`;
      name.setAttribute("aria-label", name.title);
      name.addEventListener("click", () => say(ch, Number($("#opt-vol").value) / 100).catch(() => flashWord(name, "can't say it here")));
      name.append(el("b", "", ch));
      main.append(name);
    } else if (prosign) {
      /* a tap: what it means */
      const sign = el("button", "about-prosign", prosign);
      sign.type = "button";
      sign.title = `what ${prosign} means`;
      sign.setAttribute("aria-haspopup", "dialog");
      sign.addEventListener("click", () => openWord({ term: prosign, codes: [code] }));
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
    if (!shows("cut")) { /* switched off */ }
    else if (cutFor && cutFor !== own) cutStack(`also sent as a cut ${cutFor}`, ENCODE[cutFor], code);
    else if (cutCode) cutStack(`often sent cut, as ${DECODE[cutCode]}`, cutCode, cutCode);

    /* ~: what the same marks could be heard as; tap for why */
    const alt = own && shows("heard") ? splits(code) : [];
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
   * The parts by how much they matter, most first. A short screen
   * lets go of the last one first; the marks and (i) always stay.
   *
   *   marks · name · cut · ~        as it is
   *   marks · cut · name · ~        cut on: the cut first
   *
   * (A prosign has the name's place: with prosigns on, <AR> is what
   * shows there, not +.)
   *
   * The name is let go of in two steps: laid flat, then dropped.
   */
  function ranked() {
    const order = ["name", "cut", "heard"];
    const first = part => order.unshift(...order.splice(order.indexOf(part), 1));
    if (READING.cut) first("cut");
    return order;
  }

  /*
   * Fit the column. Everything has one size (the name is --fs-s).
   * The parts go in by rank, each only if there's room for it, so a
   * part too big to fit doesn't take a smaller one below it with it.
   */
  function fitAbout() {
    const box = $("#about");
    if (box.hidden || !box.firstChild) return;
    const part = {
      name: box.querySelector(".about-name, .about-prosign"),
      cut: box.querySelector(".about-cut"),
      heard: box.querySelector(".about-heard")
    };
    for (const o of Object.values(part)) if (o) o.hidden = true;
    const name = box.querySelector(".about-name:not(.about-symbol)");   // a symbol has no stair to lay flat
    const lay = flat => { name.classList.toggle("flat", flat); name.classList.toggle("stair", !flat); };

    /* a prosign runs across: as big as the column allows */
    const sign = box.querySelector(".about-prosign");
    if (sign) sign.style.fontSize = Math.min(15, (box.clientWidth - 6) / (sign.dataset.len * 0.62)) + "px";

    const over = () => box.scrollHeight > box.clientHeight + 1;
    for (const p of ranked()) {
      if (!part[p]) continue;
      part[p].hidden = false;
      if (p === "name" && name) {
        lay(false);
        if (over()) lay(true);       // the stair doesn't fit: laid flat
      }
      if (over()) part[p].hidden = true;
    }
  }


  return { draw: drawAbout, redraw: () => drawAbout(aboutCode, last.sent, last.word), current: () => aboutCode, word: () => last.word };
}

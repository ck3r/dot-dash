/*
 * ============================================================
 * SKELETON: the auxiliary pages keying their message (404.html …)
 * ============================================================
 *
 * The page gives the message, and what's under each letter:
 *
 *   <span class="aux-line" data-morse="........ / ....- - ....-"
 *         data-names="<HH> 4 0 4"></span>
 *
 * It's drawn as the tape draws a line (the station's own classes, so
 * tx.css styles it) and keyed over and over at 20 wpm, as the station
 * plays a message back: each mark lit as it's keyed, a letter white
 * once sent, the newest underlined; the box's edge and the switch
 * keying with it. Then a rest, and round again.
 *
 *   ▮▮▮▮▮▮▮▮   ▮▮▮▮▮ ▮ ▮▮▮▮▮   …   ________________
 *    keyed, a mark at a time         rest (letters lit), then again
 */
import { DECODE } from "./morse.js";

const UNIT = 60;     // ms: 20 wpm
const LEAD = 2;      // units of quiet before the first mark
const REST = 21;     // units of quiet after the last (three word spaces)

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

for (const holder of document.querySelectorAll(".aux-line[data-morse]")) {
  const station = holder.closest(".station");
  const logo = station?.querySelector(".logo");
  const names = (holder.dataset.names ?? "").split(" ").filter(Boolean);

  /* the line, as the tape builds it: a letter is its marks over its
     name (under the second mark), words apart with a slash */
  const line = el("span", "line live");
  const letters = [];        // { c, marks: [{ m, at, len }] }
  let at = LEAD, n = 0, number = false;
  holder.dataset.morse.trim().split(/\s+\/\s+/).forEach((word, w) => {
    if (w) { line.append(el("span", "slash", "/")); at += 4; }   // 3 after the letter, 7 in all
    /* the status number ends its line; the answer starts the next:
         <AS> / 503 /
            QRX                                                  */
    if (number) line.append(el("span", "break"));
    const codes = word.split(/\s+/);
    number = codes.every((_, l) => /^\d$/.test(names[n + l] ?? ""));
    const wEl = el("span", "w");
    codes.forEach((code, l) => {
      if (l) at += 2;                                             // 1 after the mark, 3 in all
      const c = el("span", "c"), m = el("span", "m");
      const marks = [...code].map((s, i) => {
        if (i) at += 1;
        const len = s === "." ? 1 : 3;
        const mark = { m: el("span", s === "." ? "dot" : "dash", s), at, len };
        at += len;
        m.append(mark.m);
        return mark;
      });
      const name = names[n++] ?? DECODE[code] ?? "?";
      /* the name under the second mark; only the name is underlined */
      const p = el("span", "p", " ".repeat(Math.min(1, code.length - 1)));
      p.append(el("span", "n", name));
      c.append(m, p);
      wEl.append(c);
      letters.push({ c, marks });
    });
    line.append(wEl);
  });
  holder.replaceChildren(line);
  const cycle = at + REST;

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    line.classList.remove("live");      // still: the whole message, lit
    continue;
  }

  const key = down => {
    station?.classList.toggle("lit", down);
    logo?.classList.toggle("down", down);
  };

  /* one pass: every mark and letter on its unit, then round again */
  function pass() {
    for (const { c, marks } of letters) {
      c.classList.remove("sent", "landed");
      for (const { m } of marks) m.classList.remove("keyed");
    }
    letters.forEach(({ c, marks }, i) => {
      for (const { m, at, len } of marks) {
        setTimeout(() => { key(true); m.classList.add("keyed"); }, at * UNIT);
        setTimeout(() => key(false), (at + len) * UNIT);
      }
      const last = marks.at(-1);
      setTimeout(() => {
        if (i) letters[i - 1].c.classList.replace("landed", "sent");
        c.classList.add("landed");
      }, (last.at + last.len) * UNIT);
    });
    setTimeout(pass, cycle * UNIT);
  }
  pass();
}

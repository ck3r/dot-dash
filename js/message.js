/*
 * ============================================================
 * MESSAGE — morse over its letters
 * ============================================================
 *
 *   .... .  .-.. .-.. ---  /  .-- --- .-. .-.. -..
 *    H   E   L    L    O       W   O   R   L    D
 *
 * Each letter sits under the second symbol of its code (the
 * first, for one-symbol letters). Words wrap as whole units.
 *
 * During playback the morse appears one mark at a time as it
 * is keyed; when a character's last mark is done its letter
 * lights up, then settles once the next character starts.
 * Everything not yet sent waits dimmed.
 */

import { DECODE } from "./morse.js";


function span(className, text = "") {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}


export function createMessage(element) {
  let chars = [];
  let index = 0;
  let run = 0;     // which playback we're on (a replay starts a new one)

  function render(words) {
    element.textContent = "";
    chars = [];

    words.forEach((word, w) => {
      if (w) element.append(span("slash", "/"));

      const block = span("word");
      for (const code of word) {
        const ch = span("ch");

        const top = span("code");
        for (const s of code) top.append(span(s === "." ? "dot" : "dash", s));

        const name = DECODE[code] ?? "�";
        const under = Math.min(1, code.length - 1);
        const plain = span("plain", " ".repeat(under) + name);

        ch.append(top, plain);
        block.append(ch);
        chars.push(ch);
      }
      element.append(block);
    });
  }

  function reset() {
    element.classList.remove("live");
    for (const ch of chars) {
      ch.classList.remove("now", "landed", "sent");
      for (const s of ch.querySelectorAll(".keyed")) s.classList.remove("keyed");
    }
  }

  /* keyer events → what has been keyed so far */
  function handle(event) {
    const ch = chars[index];
    switch (event.type) {
      case "start":
        reset();
        index = 0;
        run++;
        if (chars.length) element.classList.add("live");
        break;

      case "beat": {
        if (!ch) break;
        /* the previous letter settles once this one starts */
        chars[index - 1]?.classList.replace("landed", "sent");
        ch.classList.add("now");
        /* light every mark keyed so far (the path length) */
        const marks = ch.querySelector(".code").children;
        for (let i = 0; i < event.path.length && i < marks.length; i++) {
          marks[i].classList.add("keyed");
        }
        break;
      }

      case "letter":
        if (!ch) break;
        ch.classList.replace("now", "landed");
        index++;
        break;

      case "end":
        /* hold the finished message for a moment, then rest */
        if (ch) ch.classList.replace("now", "landed");
        {
          const thisRun = run;
          setTimeout(() => { if (run === thisRun) reset(); }, 600);
        }
        break;
    }
  }

  return { render, handle, reset };
}

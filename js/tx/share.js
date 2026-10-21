/*
 * Paste and share: the share menu (copy, save, the system's share
 * sheet), the wait lamp, and pasting (Ctrl/⌘+V, the paste button,
 * a long-press on the message).
 *
 *   createShare({ state, keyer, shareable, ... }) → {
 *     menu              the share menu's element
 *     openShare(open)
 *     hideBubble()      the long-press "paste" bubble
 *   }
 */
import * as share from "../tx-share.js";

/* the file makers: tx-files.js, loaded the first time one is used */
let filesModule = null;
const files = () => (filesModule ??= import("../tx-files.js"));
import { tokensOf, wordsOf, plainText } from "./state.js";
import { $, el, toast } from "./dom.js";

export function createShare({ state, keyer, shareable, choice, timingNow, setMode, putKeysAway, setTyped }) {
  /*
   * ============================================================
   * PASTE & SHARE
   * ============================================================
   *
   * Paste anywhere (Ctrl/⌘+V), or "paste" in the share menu on a
   * phone: Morse if it starts with . or -, otherwise text. It's
   * added to the end of the current message.
   *
   * The share menu works on the message the player would play:
   * the current line, or the last one sent.
   */

  function pasteIn(raw) {
    if (!raw || !raw.trim()) return false;
    const { words, morse } = share.readPaste(raw);
    if (!words.length) return false;
    keyer.cancel();
    const add = tokensOf(words);
    if (state.tokens.length) {
      /* after what's there, as a new word */
      while (state.tokens.length && (state.tokens.at(-1) === " " || state.tokens.at(-1) === "/")) { state.tokens.pop(); state.took.pop(); }
      if (state.tokens.length) { state.tokens.push("/"); state.took.push(null); }
    }
    state.tokens.push(...add);
    state.took.push(...add.map(() => null));
    state.lastInput = performance.now();
    setTyped(plainText(wordsOf(state.tokens)) ?? state.typed);
    /* switch to how it arrived: Morse to the key, text to the keyboard */
    const want = morse ? "key" : "type";
    if (want !== state.mode) setMode(want);
    putKeysAway(true);   // the keys step aside: it's there to read or play
    return true;
  }

  document.addEventListener("paste", event => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (event.target.closest?.("input, select, textarea")) return;   // (the settings sliders)
    event.preventDefault();
    pasteIn(text);
  });

  /* ---------- the menu ---------- */

  const menu = $("#share");
  const note = msg => {
    $("#share-note").textContent = msg;
    clearTimeout(note.timer);
    note.timer = setTimeout(() => { $("#share-note").textContent = ""; }, 1800);
  };

  function openShare(open) {
    menu.hidden = !open;
    $("#share-toggle").setAttribute("aria-expanded", String(open));
    if (!open) return;
    /* it drops down from just under the share button */
    menu.style.setProperty("--share-top", Math.round($("#share-toggle").getBoundingClientRect().bottom + 8) + "px");
    const p = shareable();
    const words = p?.words ?? [];
    for (const b of menu.querySelectorAll("#share-copy button, .saves button, #share-native button")) b.disabled = !words.length;
    for (const b of menu.querySelectorAll("[data-soon]")) b.disabled = true;   // not ready yet
    menu.querySelector('[data-peek="morse"]').textContent = words.length ? share.morseText(words) : "nothing yet";
    menu.querySelector('[data-peek="text"]').textContent = words.length ? share.plainText(words) : "";
    menu.querySelector('[data-peek="link"]').textContent = words.length ? share.linkTo(words).replace(/^https?:\/\//, "") : "";
    $("#share-native").hidden = !navigator.share;
    /* the .gif comes from the link-preview worker: the live site only */
    $("#save-gif").hidden = location.hostname !== "dot-da.sh";
    $("#share-note").textContent = "";
  }

  $("#share-toggle").addEventListener("click", event => {
    event.stopPropagation();
    openShare(menu.hidden);
  });
  $("#share .close").addEventListener("click", () => openShare(false));

  /* Escape closes it (see ESCAPE); so does a tap outside (see "a tap outside a popup") */

  /*
   * A wait (the .wav rendering, the .gif being made): a small lamp in
   * the share menu keys the wait prosign, ·−··· (AS), at 20 wpm, over
   * and over, until it's done.
   */
  const WAIT_CODE = ".-...";
  let waitTimer = null;

  function waitLamp(on) {
    clearTimeout(waitTimer);
    const box = $("#share-note");
    clearTimeout(note.timer);
    if (!on) { box.textContent = ""; return; }
    box.textContent = "";
    const lamp = el("span", "wait-lamp");
    box.append(lamp, el("span", "wait-label", " AS  wait…"));
    const unit = 1200 / 20;
    const steps = [];                                   // [lit, ms] pairs
    [...WAIT_CODE].forEach((m, i) => {
      if (i) steps.push([false, unit]);
      steps.push([true, (m === "." ? 1 : 3) * unit]);
    });
    steps.push([false, 7 * unit]);                      // a word space, then again
    let i = 0;
    const next = () => {
      const [lit, ms] = steps[i % steps.length];
      lamp.classList.toggle("lit", lit);
      i++;
      waitTimer = setTimeout(next, ms);
    };
    next();
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      note(`copied ${what}`);
    } catch {
      note("couldn't reach the clipboard");
    }
  }

  menu.addEventListener("click", async event => {
    const b = event.target.closest("button[data-do]");
    if (!b || b.disabled) return;
    const p = shareable();
    const words = p?.words ?? [];
    switch (b.dataset.do) {
      case "copy-morse": return copy(share.morseText(words), "the Morse");
      case "copy-text":  return copy(share.plainText(words), "the text");
      case "copy-link":  return copy(share.linkTo(words), "the link");
      case "save-txt": {
        const { save, textFile, fileName } = await files();
        save(textFile(words), fileName(words, "txt"));
        return note("saved .txt");
      }
      case "save-sh": {
        const { save, scriptFile, scriptName } = await files();
        save(scriptFile(words, timingNow().unit), scriptName(words));
        return note("saved the script");
      }
      case "save-wav": {
        waitLamp(true);
        const { save, renderWav, fileName } = await files();
        const blob = await renderWav({
          words, rec: p.rec, timing: timingNow(),
          kind: choice("#opt-sound"),
          wave: choice("#opt-wave"),
          pitch: Number($("#opt-hz").value),
          volume: Number($("#opt-vol").value) / 100
        });
        waitLamp(false);
        save(blob, fileName(words, "wav"));
        return note("saved .wav");
      }
      case "save-gif": {
        /* fetched here (it's made on the server), so the wait shows */
        waitLamp(true);
        try {
          const { save, gifLink, fileName } = await files();
          const r = await fetch(gifLink(words));
          if (!r.ok) throw new Error(r.status);
          const blob = await r.blob();
          waitLamp(false);
          save(blob, fileName(words, "gif"));
          return note("saved .gif");
        } catch {
          waitLamp(false);
          return note("couldn't make the .gif");
        }
      }
      case "share":
        try {
          /* the link alone: its preview shows the message, and the Morse
             beside it said the same thing twice (copy Morse has the Morse) */
          await navigator.share({ title: "dot-da.sh", url: share.linkTo(words) });
        } catch { /* closed the share sheet */ }
        return;
    }
  });


  /* ---------- paste: the header button, and a long-press ---------- */

  /*
   * Must run inside a tap: phones only let a page read the clipboard
   * then. The very first time, the browser's "allow" prompt can cut
   * the read short even when you allow it; so a failed read asks
   * whether it's allowed now (or waits while the prompt is up), and
   * if so tries once more.
   *
   *   read ── fails ──▶ allowed? ── yes ──▶ read again
   *                        │
   *                        no (or no answer in 15 s) ──▶ "the clipboard said no"
   */
  async function pasteFromClipboard(retry = true) {
    try {
      const text = await navigator.clipboard.readText();
      if (!pasteIn(text)) toast("nothing to paste");
    } catch {
      if (retry && await clipboardAllowed()) return pasteFromClipboard(false);
      toast("the clipboard said no");
    }
  }

  /* where the browser can say (Chrome, Edge): allowed already, or
     allowed once the prompt is answered; elsewhere, no */
  async function clipboardAllowed() {
    try {
      const status = await navigator.permissions.query({ name: "clipboard-read" });
      if (status.state !== "prompt") return status.state === "granted";
      return await new Promise(resolve => {
        const done = ok => { clearTimeout(timer); status.onchange = null; resolve(ok); };
        const timer = setTimeout(() => done(false), 15000);
        status.onchange = () => done(status.state === "granted");
      });
    } catch { return false; }   // no "clipboard-read" to ask about (Firefox, Safari)
  }

  $("#paste").addEventListener("click", () => pasteFromClipboard());

  /*
   * Long-press the message (touch): a small "paste" bubble pops
   * up where you pressed, like a text field's. Tap it to paste.
   */
  const bubble = $("#paste-bubble");
  const LONG_PRESS = 480;   // ms
  let pressTimer = null;
  let pressAt = null;
  let longPressed = false;

  function showBubble(x, y) {
    longPressed = true;
    bubble.style.left = Math.max(40, Math.min(innerWidth - 40, x)) + "px";
    bubble.style.top = Math.max(60, y) + "px";
    bubble.hidden = false;
  }

  function hideBubble() {
    bubble.hidden = true;
  }

  $("#tape").addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    longPressed = false;
    pressAt = { x: event.clientX, y: event.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => showBubble(pressAt.x, pressAt.y), LONG_PRESS);
  });

  const cancelPress = () => clearTimeout(pressTimer);
  $("#tape").addEventListener("pointerup", cancelPress);
  $("#tape").addEventListener("pointercancel", cancelPress);
  $("#tape").addEventListener("pointermove", event => {
    if (pressAt && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 10) cancelPress();   // scrolling
  });
  $("#tape").addEventListener("scroll", () => { cancelPress(); hideBubble(); }, { passive: true });

  /* the phone's own long-press menu (Android): ours instead */
  $("#tape").addEventListener("contextmenu", event => {
    if (pressAt) { event.preventDefault(); showBubble(pressAt.x, pressAt.y); }
  });

  /* the press that opened the bubble isn't also a tap (recall, ×) */
  $("#tape").addEventListener("click", event => {
    if (!longPressed) return;
    longPressed = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  bubble.addEventListener("click", () => {
    hideBubble();
    pasteFromClipboard();
  });

  document.addEventListener("pointerdown", event => {
    if (!bubble.hidden && event.target !== bubble) hideBubble();
  });


  return { menu, openShare, hideBubble };
}

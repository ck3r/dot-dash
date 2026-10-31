/*
 * Paste and share: the share menu (copy, save, the system's share
 * sheet), the wait lamp, and pasting (Ctrl/⌘+V, the paste button,
 * a long-press on the message).
 *
 *   createShare({ state, keyer, shareable, ... }) → {
 *     menu              the share menu's element
 *     openShare(open)
 *     hideBubble()      the long-press bubbles (paste, copy)
 *   }
 */
import * as share from "../tx-share.js";

/* the file makers: tx-files.js, loaded the first time one is used */
let filesModule = null;
const files = () => (filesModule ??= import("../tx-files.js"));
import { tokensOf, wordsOf, plainText, morseOf, readingOf } from "./state.js";
import { $, el, toast, nearest } from "./dom.js";
import { parse, READING } from "../morse.js";

export function createShare({ state, keyer, shareable, choice, timingNow, setMode, putKeysAway, setTyped, linkedSettings }) {
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

  /*
   * The link, and with "with my settings" ticked, how it sounds here
   * (speed, pitch, wave …) after a "#" (js/tx/settings.js). Ticked or
   * not is remembered.
   */
  const withSettings = $("#share-settings");
  try { withSettings.checked = localStorage.getItem("dot-dash:share-settings") === "1"; } catch { }
  const link = words => {
    const hash = withSettings.checked ? linkedSettings() : "";
    return share.linkTo(words) + (hash ? "#" + hash : "");
  };
  const peekLink = words => {
    menu.querySelector('[data-peek="link"]').textContent = words.length ? link(words).replace(/^https?:\/\//, "") : "";
    /* the end of the link, where the peek above is cut short */
    menu.querySelector('[data-peek="settings"]').textContent = withSettings.checked ? (linkedSettings() ? "#" + linkedSettings() : "all as usual") : "";
  };
  withSettings.addEventListener("change", () => {
    try { localStorage.setItem("dot-dash:share-settings", withSettings.checked ? "1" : "0"); } catch { }
    peekLink(shareable()?.words ?? []);
  });

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
    for (const b of menu.querySelectorAll("#share-copy button, .saves button, #share-voice button, #share-native button")) b.disabled = !words.length;
    menu.querySelector('[data-peek="morse"]').textContent = words.length ? share.morseText(words) : "nothing yet";
    menu.querySelector('[data-peek="text"]').textContent = words.length ? share.plainText(words) : "";
    peekLink(words);
    withSettings.disabled = !words.length;
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
      case "copy-link":  return copy(link(words), "the link");
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
      case "save-voice": {
        /* from the text, not the marks: what's read out is what it says */
        waitLamp(true);
        try {
          const { save, renderSpoken, fileName } = await files();
          const blob = await renderSpoken(share.plainText(words));
          waitLamp(false);
          if (!blob) return note("nothing in it to say");
          save(blob, fileName(words, "spoken.wav"));
          return note("saved spoken .wav");
        } catch {
          waitLamp(false);
          return note("couldn't load the voice");
        }
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
          await navigator.share({ title: "dot-da.sh", url: link(words) });
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
   * Long-press the message (touch), like a text field's:
   *
   *   on a line with a message     copy it:  ┌───────┬──────┐
   *                                          │ morse │ text │
   *                                          └───▲───┴──────┘
   *                                              ● slide along, let go on one
   *                                (as the quick lists; let go without
   *                                sliding and it stays, for a tap)
   *   on an empty line             paste
   *
   * Not on the marker column: the > and the eye (its hold is its own).
   * What the eye hides can't be copied, so that half is greyed.
   */
  const bubble = $("#paste-bubble"), copier = $("#copy-bubble");
  const LONG_PRESS = 480;   // ms
  const SLIDE = 8;          // px: a finger moved this far is sliding, not resting
  let pressTimer = null;
  let pressAt = null;
  let longPressed = false;
  let copying = null;       // { words, reading, held, slid, pick } while the copy bubble's up

  /* the message on the line pressed: the one being written, or a sent one */
  function messageAt(target) {
    const line = target?.closest?.(".entry .line");
    if (!line) return null;
    const entry = line.closest(".entry");
    if (entry.classList.contains("current")) {
      const words = wordsOf(state.tokens);
      return words.length ? { words, reading: READING } : null;
    }
    const saved = state.history[Number(entry.dataset.i)];
    return saved ? { words: parse(morseOf(saved)), reading: readingOf(saved) } : null;
  }

  /* just above the finger, kept on screen */
  function place(b, x, y) {
    b.hidden = false;
    const half = b.offsetWidth / 2;
    b.style.left = Math.max(half + 6, Math.min(innerWidth - half - 6, x)) + "px";
    b.style.top = Math.max(60, y) + "px";
  }

  function showBubble(x, y, target) {
    longPressed = true;
    const msg = messageAt(target);
    if (msg) {
      const hidden = state.hidden ? (state.mode === "type" ? "morse" : "text") : null;
      for (const b of copier.querySelectorAll("button")) {
        b.classList.remove("on");
        b.disabled = b.dataset.copy === hidden;
      }
      copying = { ...msg, held: true, slid: false, pick: null };
      place(copier, x, y);
      return;
    }
    if (state.tokens.length) { longPressed = false; return; }   // a message, but not pressed on: nothing
    place(bubble, x, y);
  }

  function hideBubble() {
    bubble.hidden = true;
    copier.hidden = true;
    copying = null;
  }

  async function copyAs(what) {
    if (!copying) return;
    const { words, reading } = copying;
    hideBubble();
    try {
      await navigator.clipboard.writeText(what === "text" ? share.plainText(words, reading) : share.morseText(words));
      toast(what === "text" ? "copied the text" : "copied the Morse");
    } catch {
      toast("couldn't reach the clipboard");
    }
  }

  $("#tape").addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    if (event.target.closest(".marker")) return;    // the > and the eye
    longPressed = false;
    pressAt = { x: event.clientX, y: event.clientY };
    const target = event.target;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => showBubble(pressAt.x, pressAt.y, target), LONG_PRESS);
  });

  const cancelPress = () => clearTimeout(pressTimer);
  $("#tape").addEventListener("pointerup", () => {
    cancelPress();
    if (!copying?.held) return;
    copying.held = false;
    if (copying.slid && copying.pick) copyAs(copying.pick.dataset.copy);   // let go on one: copied
  });
  $("#tape").addEventListener("pointercancel", () => { cancelPress(); if (copying) copying.held = false; });
  $("#tape").addEventListener("pointermove", event => {
    if (copying?.held) {
      /* sliding along the copy bubble */
      if (!copying.slid && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) < SLIDE) return;
      copying.slid = true;
      copying.pick = nearest([...copier.querySelectorAll("button:not(:disabled)")], event.clientX, event.clientY);
      for (const b of copier.querySelectorAll("button")) b.classList.toggle("on", b === copying.pick);
      return;
    }
    if (pressAt && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 10) cancelPress();   // scrolling
  });
  /* while the finger's on the copy bubble, it slides; the tape stays put */
  $("#tape").addEventListener("touchmove", event => {
    if (copying?.held && event.cancelable) event.preventDefault();
  }, { passive: false });
  $("#tape").addEventListener("scroll", () => { cancelPress(); hideBubble(); }, { passive: true });

  /* the phone's own long-press menu (Android): ours instead */
  $("#tape").addEventListener("contextmenu", event => {
    if (pressAt) event.preventDefault();
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
  copier.addEventListener("click", event => {
    const b = event.target.closest("button");
    if (b && !b.disabled) copyAs(b.dataset.copy);
  });

  document.addEventListener("pointerdown", event => {
    if ((!bubble.hidden || !copier.hidden) && !event.target.closest?.("#paste-bubble, #copy-bubble")) hideBubble();
  });


  return { menu, openShare, hideBubble };
}

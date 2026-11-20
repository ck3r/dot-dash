/*
 * A text of your own, typed on the station's text keyboard in the
 * keys' place (the same height: nothing above it moves).
 *
 *   ┌ field ────┐           ┌ field ────┐
 *   │ CQ DE K   │  tap ▶    │ HELLO▮    │
 *   ├─────┬─────┤           ├───────────┤
 *   │  ●  │  ▬  │           │ Q W E R … │
 *   └─────┴─────┘           └───────────┘
 *
 * A tap on the field brings it up; a tap there again, ↵ or Esc, and
 * the keys are back. A real keyboard types too while it's up. The
 * address is left as it was: it says what was linked, not what was
 * typed since.
 *
 *   createTyping({ field, board, text, change, before, toggle }) → {
 *     on()          is the keyboard up
 *     key(event)    a keydown, while it is
 *   }
 *
 * field: what's tapped; board: the keyboard's box (#kbd, with the
 * page's #hold-pop: js/shared/keyboard.js fills it, fetched the first
 * time); text(): what to start from; change(text): typed, capitals,
 * one space at most between words; before(): the keyboard is
 * about to come up (stop what's running); toggle(on): it's up, or
 * gone.
 *
 * Pasted (Ctrl+V, the browser's menu): with the keyboard up, it's
 * added to what's there; with it down, it comes up holding just
 * that. Read as the station reads text from elsewhere (morse.js
 * wordsFrom): Morse as Morse, curly quotes straight, accents off,
 * whatever Morse hasn't got dropped, lines and paragraphs as words.
 *
 * The page hides its keys by body[data-input="text"].
 */
import { chord } from "./paddles.js";
import { wordsFrom, DECODE } from "../core/morse.js";

export function createTyping({ field, board, text, change, before, toggle }) {
  let on = false, draft = "";
  let keyboard = null;

  function set(next) {
    draft = next.toUpperCase().replace(/\s+/g, " ").replace(/^ /, "");
    change(draft);
  }

  function typeKey(k) {
    if (k === "send") return show(false);
    if (k === "back") return set(draft.slice(0, -1));
    if (k === "back-word") return set(draft.replace(/\S*\s*$/, ""));
    set(draft + k);
  }

  function key(event) {
    if ((event.ctrlKey || event.altKey) && event.key === "Backspace") { event.preventDefault(); return typeKey("back-word"); }
    if (chord(event) || event.ctrlKey) return;
    if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); return show(false); }
    if (event.key === "Backspace") { event.preventDefault(); return typeKey("back"); }
    if (event.key.length !== 1) return;
    event.preventDefault();
    typeKey(event.key);
  }

  async function show(next) {
    if (next === on) return;
    if (next) before?.();
    if (next && !keyboard) keyboard = (await import("../shared/keyboard.js")).createKeyboard({ typeKey });
    on = next;
    document.body.dataset.input = on ? "text" : "keys";
    board.hidden = !on;
    if (on) draft = text();
    toggle?.(on);
  }

  field.addEventListener("click", () => show(!on));

  /* pasted: as letters, the way it would be typed (<BT> as its =) */
  document.addEventListener("paste", async event => {
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const words = wordsFrom(event.clipboardData?.getData("text") ?? "");
    const text = words.map(w => w.map(c => DECODE[c] ?? "").join("")).join(" ");
    if (!text) return;
    event.preventDefault();
    const was = on;
    await show(true);
    set(was && draft ? `${draft.trimEnd()} ${text}` : text);
  });

  return { on: () => on, key };
}

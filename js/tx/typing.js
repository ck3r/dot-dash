/*
 * Type mode: what's been typed, the station's own keyboard (js/tx/
 * keyboard.js), and a computer keyboard typing into it.
 *
 *   createTyping({ state, sound, update, send, soundLetter, ... }) → {
 *     setTyped(text)     what's been typed (it shows in the message)
 *     retype(text)       type it afresh: the message follows
 *     openHold(open)     the keyboard's hold menu
 *   }
 */
import { ENCODE, encode } from "../morse.js";
import { tokensOf } from "./state.js";
import { createKeyboard } from "./keyboard.js";
import { $ } from "./dom.js";

export function createTyping({ state, sound, update, send, soundLetter, playing, stopPlayback }) {
  /*
   * ============================================================
   * TYPE MODE: our own keyboard
   * ============================================================
   *
   * The phone's keyboard would pop up and push the page around,
   * so type mode has its own: all caps (Morse has no case), only
   * characters Morse can send, and each key shows its code and
   * sounds it when tapped. A computer keyboard types here too.
   */

  /* what's been typed (it shows in the message itself) */
  function setTyped(text) {
    state.typed = text;
  }

  function retype(text) {
    setTyped(text);
    state.lastInput = performance.now();
    state.tokens = tokensOf(encode(state.typed));
    /* a space typed after the last word is on the line too, as the
       pad's word space is: the caret moves past it, and ⌫ visibly
       takes it back */
    if (/\S $/.test(state.typed) && state.tokens.at(-1) === " ") state.tokens[state.tokens.length - 1] = "/";
    state.took = state.tokens.map(() => null);   // typed: no keying to replay
    update();
  }

  function typeKey(k) {
    if (playing() || state.playKey !== null) stopPlayback();   // back to keying: the player lets go, rewound
    state.localCleared = k === " ";
    if (k === "back") return retype(state.typed.replace(/(<[A-Z]+>|[^])$/, ""));   // a prosign, <SK>, goes whole
    if (k === "back-word") return retype(state.typed.replace(/\S*\s*$/, ""));   // the last word (and the space after it)
    if (k === "send") return send();
    if (k === " ") {
      if (!state.typed || state.typed.endsWith(" ")) return;   // no leading or double spaces
      return retype(state.typed + " ");
    }
    /* a Q code: its letters, as a word of its own */
    if (/^Q[A-Z]{2}$/.test(k)) {
      state.record("type", { char: k });
      sound.unlock();
      for (const ch of k) soundLetter(ENCODE[ch]);
      return retype(state.typed + (state.typed && !state.typed.endsWith(" ") ? " " : "") + k);
    }
    const code = ENCODE[k];
    if (!code) return;
    state.record("type", { char: k });
    sound.unlock();
    soundLetter(code);
    retype(state.typed + k);
  }

  /* the on-screen keyboard: js/tx/keyboard.js */
  const { openHold } = createKeyboard({ typeKey });

  /* a computer keyboard: letters, digits, the symbols Morse has */
  document.addEventListener("keydown", event => {
    if (state.mode !== "type" || event.target.closest?.("input, select, textarea")) return;
    /* Ctrl / Alt + Backspace: a word, as in any text field */
    if (event.key === "Backspace" && (event.ctrlKey || event.altKey) && !event.metaKey) {
      event.preventDefault();
      return typeKey("back-word");
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.("input, select, textarea")) return;
    let k = null;
    if (event.key === "Backspace") k = "back";
    else if (event.key === "Enter") k = "send";
    else if (event.key.length === 1) k = event.key.toUpperCase();
    if (!k || (k.length === 1 && k !== " " && !ENCODE[k])) return;
    event.preventDefault();
    const b = $(`#kbd button[data-k="${CSS.escape(k)}"]`);
    b?.classList.add("pressed");
    setTimeout(() => b?.classList.remove("pressed"), 120);
    typeKey(k);
  });

  return { setTyped, retype, openHold };
}

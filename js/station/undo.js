/*
 * Undo (Ctrl/⌘+Z): the line being written, back a step at a time.
 * Redo (Ctrl/⌘+Shift+Z, or Ctrl+Y) goes forward again, until the
 * line changes some other way: then there's nothing ahead.
 *
 * Nothing has to report here: every change to the line ends in
 * update(), which calls watch(), and a line that differs from the
 * last one seen puts that one on the stack. So keying, typing, ⌫, the
 * ×, a paste, a tap in the tree and a recall all undo the same way.
 *
 *   a keyed letter     one step, its marks and the space closing it
 *   a typed character  one step
 *   a delete, a clear  one step: undone, it comes back
 *
 * The stack ends at the empty line. Return starts a new one, so what
 * went up to the history stays there: forget() is called with the
 * line gone, and nothing is left to go back to. The history itself
 * isn't the line's, so a removed entry doesn't come back either.
 *
 *   H I ↵  A T  ⌃Z ⌃Z ⌃Z     >  ▌       (HI stays in the history)
 *
 *   createUndo({ state }) → {
 *     watch()     the line as it is now (from update)
 *     step()      back one step; false if there's nothing to go back to
 *     redo()      forward one step; false if there's nothing ahead
 *     forget()    start from the line as it is now
 *   }
 */
import { wordsOf, plainText } from "./state.js";

const MAX = 200;      // steps; a long message and then some

export function createUndo({ state }) {
  const copy = () => ({
    tokens: [...state.tokens], took: [...state.took],
    typed: state.typed, mode: state.mode, localCleared: state.localCleared
  });
  let seen = copy();
  let stack = [];
  let ahead = [];       // what undo stepped back from, nearest last

  /* keying, the same letter still going: more marks, its closing
     space, or that space becoming a word space */
  function sameLetter(was, now) {
    if (state.mode !== "key") return false;
    if (was.at(-1) === " " && now.at(-1) === "/" && was.length === now.length) return was.slice(0, -1).every((t, i) => t === now[i]);
    if (was.at(-1) !== "." && was.at(-1) !== "-") return false;
    if (now.length <= was.length || !was.every((t, i) => t === now[i])) return false;
    return !/[ /][.-]/.test(now.slice(was.length).join(""));
  }

  function watch() {
    if (state.tokens.join("") === seen.tokens.join("")) return;
    ahead = [];
    if (!sameLetter(seen.tokens, state.tokens)) {
      stack.push(seen);
      if (stack.length > MAX) stack.shift();
    }
    seen = copy();
  }

  function restore(to) {
    state.tokens = [...to.tokens];
    state.took = [...to.took];
    /* typed in the other mode: the text from its Morse, as a mode change does */
    state.typed = to.mode === state.mode ? to.typed : plainText(wordsOf(state.tokens)) ?? "";
    state.localCleared = to.localCleared;
    state.lastInput = performance.now();
    seen = to;
  }

  function step() {
    watch();
    if (!stack.length) return false;
    ahead.push(copy());
    restore(stack.pop());
    return true;
  }

  function redo() {
    watch();
    if (!ahead.length) return false;
    stack.push(copy());
    restore(ahead.pop());
    return true;
  }

  function forget() {
    stack = [];
    ahead = [];
    seen = copy();
  }

  return { watch, step, redo, forget };
}

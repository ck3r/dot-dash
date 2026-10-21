/*
 * ============================================================
 * TX — the transmit station   (dot-da.sh)
 * ============================================================
 *
 * Startup and wiring. Each part of the station is a module here in
 * js/tx/, made in the order the page needs them:
 *
 *   state.js     the message, the tape, the modes, the event log
 *   tape.js      the line being written, the history above it
 *   tree.js      the collapsed tree, the about column, the whole tree
 *   keys.js      the pad, a computer keyboard, the keyers, the train
 *   typing.js    type mode and its keyboard
 *   settings.js  the tray, the outputs, the light
 *   player.js    play, scrub, repeat, the trace, the player keys
 *   share.js     share, paste, saves, the wait lamp
 *   layer.js     popups, outside taps, Escape
 *   tab.js       the browser tab keying: its title and icon
 *
 * What stays here: the note on arrival, keying into the message
 * (press, send), update, the input slot, and startup. A part made
 * before another it calls reaches it late, through a small arrow
 * (stopPlayback: () => stopPlayback()), so the order above holds.
 */

import { parse, format, NAME_CODE } from "../morse.js";
import { createSound } from "../tx-sound.js";
import { PROSIGNS_BY_CODE } from "../characters.js";
import { $, toast } from "./dom.js";
import { createState, structure, wordsOf, tokensOf, tookFor, morseOf, recOfEntry, plainText } from "./state.js";
import { createTape } from "./tape.js";
import { createTreeEdge } from "./tree.js";
import { createKeys, timingNow } from "./keys.js";
import { createTyping } from "./typing.js";
import { createSettings, choice } from "./settings.js";
import { createPlayback } from "./player.js";
import { createShare } from "./share.js";
import { createLayer } from "./layer.js";
import { createTab } from "./tab.js";

/* the message, the tape, the modes, the event log: js/tx/state.js */
const state = createState();

/* errors, into the event log from the start (the report, in settings,
   lists the last few) */
addEventListener("error", e => state.record("error", { message: e.message, where: `${(e.filename || "").replace(location.origin, "")}:${e.lineno}` }));
addEventListener("unhandledrejection", e => state.record("error", { message: String(e.reason?.message ?? e.reason) }));

/* the browser tab keys too: js/tx/tab.js */
const tab = createTab();


/*
 * ARRIVAL: the note over the keys (don't send anything private) is
 * gone at the first touch, click or key press anywhere, and that
 * first interaction does nothing else: no dit, no play, no menu.
 * Its (i) is the one exception: the note goes and the details open.
 * Registered first, so it's ahead of every other handler.
 */
{
  const REST = ["pointerup", "click", "mouseup", "touchend", "keyup", "contextmenu"];
  const eat = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const stopEating = () => { for (const t of REST) window.removeEventListener(t, eat, true); };
  /* seen in the last 30 days (see the <head>): it stays away */
  const NOTICE_KEY = "dot-dash:tx-noticed";
  if (document.documentElement.classList.contains("noticed")) $("#notice").hidden = true;
  const first = event => {
    const notice = $("#notice");
    if (!notice || notice.hidden) return finish();
    notice.hidden = true;
    try { localStorage.setItem(NOTICE_KEY, String(Date.now())); } catch { }
    try { sound.unlock(); } catch { }     // the first touch wakes the sound (browsers need one)
    eat(event);
    for (const t of REST) window.addEventListener(t, eat, { capture: true, once: true });
    setTimeout(stopEating, 700);          // a drag gives no click: stop waiting for one
    /* on touch, the swallowed release means no click comes at all:
       the next press clears whatever is still waiting */
    for (const t of ["pointerdown", "keydown"]) window.addEventListener(t, stopEating, { capture: true, once: true });
    if (event.type === "pointerdown" && event.target.closest?.("#notice .privacy-open")) {
      setTimeout(() => openPrivacy(true));  // after the handlers below are in place
    }
    finish();
  };
  const finish = () => {
    window.removeEventListener("pointerdown", first, true);
    window.removeEventListener("keydown", first, true);
  };
  window.addEventListener("pointerdown", first, true);
  window.addEventListener("keydown", first, true);
}

/*
 * ============================================================
 * THE MESSAGE
 * ============================================================
 */

/* drop tokens (and their timing) from the end */
function drop(n = 1) {
  state.tokens.splice(-n, n);
  state.took.splice(-n, n);
}

/* the last word, back to the word space before it (which stays); at
   a word space already, that and the word before it */
function dropWord() {
  while (state.tokens.length && (state.tokens.at(-1) === " " || state.tokens.at(-1) === "/")) drop();
  while (state.tokens.length && state.tokens.at(-1) !== "/") drop();
}

/*
 * Prosigns that act: keyed as one letter, on the pad, they do on the
 * line what they mean on the air, and go themselves (the setting
 * "prosigns", on by default; off, they're the symbols they share a
 * code with). Pasted, typed or in a link, they stay as they are.
 *
 *   HH  ........ (or more)  error             erases the word before it
 *   AR  .-.-.               end of message    return (↵)
 *   BT  -...-               new paragraph     return
 *   SK  ...-.-              end of contact    return
 *   BK  -...-.-             break, over to you  return
 *   CL  -.-..-..            closing down      return
 *
 * Left alone: AA (new line) is also Ä, KA and AS are ! … and &
 * openers, K and KN are letters. Each one says what it did, quietly.
 *
 *   H E / W R O L D / . . . . . . . .  ˽     (letter space: it closes)
 *   H E /                                  WROLD and HH gone
 *
 *   H I / . - . - .  ˽                       HI goes up into the history
 */
const HH = 8;
const RETURNS = { ".-.-.": "AR", "-...-": "BT", "...-.-": "SK", "-...-.-": "BK", "-.-..-..": "CL" };
const prosignsAct = () => $("#opt-prosigns").checked;

/* the last letter on the line: its code, and where it starts */
function lastLetter() {
  const t = state.tokens;
  let end = t.length;
  while (end && (t[end - 1] === " " || t[end - 1] === "/")) end--;
  let start = end;
  while (start && (t[start - 1] === "." || t[start - 1] === "-")) start--;
  return { code: t.slice(start, end).join(""), start };
}

function erased() {
  const { code, start } = lastLetter();
  if (code.length < HH || /-/.test(code)) return false;
  drop(state.tokens.length - start);
  dropWord();
  return true;
}

/* AR and the rest: the prosign goes, the line goes up */
function returned() {
  const { code, start } = lastLetter();
  if (!RETURNS[code]) return null;
  drop(state.tokens.length - start);
  return code;
}

function press(act, timing = null) {
  state.lastInput = performance.now();
  if (act === "." || act === "-" || act === "undo" || act === "word-back") state.localCleared = false;
  if (timing) timing.unit = Math.round(timingNow().unit * 10) / 10;   // the speed it was keyed at
  const last = state.tokens[state.tokens.length - 1];
  switch (act) {
    case ".":
    case "-":
      state.tokens.push(act);
      state.took.push(timing);
      break;
    case "letter":
      if (last === "." || last === "-") { state.tokens.push(" "); state.took.push(null); }
      break;
    case "word":
      if (!state.tokens.length || last === "/") break;
      if (last === " ") state.tokens[state.tokens.length - 1] = "/";
      else { state.tokens.push("/"); state.took.push(null); }
      break;
    case "undo":
      drop();
      break;
    case "word-back":
      dropWord();
      break;
  }
  state.record(act === "." || act === "-" ? "mark" : act, act === "." || act === "-" ? { mark: act, timing } : {});
  const closed = act === "letter" || act === "word";
  if (closed && prosignsAct()) {
    if (erased()) { state.record("erase"); toast("HH: error, the word erased"); }
    const code = returned();
    if (code) {
      state.record("prosign", { name: RETURNS[code] });
      update();
      send();
      toast(`${RETURNS[code]}: ${PROSIGNS_BY_CODE[code][2]} ↵`);
      return;
    }
  }
  /* typing, a letter keyed on the switch joins the text (one that
     isn't a character goes) */
  if (state.mode === "type" && closed) {
    if (plainText(wordsOf(state.tokens)) === null) drop(state.tokens.length - lastLetter().start);
    setTyped((plainText(wordsOf(state.tokens)) ?? "") + (state.tokens.at(-1) === "/" ? " " : ""));
  }
  update();
  /* the site's own marks, keyed as a letter: the name keys itself */
  if (closed && !structure(state.tokens).path && wordsOf(state.tokens).flat().at(-1) === NAME_CODE && last !== " " && last !== "/") tab.greet();
}

/*
 * Return (↵): the line goes up into the history and a fresh one
 * starts, a typewriter's carriage return. Nothing leaves the
 * device; "send" is its name in the code and the event log.
 *
 * Scrolled up into the history, it also brings you back down to
 * the line (and returns it, if there's anything on it): the corner
 * button wakes up for that even with the line empty.
 *
 *   │ ... --- ...        │   scrolled up
 *   │ .... ..            │
 *   ├ ─ ─ ─ ─ ─ ─ ─ (↵) ─┤   ↵: back to  > ▌
 */
function awayFromLine() {
  const tape = $("#tape"), caret = tape.querySelector(".current .caret");
  if (!caret) return false;
  const t = tape.getBoundingClientRect(), c = caret.getBoundingClientRect();
  return c.top > t.bottom - 4 || c.bottom < t.top + 4;
}

function syncReturn() {
  const b = $("#send");
  const away = awayFromLine();
  b.disabled = !wordsOf(state.tokens).length && !away;
  b.title = away && !wordsOf(state.tokens).length ? "back to the line (Enter)" : "return: a new line (Enter)";
}
$("#tape").addEventListener("scroll", syncReturn, { passive: true });
function send() {
  /* it cuts everything short: the player, and taps or typed
     letters still catching up (their lamp and their sound) */
  if (player.playing || state.playKey !== null) stopPlayback();
  cancelTaps();
  sound.silence();
  setSignal(false);
  const words = wordsOf(state.tokens);
  if (!words.length) {          // nothing to return: just back down to the line
    settleTape();
    syncReturn();
    return;
  }
  keyer.reset();
  state.addToHistory(state.entry());
  state.record("send", { morse: format(words) });
  state.tokens = [];
  state.took = [];
  setTyped("");
  trace.rest();
  update();
}


/* the tape: js/tx/tape.js */
const { drawTape, drawStats, settleTape, fadeTape, hiding, redact, clearCurrent } = createTape({
  state, update, setTyped: text => setTyped(text), resetKeyer: () => keyer.reset()
});


/* the collapsed tree, the about column, the whole tree: js/tx/tree.js */
const { tree, about, drawLocal, drawTree, followNode, openTree, isTreeOpen, inTree, REAL } = createTreeEdge({
  state, press, retype: text => retype(text), update, settleTape, hiding, redact, cancelKeyer: () => keyer.cancel(),
  openHeard: open => openHeard(open), openCut: code => openCut(code), greet: () => tab.greet(), playing: () => player.playing, stopPlayback: () => stopPlayback()
});


/*
 * ============================================================
 * UPDATE
 * ============================================================
 */

function update() {
  const { word, path } = structure(state.tokens);
  /* the message changed under the player: stop it */
  if (state.playKey !== null && state.playKey !== messageKey()) stopPlayback();
  drawTape();
  drawStats();
  drawLocal();
  drawTree();
  syncReturn();
  state.saveLine();   // kept on this device, like the tape
  tapeRedrawn();   /* re-apply any playback highlight */
  playerControls();
  tab.follow(format(wordsOf(state.tokens)));   // a new message: the tab's title goes back to the name
}


const sound = createSound();

/* the pad, the computer keyboard, the keyers, the timing train: js/tx/keys.js */
const { keyer, trainView, logo, ctrlPaddle, isChord, setKeyMode, syncKeySelect, cancelTaps, soundLetter } = createKeys({
  state, sound, press, send, putKeysAway, setMode, showInput,
  setSignal: down => setSignal(down), playing: () => player.playing, traceLive: down => trace.live(down),
  stopPlayback: () => stopPlayback(), quietOutputs: () => outputs?.quiet()
});


/*
 * ============================================================
 * INPUT MODE: key Morse [.-]  or  type text [A]
 * ============================================================
 */

/*
 * Read mode: the caret beside the input modes puts the pad /
 * keyboard away, so the message gets the room (to read a long
 * history, or show someone); tap it again, or either mode, to
 * bring it back. A computer keyboard still keys meanwhile.
 */
function markModeButtons() {
  syncKeySelect();
  for (const side of document.querySelectorAll(".input-mode .side")) side.classList.toggle("on", side.dataset.mode === state.mode);
  $(".input-mode").setAttribute("aria-label", state.mode === "key" ? "keying Morse: switch to typing" : "typing: switch to keying Morse");
  const t = $("#keys-toggle");
  t.setAttribute("aria-expanded", String(!state.inputAway));
  t.title = state.inputAway ? "show the keys" : "hide the keys (read mode)";
  t.setAttribute("aria-label", t.title);
}

function putKeysAway(away) {
  state.inputAway = away;
  if (state.inputAway) openTray(false);
  markModeButtons();
  showInput();
  update();     // the message area changed size
}

function setMode(next, focus = true) {
  state.mode = next;
  state.inputAway = false;
  document.body.dataset.mode = state.mode;
  markModeButtons();
  showInput();
  if (state.mode === "type") setTyped(plainText(wordsOf(state.tokens)) ?? "");
  try { localStorage.setItem("dot-dash:tx-mode", state.mode); } catch { }
  update();
}

/* profiles: not yet (a moment's "soon" over it, as the spoken names) */
$("#profile").addEventListener("click", () => {
  const b = $("#profile");
  b.dataset.flash = "soon";
  clearTimeout(b.flashTimer);
  b.flashTimer = setTimeout(() => delete b.dataset.flash, 1200);
});

/* one switch: a press anywhere flips it; the side that comes on
   flashes brass (with the keys away, they come back, flipped) */
$(".input-mode").addEventListener("click", () => {
  const next = state.mode === "key" ? "type" : "key";
  setMode(next);
  const on = $(`.input-mode .side[data-mode="${next}"]`);
  on.classList.remove("flash");
  void on.offsetWidth;         // restart the animation
  on.classList.add("flash");
});
$(".input-mode").addEventListener("animationend", event => event.target.classList.remove("flash"));
$("#keys-toggle").addEventListener("click", () => putKeysAway(!state.inputAway));

/* one input slot: the pad or the keyboard; the tray takes their
   place while it's open */
function showInput() {
  const off = !$("#tray").hidden || state.inputAway;   // the tray in their place, or put away
  $("#pad").hidden = off || state.mode !== "key";
  $("#type").hidden = off || state.mode !== "type";
  $("#train").hidden = off || state.mode !== "key" || state.keyMode === "tap";
  document.body.classList.toggle("reading", state.inputAway && $("#tray").hidden);
}

/* type mode: js/tx/typing.js */
const { setTyped, retype, openHold } = createTyping({
  state, sound, update, send, soundLetter, playing: () => player.playing, stopPlayback: () => stopPlayback()
});


/* the settings tray, the outputs, the light: js/tx/settings.js */
const {
  outputs, setSignal, openTray, start: startSettings, trayJustClosed,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp, cancelLamp, torchOn
} = createSettings({
  state, sound, logo, ctrlPaddle, timingNow, showInput, drawStats,
  stopPlayback: () => stopPlayback(), redrawTrace: () => trace.redraw()
});

/*
 * A tap in the message box puts the keys away, like tapping out of
 * a text field; another brings them back (the chevron follows).
 * Taps on things in the box that do something (a sent message to
 * key again, ×, the eye, clear history) do just that, and the strip
 * along the bottom (the counts, which copy, and ↵, even greyed) is
 * never a tap in the message: one tap, one thing.
 */
$(".field").addEventListener("click", event => {
  if (event.target.closest("button, a, input, select, .entry.past .line, .tape-head, .paste-bubble, .field-foot, .switch")) return;
  if (trayJustClosed()) return;     // that tap closed the settings
  putKeysAway(!state.inputAway);
});


/*
 * A phone's flashlight takes tens of milliseconds to switch: past
 * about 25 wpm it drops marks. While it's the light, playback goes
 * no faster than 20 wpm (a 60 ms dit), and says so when it starts.
 * Keying live can't be slowed: the light follows your hand.
 */
const TORCH_WPM = 20;
const playTiming = () => timingNow(torchOn() ? TORCH_WPM : Infinity);
const speedNote = () =>
  torchOn() && Number($("#opt-wpm").value) > TORCH_WPM ? `flashlight: played at ${TORCH_WPM} wpm, as fast as it switches` : null;

/* the player row: js/tx/player.js */
const {
  player, trace, playerControls, stopPlayback, messageKey, shareable, tapeRedrawn, isPlayerActive, setPlayerActive
} = createPlayback({
  state, sound, keyer, tree, trainView, tab, timingNow: playTiming, speedNote, choice, cancelTaps, setSignal,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp,
  drawLocal, drawTree, settleTape, fadeTape, followNode, inTree, REAL, isTreeOpen
});

/* paste and share: js/tx/share.js */
const { menu, openShare, hideBubble } = createShare({
  state, keyer, shareable, choice, timingNow, setMode, putKeysAway, setTyped
});


/* popups, outside taps, Escape: js/tx/layer.js */
const { openPrivacy, openHeard, openCut } = createLayer({
  state, about, update, clearCurrent, putKeysAway, isChord, openHold, menu, openShare, hideBubble,
  cancelLamp, closeLamp, stopPlayback, isPlayerActive, setPlayerActive,
  /* something to cancel: playing, or paused part-way (not at the start or the end) */
  playerBusy: () => player.playing || (state.playKey !== null && player.position > 0 && player.position < player.duration)
});


/*
 * ============================================================
 * START
 * ============================================================
 */

startSettings();
trainView.build();
setKeyMode($("#opt-key").value);

/* a shared link, dot-da.sh/?/…: the message on the line, ready to
   play (not played: browsers need a tap first); the address is
   tidied back to / so a later edit doesn't leave a stale link.
   Whatever was on the line unsent (kept from last time) goes onto
   the tape first, unless it's the same message; with no link, it
   comes back to the line. */
{
  const q = location.search;
  const kept = state.savedLine();
  if (q.startsWith("?/")) {
    let words = [];
    try { words = parse(decodeURIComponent(q.slice(2))); } catch { }
    if (words.length && kept && morseOf(kept) !== format(words)) state.addToHistory(kept);
    if (words.length) {
      state.tokens = tokensOf(words);
      state.took = state.tokens.map(() => null);
      setTyped(plainText(words) ?? "");
      state.localCleared = false;
    }
    window.history.replaceState(null, "", "/" + location.hash);   // (history, alone, is the tape)
    tab.arrive(words, words.length ? format(words) : null);
  } else {
    if (kept) {
      state.tokens = tokensOf(parse(morseOf(kept)));
      state.took = tookFor(state.tokens, recOfEntry(kept));
      setTyped(plainText(wordsOf(state.tokens)) ?? "");
    }
    tab.arrive(null);     // the name keys itself
  }
}

let savedMode = "key";
try { savedMode = localStorage.getItem("dot-dash:tx-mode") ?? "key"; } catch { }
setMode(savedMode === "type" ? "type" : "key", false);

let savedTree = "0";
try { savedTree = localStorage.getItem("dot-dash:tx-tree") ?? "0"; } catch { }
if (savedTree === "1") openTree(true);


/* the station is ready: the waiting screen (index.html) goes */
$("#waiting")?.remove();

/* installable, and usable offline (see /sw.js) */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { }));
}

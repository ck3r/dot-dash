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
 *   suggest.js   the chips that finish what you've started
 *   settings.js  the tray, the outputs, the light
 *   player.js    play, scrub, repeat, the trace, the player keys
 *   share.js     share, paste, saves, the wait lamp
 *   layer.js     popups, outside taps, Escape
 *   tab.js       the browser tab keying: its title and icon
 *   stats.js     your keying, counted from the event log
 *   wear.js      where your finger lands on each key
 *   profile.js   the ring: a callsign, those counts, the wear
 *
 * What stays here: the note on arrival, keying into the message
 * (press, send), update, the input slot, and startup. A part made
 * before another it calls reaches it late, through a small arrow
 * (stopPlayback: () => stopPlayback()), so the order above holds.
 */

import { parse, readLink, wordsFrom, format, DECODE, NAME_CODE, READING } from "../morse.js";
import { spokenWords } from "./voice.js";
import { createSound } from "../tx-sound.js";
import { PROSIGNS_BY_CODE } from "../characters.js";
import { $, toast } from "./dom.js";
import { createState, structure, wordsOf, tokensOf, tookFor, morseOf, recOfEntry, typedOf, plainText } from "./state.js";
import { createTape } from "./tape.js";
import { createUndo } from "./undo.js";
import { createTreeEdge } from "./tree.js";
import { createKeys, timingNow } from "./keys.js";
import { createTyping } from "./typing.js";
import { createSuggest } from "./suggest.js";
import { createSettings, choice } from "./settings.js";
import { createPlayback } from "./player.js";
import { createShare } from "./share.js";
import { createLayer } from "./layer.js";
import { createTab } from "./tab.js";
import { createStats } from "./stats.js";
import { createProfile } from "./profile.js";
import { createWear } from "./wear.js";

/* the message, the tape, the modes, the event log: js/tx/state.js */
const state = createState();
const undo = createUndo({ state });

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
  /* a letter just landed: with the voice on, it's said */
  if (closed && sound.speaks && (last === "." || last === "-")) sound.speak(spokenWords(DECODE[wordsOf(state.tokens).flat().at(-1)] ?? ""));
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
  undo.forget();     // a new line: what's sent stays sent
  trace.rest();
  update();
}

/* Ctrl/⌘+Z: the line, back a step; Ctrl/⌘+Shift+Z or Ctrl/⌘+Y, forward
   again (js/tx/undo.js). With the ctrl keys as paddles, Ctrl is a key
   on the pad, so ⌘ only */
document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const back = key === "z" && !event.shiftKey, forward = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
  if ((!back && !forward) || event.altKey) return;
  if (!event.metaKey && !(event.ctrlKey && !$("#opt-ctrl").checked)) return;
  if (event.target.closest?.("input, select, textarea")) return;
  event.preventDefault();
  keyer.reset();
  cancelTaps();
  if (!(back ? undo.step() : undo.redo())) return;
  state.record(back ? "undo-step" : "redo-step");
  update();
});


/* the tape: js/tx/tape.js */
const { drawTape, drawStats, settleTape, fadeTape, hiding, redact, clearCurrent } = createTape({
  state, update, setTyped: text => setTyped(text), resetKeyer: () => keyer.reset(), forgetUndo: () => undo.forget()
});


/* the collapsed tree, the about column, the whole tree: js/tx/tree.js */
const { tree, about, drawLocal, drawTree, followNode, openTree, isTreeOpen, inTree, REAL } = createTreeEdge({
  state, press, retype: text => retype(text), update, settleTape, hiding, redact, cancelKeyer: () => keyer.cancel(),
  openHeard: open => openHeard(open), openCut: code => openCut(code), openWord: word => openWord(word), greet: () => tab.greet(), playing: () => player.playing, stopPlayback: () => stopPlayback()
});


/*
 * ============================================================
 * UPDATE
 * ============================================================
 */

function update() {
  /* typed with cut on: the text is what tells a 9 from an N (morse.js) */
  READING.typed = READING.cut && /\d/.test(state.typed) ? state.typed.trim().split(/\s+/) : null;
  undo.watch();
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
  suggest?.draw();
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

/* the profile: a callsign and your keying, on this device
   (js/tx/profile.js); the counts listen to the event log from here
   on (js/tx/stats.js) */
const stats = createStats({ state });
const wear = createWear();
const { openProfile } = createProfile({ stats, wear, practise: words => practise(words) });

/*
 * Copy practice (the profile's ▷ start): groups on the line, the
 * letters hidden, played. What was on the line goes onto the tape
 * first, as when a link arrives. The eye shuts without saving that
 * as your setting (a reload brings yours back); a tap shows the
 * letters.
 */
function practise(words) {
  if (player.playing || state.playKey !== null) stopPlayback();
  const line = state.entry();
  if (line) state.addToHistory(line);
  if (state.mode !== "key") setMode("key", false);
  state.tokens = tokensOf(words);
  state.took = state.tokens.map(() => null);
  setTyped(plainText(words) ?? "");
  state.localCleared = false;
  state.hidden = true;
  state.collapsed = false;
  undo.forget();
  update();
  settleTape();
  togglePlay();
  toast("listen, write them down, then the eye shows them");
}

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
const { setTyped, retype, openHold, redrawKeys } = createTyping({
  state, sound, update, send, soundLetter, playing: () => player.playing, stopPlayback: () => stopPlayback()
});


/* the chips that finish a word: js/tx/suggest.js (var: update
   may run before it's made, and finds it undefined, not a crash) */
var suggest = createSuggest({ state, retype, update, press });


/* the settings tray, the outputs, the light: js/tx/settings.js */
const {
  outputs, setSignal, openTray, start: startSettings, linkedSettings, trayJustClosed,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp, cancelLamp, torchOn
} = createSettings({
  state, sound, logo, ctrlPaddle, timingNow, showInput, drawStats,
  stopPlayback: () => stopPlayback(), redrawTrace: () => trace.redraw(),
  /* the tray's reading changed: the line reads again (typing: the box
     too). Cut changes what typed digits send, so they go out afresh */
  reread: part => {
    redrawKeys();
    if (state.mode !== "type") return update();
    if (part === "cut") return retype(state.typed);
    setTyped(plainText(wordsOf(state.tokens)) ?? state.typed);
    update();
  }
});
redrawKeys();     // the tray's cut, remembered: the 123 keys show it

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
let paceNoted = false;
const speedNote = () => {
  /* speech can't change speed without changing pitch; said once a visit */
  if (sound.speaks && !paceNoted) { paceNoted = true; return "voice: at its own pace, whatever the speed"; }
  return torchOn() && Number($("#opt-wpm").value) > TORCH_WPM ? `flashlight: played at ${TORCH_WPM} wpm, as fast as it switches` : null;
};

/* the player row: js/tx/player.js */
const {
  player, trace, playerControls, togglePlay, stopPlayback, messageKey, shareable, tapeRedrawn, isPlayerActive, setPlayerActive
} = createPlayback({
  state, sound, keyer, tree, trainView, tab, timingNow: playTiming, speedNote, choice, cancelTaps, setSignal,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp,
  drawLocal, drawTree, settleTape, fadeTape, followNode, inTree, REAL, isTreeOpen
});

/* paste and share: js/tx/share.js */
const { menu, openShare, hideBubble } = createShare({
  state, keyer, shareable, choice, timingNow, setMode, putKeysAway, setTyped, linkedSettings
});


/* popups, outside taps, Escape: js/tx/layer.js */
const { openPrivacy, openHeard, openCut, openWord } = createLayer({
  state, about, update, clearCurrent, putKeysAway, isChord, openHold, menu, openShare, hideBubble,
  cancelLamp, closeLamp, stopPlayback, isPlayerActive, setPlayerActive, openProfile,
  /* something to cancel: playing, or paused part-way (not at the start or the end) */
  playerBusy: () => player.playing || (state.playKey !== null && player.position > 0 && player.position < player.duration)
});


/*
 * ============================================================
 * START
 * ============================================================
 */

/* text from elsewhere, to put into Morse (an arrival door only:
   nobody shares these, the station tidies them away):

     /?text=…&title=…    the share sheet (manifest's share_target);
                         its text, or the title if there's none (a
                         bare url= alone brings nothing: an address
                         isn't a message)
     /#text=…            the browser extension; in the hash, so a
                         page's words never reach a server, and a
                         long selection isn't cut by a URL limit

   null when nothing arrived this way. */
const arriving = (() => {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has("text")) {
    window.history.replaceState(null, "", location.pathname + location.search);
    return hash.get("text");
  }
  if (location.search.startsWith("?/")) return null;
  const q = new URLSearchParams(location.search);
  return ["text", "title", "url"].some(k => q.has(k)) ? q.get("text") || q.get("title") || "" : null;
})();

/* a whole article is more than one line can hold in good time (each
   letter is a few elements on the tape): about a thousand words
   arrive, cut at a word, and a toast says so */
const ARRIVE_MAX = 6000;
const cutToFit = words => {
  let n = 0, i = 0;
  while (i < words.length && (n += words[i].length + 1) <= ARRIVE_MAX) i++;
  return i < words.length ? words.slice(0, i) : words;
};

/* settings after "#" in a link: for this visit (js/tx/settings.js);
   read, they leave the address */
if (startSettings(location.hash)) window.history.replaceState(null, "", location.pathname + location.search);
trainView.build();
setKeyMode($("#opt-key").value);

/* a shared link, dot-da.sh/?/…: the message on the line, ready to
   play (not played: browsers need a tap first); the address is
   tidied back to / so a later edit doesn't leave a stale link.
   Whatever was on the line unsent (kept from last time) goes onto
   the tape first, unless it's the same message; with no link, it
   comes back to the line. Text arriving (above) is the same, once
   it's Morse. */
{
  const q = location.search;
  const kept = state.savedLine();
  if (q.startsWith("?/") || arriving !== null) {
    let words = [];
    try { words = arriving !== null ? wordsFrom(arriving) : readLink(q.slice(2)); } catch { }
    if (arriving !== null) {
      const all = words.length;
      words = cutToFit(words);
      if (words.length < all) toast(`the first ${words.length.toLocaleString("en")} of ${all.toLocaleString("en")} words`, { ms: 5000 });
    }
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
      READING.typed = typedOf(kept);
      setTyped(plainText(wordsOf(state.tokens)) ?? "");
    }
    tab.arrive(null);     // the name keys itself
  }
  undo.forget();          // what's on the line now is where undo stops
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

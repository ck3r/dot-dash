/*
 * The keys: the pad (dit, dah, the spaces, undo), a computer
 * keyboard or a paddle adapter keying, the timed keyers, the tap
 * queue that sounds taps and typed letters, the timing train under
 * the pad, and the send button.
 *
 *   createKeys({ state, sound, press, send, ... }) → {
 *     keyer                  the timed keyer (js/tx-keyer.js)
 *     trainView              the timing train: show, replay, build
 *     logo                   the switch logo, closed while a key is down
 *     ctrlPaddle, isChord(event)
 *     setKeyMode(mode), syncKeySelect()
 *     cancelTaps()           playback takes over: drop queued taps
 *     soundLetter(code)      a typed letter, sounded after what's queued
 *   }
 *   timingNow(maxWpm?)       the timing at the speed set in the tray
 *                            (no faster than maxWpm, if given)
 */
import { createKeyer, timing, MODES } from "../tx-keyer.js";
import { $, el } from "./dom.js";

export function timingNow(maxWpm = Infinity) {
  const wpm = Number($("#opt-wpm").value), fwpm = Number($("#opt-fwpm").value);
  return timing(Math.min(wpm, maxWpm), Math.min(fwpm, maxWpm));
}

export function createKeys({
  state, sound, press, send, putKeysAway, setMode, showInput,
  setSignal, playing, traceLive, stopPlayback, quietOutputs
}) {
  /*
   * ============================================================
   * THE PAD
   * ============================================================
   *
   * Acts on pointer DOWN (not click), so it feels like a key.
   * The switch logo closes while dit or dah is held.
   */

  const logo = $(".logo");

  /* the timed keyer (straight, bug, paddles); tap mode bypasses it */
  const keyer = createKeyer({
    timing: timingNow,
    mark: (m, timing) => press(m, timing),
    gap: kind => press(kind),
    signal: down => {
      setSignal(down);
      sound.key(down);
      if (!playing()) traceLive(down);   // the held mark grows on the scrub bar
    },
    train: e => trainView.show(e)
  });

  /*
   * The switch logo is a key too: a straight key, whatever the pad
   * is set to, and in type mode as well (a letter it keys joins the
   * text: js/tx/main.js). Press it and it closes, let go and it opens.
   *
   *        ──o⁄──      press: ──o──   (the lever drops, the LED lights)
   */
  const switchKey = createKeyer({
    timing: timingNow,
    mark: (m, timing) => press(m, timing),
    gap: kind => press(kind),
    signal: down => {
      setSignal(down);
      sound.key(down);
      if (!playing()) traceLive(down);
    },
    train: () => { }
  });
  logo.addEventListener("pointerdown", event => {
    if (event.button) return;
    event.preventDefault();
    logo.setPointerCapture(event.pointerId);
    if (playing() || state.playKey !== null) stopPlayback();
    sound.unlock();
    keyer.cancel();
    if (switchKey.mode !== "straight") switchKey.setMode("straight");   // here, not at startup: the lamp isn't wired yet then
    switchKey.down(".");
  });
  for (const type of ["pointerup", "pointercancel"]) logo.addEventListener(type, () => switchKey.up("."));

  /*
   * Tap mode: each tap is sounded as a proper mark (1 or 3 units
   * at the current speed), so even tapping teaches the rhythm.
   * Taps faster than that queue up, a unit apart, like a keyer;
   * if they pile up more than a couple of seconds, the extras
   * are shown but not sounded.
   */
  let tapBusyUntil = -Infinity;
  const tapTimers = new Set();

  /* the lamp follows a tapped or typed mark when it sounds */
  function signalLater(down, ms) {
    const id = setTimeout(() => { tapTimers.delete(id); setSignal(down); }, ms);
    tapTimers.add(id);
  }

  /* playback takes over: drop whatever taps are still queued */
  function cancelTaps() {
    for (const id of tapTimers) clearTimeout(id);
    tapTimers.clear();
    tapBusyUntil = -Infinity;
  }

  /* the letter's code, sounded and keyed on the logo, a letter
     space after anything still sounding */
  function soundLetter(code) {
    const t = timingNow();
    const now = performance.now();
    let start = Math.max(now, tapBusyUntil + t.letter);
    if (start - now > 2000) return;   // typing far ahead of the sound: just show it
    for (const m of code) {
      const length = (m === "." ? 1 : 3) * t.unit;
      sound.mark((start - now) / 1000, length / 1000);
      signalLater(true, start - now);
      signalLater(false, start - now + length);
      tapBusyUntil = start + length;
      start += length + t.unit;
    }
  }

  function tapMark(m) {
    const t = timingNow();
    const now = performance.now();
    const start = Math.max(now, tapBusyUntil + t.unit);
    const length = (m === "." ? 1 : 3) * t.unit;
    if (start - now > 2000) return;
    tapBusyUntil = start + length;
    sound.mark((start - now) / 1000, length / 1000);
    signalLater(true, start - now);
    signalLater(false, start - now + length);
  }

  const LABELS = {
    tap:         ["dit", "dah"],
    straight:    ["key", ""],
    bug:         ["dit · auto", "dah"],
    "iambic-a":  ["dit paddle", "dah paddle"],
    "iambic-b":  ["dit paddle", "dah paddle"],
    ultimatic:   ["dit paddle", "dah paddle"]
  };

  function setKeyMode(next) {
    state.keyMode = MODES.includes(next) ? next : "tap";
    keyer.setMode(state.keyMode);
    document.body.dataset.key = state.keyMode;
    syncKeySelect();
    const [dit, dah] = LABELS[state.keyMode];
    $("#pad .key.dit span").textContent = dit;
    $("#pad .key.dah span").textContent = dah;
    $("#pad .key.dit b").textContent = state.keyMode === "straight" ? "" : ".";
    showInput();
  }

  /*
   * The key list also offers "off" (put the keys away) and "text"
   * (the keyboard), the same switches as the chevron and .- / A in
   * the control row, for anyone who looks for them here. The list
   * always shows what's in front of you; the keyer is remembered.
   */
  function syncKeySelect() {
    const s = $("#opt-key");
    s.dataset.last = state.keyMode;
    s.value = state.inputAway ? "off" : state.mode === "type" ? "text" : state.keyMode;
  }

  $("#opt-key").addEventListener("change", () => {
    const v = $("#opt-key").value;
    if (v === "off") return putKeysAway(true);
    if (v === "text") {
      if (state.mode !== "type") setMode("type");
      if (state.inputAway) putKeysAway(false);
      return syncKeySelect();
    }
    setKeyMode(v);
    if (state.mode !== "key") setMode("key");
    if (state.inputAway) putKeysAway(false);
    syncKeySelect();
  });


  /* press / release from a finger, mouse or hardware key */
  /*
   * Backspace, held (the pad's ⌫, or the computer's): after half a second the
   * rest of the last word goes, then a word more every half second,
   * as a held key repeats.
   */
  const WORD_BACK = 500;   // ms
  let wordBack = null;

  function keyDown(button) {
    if (!button || button.classList.contains("pressed")) return;
    if (playing() || state.playKey !== null) stopPlayback();   // back to keying: the player lets go, rewound
    button.classList.add("pressed");
    sound.unlock();                 // audio may only start inside a press
    const act = button.dataset.act;
    const mark = act === "." || act === "-";

    if (act === "send") {          // ↵, under the spaces: the line goes up
      keyer.cancel();
      send();
      return;
    }
    if (mark && state.keyMode !== "tap") {
      keyer.down(act);
      return;
    }
    if (mark) tapMark(act);
    else keyer.cancel();            // undo / spaces cancel a pending gap (timing kept)
    state.localCleared = act === "letter" || act === "word";   // a space you pressed: start fresh
    press(act);
    if (act === "undo") wordBack = setInterval(() => press("word-back"), WORD_BACK);
  }

  function keyUp(button) {
    if (!button || !button.classList.contains("pressed")) return;
    button.classList.remove("pressed");
    clearInterval(wordBack);
    const act = button.dataset.act;
    if ((act === "." || act === "-") && state.keyMode !== "tap") keyer.up(act);
  }

  /*
   * Heavy fists: a finger that slides from dit onto dah (or back)
   * lets go of the one and presses the other, as on a real paddle.
   * Only the two paddles; sliding onto a side key does nothing.
   *
   *   [ dit ] ──finger──▶ [ dah ]      dit up, dah down
   */
  const onKey = new Map();   // pointer → the key it's pressing now
  const paddleAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("#pad .key.dit, #pad .key.dah");

  for (const button of document.querySelectorAll("#pad .key")) {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      onKey.set(event.pointerId, button);
      keyDown(button);
    });
    button.addEventListener("pointermove", event => {
      const now = onKey.get(event.pointerId);
      if (!now || !now.matches(".dit, .dah")) return;
      const over = paddleAt(event.clientX, event.clientY);
      if (!over || over === now || over.hidden) return;
      keyUp(now);
      onKey.set(event.pointerId, over);
      keyDown(over);
    });
    const release = event => {
      keyUp(onKey.get(event.pointerId) ?? button);
      onKey.delete(event.pointerId);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", event => event.preventDefault());
  }

  /*
   * A computer keyboard keys too (keying mode only; typing mode
   * types). Paddle pairs, left = dit, right = dah, on whichever keys
   * suit your hands or your adapter:
   *
   *   dit   .   [   A   1        (left Ctrl, with "ctrl keys" on)
   *   dah   -   ]   D   3        (right Ctrl, likewise)
   *
   * The Ctrl keys are for the VBand USB paddle adapter, which sends
   * them; they're off unless asked for, so Ctrl stays free for
   * shortcuts (Ctrl+C would otherwise key a dit first).
   *
   *   space      letter space (straight key: the key itself)
   *   /          word space
   *   backspace  undo        enter   send        P   play / pause
   *
   * With the straight key, any of them is the one key.
   */
  /* (the arrow keys belong to the player: see PLAYER KEYS) */
  const DIT_KEYS = new Set(["Period", "NumpadDecimal", "BracketLeft", "KeyA", "Digit1", "Numpad1"]);
  const DAH_KEYS = new Set(["Minus", "NumpadSubtract", "BracketRight", "KeyD", "Digit3", "Numpad3"]);
  const ctrlKeys = () => $("#opt-ctrl").checked;
  const padKey = act => document.querySelector(`#pad .key[data-act="${CSS.escape(act)}"]`);

  function actFor(event) {
    const code = event.code;
    const ctrl = ctrlKeys();
    if (DIT_KEYS.has(code) || event.key === "." || (ctrl && code === "ControlLeft")) return ".";
    if (DAH_KEYS.has(code) || event.key === "-" || (ctrl && code === "ControlRight")) return state.keyMode === "straight" ? "." : "-";
    if (code === "Space") return state.keyMode === "straight" ? "." : "letter";
    if (code === "Slash" || code === "NumpadDivide" || event.key === "/") return "word";
    if (code === "Backspace") return "undo";
    return null;
  }

  /* a modifier held for something else (Ctrl+R, ⌘C …) isn't keying,
     unless it's a Ctrl key being used as a paddle */
  const isChord = event =>
    event.metaKey || event.altKey || (event.ctrlKey && !/^Control/.test(event.code) && !ctrlPaddle.down);
  const ctrlPaddle = { down: false };

  document.addEventListener("keydown", event => {
    if (state.mode === "type" || event.target.closest?.("input, select, textarea")) return;
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); send(); return; }
    const act = actFor(event);
    if (!act || isChord(event)) return;
    if (/^Control/.test(event.code)) ctrlPaddle.down = true;
    event.preventDefault();
    if (event.repeat) return;
    keyDown(padKey(act));
  });

  document.addEventListener("keyup", event => {
    if (/^Control/.test(event.code)) ctrlPaddle.down = false;
    const act = actFor(event);
    if (act) keyUp(padKey(act));
  });

  /* let go of everything if the page loses focus mid-press */
  function releaseAll() {
    for (const b of document.querySelectorAll("#pad .key.pressed")) keyUp(b);
    keyer.reset();
    sound.silence();
    quietOutputs();
  }
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });


  /*
   * ============================================================
   * TIMING TRAIN
   * ============================================================
   *
   * The bar lines up with the keys under it. Time runs out from
   * the left edge of the dit key: key DOWN runs right, key UP
   * runs left.
   *
   *    ← key up                 key down →
   *   ├/───────┃──˽──┃───┼──────────.┃────────┃────────-┤
   *   │ ˽ / ⌫ ↵│                   │  dit     │    dah   │
   *    7      5   3  2  0           1     2           3   units
   *
   * Key down: a full dit ends at the dit key's right edge, a full
   * dah at the dah key's. The keys aren't 1:3 wide, so the dah
   * stretch runs slower (1 unit across the dit key, 2 across the
   * rest). Key up runs evenly: the word gap (7) at the far left,
   * the letter gap (3) at 3/7 of the way. Brass lines mark where
   * one call turns into the next (dit → dah, ˽ → /).
   */

  const trainView = (() => {
    const onSeg = $("#train .seg.on"), offSeg = $("#train .seg.off");
    const onFill = onSeg.querySelector(".fill"), offFill = offSeg.querySelector(".fill");
    let ticks = {};
    let event = null;
    let frame = 0;

    /* how much of the key-down half the dit key takes (1 unit of 3);
       measured from the pad, or a true 1:3 for the one-key straight key */
    let ditShare = 1 / 3;
    function measure() {
      const dit = $("#pad .key.dit").getBoundingClientRect();
      const dah = $("#pad .key.dah").getBoundingClientRect();
      if (!dit.width) return;                       // pad not shown
      const zero = dit.left - 3;                    // time zero: the middle of the 6px gap
      ditShare = dah.width ? (dit.right - zero) / (dah.right - zero) : 1 / 3;
      const train = $("#train").getBoundingClientRect();
      if (train.width) $("#train .origin").style.left = (zero - train.left) + "px";
    }

    /* where a time falls, as % of its half */
    const holdPct = (ms, t) => {
      const u = Math.max(0, ms / t.unit);
      const at = u <= 1 ? u * ditShare : ditShare + (Math.min(u, 3) - 1) / 2 * (1 - ditShare);
      return at * 100;
    };
    const gapPct = (ms, t) => Math.min(1, Math.max(0, ms / t.word)) * 100;

    /* playback only: where the ideal length would have ended */
    const onIdeal = el("span", "ideal");
    const offIdeal = el("span", "ideal");
    onSeg.append(onIdeal);
    offSeg.append(offIdeal);
    onIdeal.hidden = offIdeal.hidden = true;

    /* each label sits inside the stretch it ends: left of its line
       on the key-down side, right of it on the key-up side */
    function build() {
      measure();
      const t = timingNow();
      ticks = {};
      for (const seg of [onSeg, offSeg]) seg.querySelector(".ticks").textContent = "";
      const hold = (ms, key, label, cls) => {
        const tick = el("span", "tick " + cls, label);
        tick.style.right = (100 - holdPct(ms, t)) + "%";
        onSeg.querySelector(".ticks").append(tick);
        if (key) ticks[key] = tick;
      };
      const wait = (ms, key, label, cls = "") => {
        const tick = el("span", "tick " + cls, label);
        tick.style.left = (100 - gapPct(ms, t)) + "%";
        offSeg.querySelector(".ticks").append(tick);
        if (key) ticks[key] = tick;
      };
      hold(t.unit, ".", ".", "dot");
      hold(t.dahAt, null, "", "split");
      hold(3 * t.unit, "-", "-", "dash");
      wait(t.letterAt, null, "", "split");
      wait(t.letter, "letter", "˽");
      wait(t.wordAt, null, "", "split");
      wait(t.word, "word", "/");
    }

    function light(key) {
      for (const [k, tick] of Object.entries(ticks)) tick.classList.toggle("lit", k === key);
    }

    const gapCall = (ms, t) => (ms >= t.wordAt ? "word" : ms >= t.letterAt ? "letter" : null);

    function draw() {
      if (!event) return;
      const t = timingNow();
      let elapsed = performance.now() - event.t0;

      if (event.phase === "gap") {
        offFill.style.width = gapPct(elapsed, t) + "%";
        light(gapCall(elapsed, t));
        if (elapsed >= t.word) return;                 // a full word space: rest
      } else {
        let mark;
        if (event.phase === "send") {
          elapsed = Math.min(elapsed, event.length);
          mark = event.mark;
        } else {
          mark = elapsed >= t.dahAt ? "-" : ".";
        }
        onFill.className = "fill " + (mark === "." ? "dot" : "dash");
        onFill.style.width = holdPct(elapsed, t) + "%";
        light(mark);
      }
      frame = requestAnimationFrame(draw);
    }

    function show(e) {
      cancelAnimationFrame(frame);
      onIdeal.hidden = offIdeal.hidden = true;
      event = e.phase ? e : null;
      if (!event) {
        onFill.style.width = offFill.style.width = "0";
        onFill.classList.remove("past");
        light(null);
        return;
      }
      onFill.classList.toggle("past", event.phase === "gap");   // keep the mark just made, dimmed
      offFill.style.width = "0";
      draw();
    }

    /*
     * Playback: the bar replays the timing as it was keyed, with a
     * notch where the ideal length ends, so you can see a dah held
     * short or a letter space rushed.
     */
    function replay(ph) {
      cancelAnimationFrame(frame);
      event = null;
      if (!ph) {
        onFill.style.width = offFill.style.width = "0";
        onFill.classList.remove("past");
        onIdeal.hidden = offIdeal.hidden = true;
        light(null);
        return;
      }
      const t = timingNow();
      if (ph.kind === "hold") {
        onFill.className = "fill " + (ph.symbol === "." ? "dot" : "dash");
        onFill.style.width = holdPct(ph.elapsed, t) + "%";
        offFill.style.width = "0";
        onIdeal.hidden = false;
        onIdeal.style.left = holdPct(ph.ideal, t) + "%";
        offIdeal.hidden = true;
        light(ph.symbol);
      } else {
        onFill.classList.add("past");
        offFill.style.width = gapPct(ph.elapsed, t) + "%";
        offIdeal.hidden = false;
        offIdeal.style.left = (100 - gapPct(ph.ideal, t)) + "%";
        onIdeal.hidden = true;
        light(gapCall(ph.elapsed, t));
      }
    }

    build();
    $("#opt-wpm").addEventListener("input", build);
    $("#opt-fwpm").addEventListener("input", build);
    /* the keys changed size, appeared, or merged (the straight key) */
    const refit = new ResizeObserver(build);
    refit.observe($("#pad .key.dit"));
    refit.observe($("#pad .key.dah"));

    return { show, replay, build };
  })();

  $("#send").addEventListener("click", send);

  /* lit while held, like the keys (at least a blink, for a quick tap) */
  {
    const b = $("#send");
    let since = 0;
    b.addEventListener("pointerdown", () => {
      if (b.disabled) return;
      since = performance.now();
      b.classList.add("pressed");
    });
    const release = () => {
      const left = Math.max(0, 120 - (performance.now() - since));
      setTimeout(() => b.classList.remove("pressed"), left);
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(type, release);
  }

  return { keyer, trainView, logo, ctrlPaddle, isChord, setKeyMode, syncKeySelect, cancelTaps, soundLetter };
}

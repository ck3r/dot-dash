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
   * One bar over the pad, lined up with the keys under it. Time
   * runs right from the far left (the dit key's left edge), key
   * down and key up alike:
   *
   *    ┃              .┊˽                 -┊          /┃
   *    ┃   dit         │   dah             │  ˽ / ⌫ ↵  ┃
   *    0               1                   3              units, key down
   *    0               3                              7   units, key up
   *
   * Key down (a colour): a full dit ends at the dit key's right
   * edge, a full dah at the dah key's (1 unit across the dit key,
   * 2 across the dah). Key up (grey): the letter space at the dit's
   * edge too, the word space at the far right. A brass line marks
   * where one call turns into the next (dit → dah, nothing → ˽,
   * ˽ → /); the call you'd get right now lights.
   *
   * The keys aren't as wide as the units they stand for, so key up
   * can't run at one speed. It runs at each stretch's own speed and
   * eases from one to the next along a bell curve (see eased), so
   * it slows or quickens smoothly instead of jumping. The time is
   * always true: it passes ˽ at exactly a letter space, and reaches
   * the edge at exactly a word space.
   */

  /*
   * A time → place map through fixed points, its speed easing from
   * one stretch's to the next around each point:
   *
   *   speed                     place
   *     │      ╭───────            │              ╭──── edge
   *     │ ─────╯                   │         ˽ ╭──╯
   *     │      ˽                   │      ╭────╯
   *     │                          │ ─────╯
   *     └──────┼────── time        └──────┼────── time
   *
   * Each stretch runs at a speed of its own, and gives way to the
   * next as a Gaussian: at the point between them, their average.
   * Each stretch's speed is chosen so that, with its bells, it still
   * covers exactly its distance in exactly its time (found in a few
   * rounds, since the averages depend on the speeds). σ is at most a
   * quarter of a stretch, so a bell never reaches the far end, and
   * the speed only ever climbs or falls from one stretch's to the
   * next: no dip or overshoot on the way.
   */
  const erf = x => {              // Abramowitz & Stegun 7.1.26: within 1.5e-7
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
    return x < 0 ? -y : y;
  };
  function eased(times, places, sigma) {
    const n = times.length - 1;
    const len = [], dist = [];
    for (let i = 0; i < n; i++) {
      len.push(times[i + 1] - times[i]);
      dist.push(places[i + 1] - places[i]);
    }
    const s = Math.min(sigma, ...len.map(l => l / 4));
    const G = u => s * Math.sqrt(Math.PI / 2) * erf(u / (s * Math.SQRT2));   // the bell's area, 0 … u
    /* each stretch's speed, and at each point the speed there: the
       ends keep their stretch's, between two it's their average */
    let base = dist.map((d, i) => d / len[i]);
    let at = [];
    for (let round = 0; round < 40; round++) {
      at = times.map((_, i) => i === 0 ? base[0] : i === n ? base[n - 1] : (base[i - 1] + base[i]) / 2);
      base = len.map((L, i) => (dist[i] - (at[i] + at[i + 1]) * G(L)) / (L - 2 * G(L)));
    }
    return ms => {
      if (ms <= times[0]) return places[0];
      if (ms >= times[n]) return places[n];
      let i = 0;
      while (ms > times[i + 1]) i++;
      const u = ms - times[i], L = len[i], c = base[i];
      return places[i] + c * u + (at[i] - c) * G(u) + (at[i + 1] - c) * (G(L) - G(L - u));
    };
  }

  const trainView = (() => {
    const seg = $("#train .seg");
    const onFill = seg.querySelector(".fill.on"), offFill = seg.querySelector(".fill.off");
    let ticks = {};
    let event = null;
    let frame = 0;

    /* where the keys end, as fractions of the bar: the dit key's right
       edge and the dah key's (the straight key's one key covers both
       columns, but the line between them still marks a full dit) */
    let dotAt = 1 / 3, dashAt = 0.8;
    function measure() {
      const pad = $("#pad");
      const box = pad.getBoundingClientRect();
      if (!box.width || !seg.clientWidth) return;   // not shown
      const cols = getComputedStyle(pad).gridTemplateColumns.split(" ").map(parseFloat);
      const gap = parseFloat(getComputedStyle(pad).columnGap) || 0;
      const left = seg.getBoundingClientRect().left + seg.clientLeft, width = seg.clientWidth;
      dotAt = (box.left + cols[0] - left) / width;
      dashAt = (box.left + cols[0] + gap + cols[1] - left) / width;
    }

    /* where a time falls, as % of the bar: key down at one speed
       across each key, key up eased (above) */
    const holdPct = (ms, t) => {
      const u = Math.max(0, ms / t.unit);
      const at = u <= 1 ? u * dotAt : dotAt + (Math.min(u, 3) - 1) / 2 * (dashAt - dotAt);
      return at * 100;
    };
    let gapAt = () => 0;
    const gapPct = ms => gapAt(ms) * 100;

    /* playback only: where the ideal length would have ended */
    const onIdeal = el("span", "ideal");
    const offIdeal = el("span", "ideal");
    seg.append(onIdeal, offIdeal);
    onIdeal.hidden = offIdeal.hidden = true;

    /* the labels: key down's left of its line (the stretch it ends),
       key up's right of it (the stretch it starts), but the word
       space's, at the far edge, inside */
    function build() {
      measure();
      const t = timingNow();
      gapAt = eased([0, t.letter, t.word], [0, dotAt, 1], 0.6 * t.unit);
      ticks = {};
      const box = seg.querySelector(".ticks");
      box.textContent = "";
      const tick = (pct, key, label, cls) => {
        const tick = el("span", "tick " + cls, label);
        tick.style.left = pct + "%";
        box.append(tick);
        if (key) ticks[key] = tick;
      };
      tick(holdPct(t.unit, t), ".", ".", "down dot");
      tick(holdPct(t.dahAt, t), null, "", "down split");
      tick(holdPct(3 * t.unit, t), "-", "-", "down dash");
      tick(gapPct(t.letterAt), null, "", "up split");
      tick(gapPct(t.letter), "letter", "˽", "up");
      tick(gapPct(t.wordAt), null, "", "up split");
      tick(100, "word", "/", "down edge");
    }

    function light(key) {
      for (const [k, tick] of Object.entries(ticks)) tick.classList.toggle("lit", k === key);
    }

    const gapCall = (ms, t) => (ms >= t.wordAt ? "word" : ms >= t.letterAt ? "letter" : null);

    /*
     * On time: a length is judged once it's decided, a mark when you
     * let go, a space when you press again, and if it ended within a
     * tenth of a unit of its line, either side (90%: an A), the fill
     * just finished takes a brass edge. It stays, dimmed with the
     * fill, under the next one, until that one is decided in turn.
     * Nothing is judged on the way: holding past a line, or waiting
     * on at a full word space, is never brass by itself.
     *
     *                ⅒ ⅒
     *   ┃▓▓▓▓▓▓▓▓▓▓▓▓[.┊]˽     let go here: the dit edged
     *   ┃░░░░░░░░░░░░[.┊]˽     pressed again here: the letter space edged
     *
     * Only your own timing: a paddle's dits and dahs are the keyer's,
     * always exact, so they're never judged (the spaces between are).
     * Drawn inside the fill, so nothing moves.
     */
    const WINDOW = 0.1;   // units, either side of a line
    const holdLines = t => [t.unit, 3 * t.unit];
    const gapLines = t => [t.letter, t.word];
    /* which line a length ended on (1, 2), or none (0) */
    function judged(ms, lines, t) {
      return lines.findIndex(at => Math.abs(ms - at) <= WINDOW * t.unit) + 1;
    }
    function edge(fill, line) {
      fill.classList.toggle("landed", line > 0);
      fill.dataset.line = line || "";
    }

    function draw() {
      if (!event) return;
      const t = timingNow();
      let elapsed = performance.now() - event.t0;

      if (event.phase === "gap") {
        offFill.style.width = gapPct(elapsed) + "%";
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
        onFill.className = "fill on " + (mark === "." ? "dot" : "dash");
        onFill.style.width = holdPct(elapsed, t) + "%";
        light(mark);
      }
      frame = requestAnimationFrame(draw);
    }

    function show(e) {
      cancelAnimationFrame(frame);
      onIdeal.hidden = offIdeal.hidden = true;
      const was = event;
      event = e.phase ? e : null;
      const t = timingNow();
      if (!event) {
        onFill.style.width = offFill.style.width = "0";
        onFill.classList.remove("past");
        offFill.classList.remove("past");
        edge(onFill, 0);
        edge(offFill, 0);
        light(null);
        return;
      }
      /* let go: the mark just made stays, dimmed, under the gap; your
         own mark (not a paddle's) judged */
      const letGo = event.phase === "gap" && was?.phase === "hold";
      onFill.classList.toggle("past", event.phase === "gap");
      edge(onFill, letGo ? judged(event.t0 - was.t0, holdLines(t), t) : 0);
      /* pressed again: the gap just waited stays, dimmed, under the
         new mark, judged; a new gap starts from nothing */
      const pressed = event.phase !== "gap" && was?.phase === "gap";
      offFill.classList.toggle("past", pressed);
      edge(offFill, pressed ? judged(event.t0 - was.t0, gapLines(t), t) : 0);
      offFill.style.width = pressed ? gapPct(event.t0 - was.t0) + "%" : "0";
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
      edge(onFill, 0);                                  // playback has its own notch: no judging
      edge(offFill, 0);
      offFill.classList.remove("past");
      if (!ph) {
        onFill.style.width = offFill.style.width = "0";
        onFill.classList.remove("past");
        onIdeal.hidden = offIdeal.hidden = true;
        light(null);
        return;
      }
      const t = timingNow();
      if (ph.kind === "hold") {
        onFill.className = "fill on " + (ph.symbol === "." ? "dot" : "dash");
        onFill.style.width = holdPct(ph.elapsed, t) + "%";
        offFill.style.width = "0";
        onIdeal.hidden = false;
        onIdeal.style.left = holdPct(ph.ideal, t) + "%";
        offIdeal.hidden = true;
        light(ph.symbol);
      } else {
        onFill.classList.add("past");
        offFill.style.width = gapPct(ph.elapsed) + "%";
        offIdeal.hidden = false;
        offIdeal.style.left = gapPct(ph.ideal) + "%";
        onIdeal.hidden = true;
        light(gapCall(ph.elapsed, t));
      }
    }

    build();
    $("#opt-wpm").addEventListener("input", build);
    $("#opt-fwpm").addEventListener("input", build);
    /* the pad or the bar changed size, or the bar appeared */
    const refit = new ResizeObserver(build);
    refit.observe($("#pad"));
    refit.observe(seg);

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

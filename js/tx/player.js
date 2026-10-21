/*
 * The player row: play, scrub, repeat, the trace on the scrub bar,
 * the keys that work it (and the media keys), and the message
 * lighting up as it plays.
 *
 *   createPlayback({ state, sound, keyer, tree, trainView, tab, ... }) → {
 *     player            the engine (js/tx-player.js)
 *     trace             the scrub bar's trace (js/tx-trace.js)
 *     playerControls()  play / scrub / repeat / the readout, up to date
 *     togglePlay(), stopPlayback()
 *     messageKey()      what's loaded, to notice edits
 *     shareable()       the line being written, for the share menu
 *     tapeRedrawn()     the tape was redrawn: re-apply the highlight
 *     isPlayerActive(), setPlayerActive(on)
 *   }
 */
import { DECODE, parse } from "../morse.js";
import { createPlayer, timeline } from "../tx-player.js";
import { createTrace } from "../tx-trace.js";
import { flashRate } from "../tx-outputs.js";
import { morseOf, recOf, recOfEntry, wordsOf } from "./state.js";
import { $, icon, toast } from "./dom.js";
import { createMediaControls } from "./media.js";

export function createPlayback({
  state, sound, keyer, tree, trainView, tab, timingNow, speedNote, choice, cancelTaps, setSignal,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp,
  drawLocal, drawTree, settleTape, fadeTape, followNode, inTree, REAL, isTreeOpen
}) {
  /*
   * ============================================================
   * PLAYBACK
   * ============================================================
   *
   * Plays the current line, or the last message sent when the
   * line is empty. While it plays, the line lights mark by mark
   * (like the main page), and the logo and both trees follow.
   * Keying anything stops it: the message has changed.
   */

  const player = createPlayer({
    sound,
    timing: timingNow,
    frame: showPlayback,
    end: playbackEnded,
    rounds: () => ROUNDS[repeatMode],
    gap: () => timingNow().word          // a word space between rounds
  });

  const media = createMediaControls();

  let repeatMode = "off";    // off / three / on
  let shown = null;          // last highlight applied
  let endTimer = null;

  const messageKey = () => state.tokens.join("") + "|" + state.history.map(morseOf).join(",");

  /* pretty play: textbook timing, the keying's hesitations left out
     (for playback, the trace and the saved .wav alike) */
  const pretty = () => $("#opt-pretty").checked;

  /* what share works on: the line being written, only (sent, it's
     gone from here: the menu greys until there's a new one) */
  function shareable() {
    const words = wordsOf(state.tokens);
    return words.length ? { words, rec: pretty() ? [] : recOf(state.tokens, state.took), entry: "current" } : null;
  }

  function playable() {
    const words = wordsOf(state.tokens);
    if (words.length) return { words, rec: pretty() ? [] : recOf(state.tokens, state.took), entry: "current" };
    if (state.history.length) {
      const last = state.history[state.history.length - 1];
      return { words: parse(morseOf(last)), rec: pretty() ? [] : recOfEntry(last), entry: state.history.length - 1 };
    }
    return null;
  }

  function entryEl() {
    if (state.playEntry === null) return null;
    return state.playEntry === "current" ? $("#tape .current") : document.querySelectorAll("#tape .past")[state.playEntry];
  }

  /* Morse messages are short: tenths of a second under a minute */
  const clock = ms => {
    if (ms < 60000) return (Math.floor(ms / 100) / 10).toFixed(1);
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  const unitOf = ms => (ms < 60000 ? "s" : "");

  /* (the readout's width is fixed, for the widest reading: tx.css) */

  /*
   * The scrub bar's trace (js/tx-trace.js): the signal of whatever
   * play would play, with the playhead's progress.
   */
  const THUMB = 4;   // px: the playhead column's width (tx.css)
  const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();
  const trace = createTrace({
    canvas: $(".seek-wrap .trace"),
    pop: $(".seek-pop"),
    popCanvas: $(".seek-pop canvas"),
    thumb: THUMB,
    unit: () => timingNow().unit,
    colors: () => {
      const signal = document.body.classList.contains("signal");
      const c = { wire: css("--wire"), paper: css("--paper"), brass: css("--brass"), played: css("--paper"), toCome: css("--graphite"),
                  sounder: choice("#opt-sound") === "sounder" };
      c.markColor = mk => mk.live ? c.brass : signal ? css(mk.mark === "." ? "--dot" : "--dash") : c.paper;
      return c;
    }
  });

  function refreshTrace() {
    /* nothing being entered (just sent, or cleared): a blank bar,
       though play still replays the last message sent */
    const idle = state.playKey === null && !wordsOf(state.tokens).length;
    const p = idle ? null : playable();
    if (!p) return trace.line({ marks: [], letters: [], duration: 0 });
    const line = timeline(p.words, timingNow(), p.rec);
    for (const l of line.letters) l.label = DECODE[l.code]?.replace(/^<(.*)>$/, "$1") ?? "?";
    trace.line(line);
  }

  new ResizeObserver(() => trace.redraw()).observe($(".seek-wrap"));
  $("#opt-sound").addEventListener("change", () => trace.redraw());   // the sounder draws clicks
  $("#opt-color").addEventListener("change", () => trace.redraw());

  /* hold the scrub bar: the magnified pop-out */
  $("#seek").addEventListener("pointerdown", () => { if (!$("#seek").disabled) trace.zoom(true); });
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => trace.zoom(false));

  function playerControls() {
    document.body.classList.toggle("playing", player.playing);   // the caret holds still
    media.follow(player.playing, playable()?.words);   // the system's controls (js/tx/media.js)
    tab.playing(player.playing);                        // the tab's icon lit (js/tx/tab.js)
    const can = !!playable();
    $("#play").disabled = !can;
    $("#seek").disabled = !can;
    $("#repeat").disabled = !can;      // greyed until there's something to play
    const playIcon = player.playing ? "pause" : "play";
    if ($("#play").dataset.icon !== playIcon) {
      $("#play").dataset.icon = playIcon;
      $("#play").innerHTML = icon(playIcon);
    }
    $("#play").setAttribute("aria-label", player.playing ? "pause" : "play");
    /* nothing loaded yet: show the length of what would play */
    if (state.playKey === null && !player.playing) {
      const p = playable();
      const d = p ? timeline(p.words, timingNow(), p.rec).duration : 0;
      $("#seek").max = Math.round(d);
      $("#seek").value = 0;
      refreshTrace();
      trace.at(0);
      $("#time").textContent = clock(d) + unitOf(d);
    }
  }

  function load() {
    const p = playable();
    if (!p) return false;
    if (state.playKey !== messageKey() || state.playEntry !== p.entry) {
      player.load(p.words, p.rec);
      state.playKey = messageKey();
      state.playEntry = p.entry;
      refreshTrace();
      $("#seek").max = Math.round(player.duration);
    }
    return true;
  }

  function togglePlay() {
    sound.unlock();
    if (player.playing) {
      player.pause();
      setSignal(false);     // like lifting off the key: the lamp, screen and flashlight go dark
    } else {
      if (!load()) return;
      if (wantsLamp() && $("#lamp").hidden) {
        const go = () => { openLamp(playable().words); togglePlay(); };
        const rate = flashRate(timeline(playable().words, timingNow(), playable().rec));
        if (!lampOk(rate)) return askLamp(rate, go);
        return go();
      }
      clearTimeout(endTimer);
      keyer.cancel();
      cancelTaps();
      const note = speedNote();      // played slower than set (the flashlight)
      if (note) toast(note);
      player.play();
      state.record("play", { entry: state.playEntry });
      revealEntry();
    }
    playerControls();
  }

  /* playing a sent message: scroll it into view while it plays */
  function revealEntry() {
    if (state.playEntry === "current") return;
    const e = entryEl();
    if (!e) return;
    const tape = $("#tape");
    tape.scrollTop = Math.max(0, e.offsetTop - 8);
    fadeTape();
  }

  function stopPlayback() {
    clearTimeout(endTimer);
    const wasPast = state.playEntry !== null && state.playEntry !== "current";
    player.stop();
    clearHighlight();
    if (wasPast) settleTape();
    state.playKey = null;
    state.playEntry = null;
    setSignal(false);
    closeLamp();
    playerControls();
  }

  /*
   * The pad plays along, half-lit, like a player piano: the key
   * that makes each sound (in straight mode, the one key).
   */
  function ghostKeys(symbol) {
    const dit = $("#pad .key.dit"), dah = $("#pad .key.dah");
    const one = state.keyMode === "straight";
    dit.classList.toggle("ghost", symbol === "." || (one && symbol === "-"));
    dah.classList.toggle("ghost", symbol === "-" && !one);
  }

  function clearHighlight() {
    ghostKeys(null);
    trainView.show({ phase: null });
    for (const e of document.querySelectorAll("#tape .playing")) e.classList.remove("playing");
    for (const l of document.querySelectorAll("#tape .line.live")) {
      l.classList.remove("live");
      for (const c of l.querySelectorAll(".c")) c.classList.remove("landed", "sent");
      for (const m of l.querySelectorAll(".keyed")) m.classList.remove("keyed");
    }
    shown = null;
  }

  /* every frame while playing (or when the scrub bar moves) */
  function showPlayback(now) {
    $("#seek").value = Math.round(now.position);
    trace.at(now.position);
    $("#time").textContent = clock(now.position) + "/" + clock(now.duration) + unitOf(now.duration);
    setSignal(now.down && player.playing);   // paused (or scrubbing paused): the key is open, lights out
    ghostKeys(now.symbol);
    if (!$("#train").hidden) trainView.replay(now.between ? null : now.phase);

    const key = now.letter + "|" + now.mark + "|" + now.down + "|" + now.path;
    if (key === shown) return;
    shown = key;

    /* the message: marks keyed so far, letters sent / just landed */
    const entry = entryEl();
    const lineEl = entry?.querySelector(".line");
    if (lineEl) {
      entry.classList.add("playing");
      lineEl.classList.add("live");
      let g = 0;
      [...lineEl.querySelectorAll(".c")].forEach((c, i) => {
        c.classList.toggle("sent", i < now.letter);
        c.classList.toggle("landed", i === now.letter && !now.path);
        for (const m of c.querySelectorAll(".m span")) m.classList.toggle("keyed", g++ <= now.mark && i <= now.letter);
      });
      followLetter(lineEl.querySelectorAll(".c")[now.letter]);
    }

    /* the trees follow the letter being sounded */
    drawLocal(now.path || (now.letter >= 0 ? wordsAt()[now.letter] ?? "" : ""));
    if (isTreeOpen()) {
      tree.handle({ type: "start" });
      if (now.path) tree.handle({ type: "beat", path: inTree(now.path) });
      else if (now.letter >= 0) {
        const code = wordsAt()[now.letter];
        if (code && REAL.has(code)) tree.handle({ type: "letter", path: code });
      }
      followNode();
    }
  }

  /*
   * A message longer than the tape shows: the letter being sounded
   * stays in view (both its rows), the tape scrolling just enough when
   * it reaches an edge, as keying keeps the caret in view. Only then:
   * scrolling about while it plays is fine until the letter leaves.
   */
  const FOLLOW_MARGIN = 8;   // px
  function followLetter(c) {
    if (!c) return;
    const tape = $("#tape");
    const t = tape.getBoundingClientRect(), r = c.getBoundingClientRect();
    const peek = parseFloat(getComputedStyle(tape).getPropertyValue("--peek")) || 0;   // the faded strip at the top
    if (r.bottom > t.bottom - FOLLOW_MARGIN) tape.scrollTop += r.bottom - (t.bottom - FOLLOW_MARGIN);
    else if (r.top < t.top + peek + FOLLOW_MARGIN) tape.scrollTop -= (t.top + peek + FOLLOW_MARGIN) - r.top;
    else return;
    fadeTape();
  }

  /* the codes of the playing message, in order */
  function wordsAt() {
    const p = playable();
    return p ? p.words.flat() : [];
  }

  function playbackEnded() {
    playerControls();
    /* hold the finished message a moment, then rest */
    endTimer = setTimeout(() => {
      clearHighlight();
      setSignal(false);
      closeLamp();
      drawLocal();
      drawTree();
      settleTape();   // back to the current line
    }, 600);
  }

  $("#play").addEventListener("click", togglePlay);

  /* the scrub bar: drag to move; playback carries on from there */
  let resumeAfterSeek = false;
  $("#seek").addEventListener("pointerdown", () => {
    sound.unlock();
    load();
    resumeAfterSeek = player.playing;
    player.pause();
    setSignal(false);
    playerControls();
  });
  $("#seek").addEventListener("input", () => {
    load();
    clearTimeout(endTimer);
    player.seek(Number($("#seek").value));
  });
  $("#seek").addEventListener("change", () => {
    if (resumeAfterSeek) player.play();
    resumeAfterSeek = false;
    playerControls();
  });

  /*
   * repeat: off → ×3 → ∞ → off  (remembered)
   *   ×3 plays the message three times, a word space apart
   */
  const ROUNDS = { off: 1, three: 3, on: Infinity };
  const NEXT = { off: "three", three: "on", on: "off" };
  const REPEAT_LABEL = { off: "repeat: off", three: "repeat: 3 times", on: "repeat: on" };

  function setRepeat(next) {
    repeatMode = ROUNDS[next] ? next : "off";
    const b = $("#repeat");
    b.dataset.repeat = repeatMode;
    b.setAttribute("aria-pressed", String(repeatMode !== "off"));
    b.setAttribute("aria-label", REPEAT_LABEL[repeatMode]);
    b.title = REPEAT_LABEL[repeatMode];
    try { localStorage.setItem("dot-dash:tx-repeat", repeatMode); } catch { }
  }

  $("#repeat").addEventListener("click", () => setRepeat(NEXT[repeatMode]));
  try {
    const saved = localStorage.getItem("dot-dash:tx-repeat");
    setRepeat(saved === "1" ? "on" : saved ?? "three");   // "1" = the old on/off setting; new: ×3
  } catch { setRepeat("three"); }

  /*
   * ============================================================
   * PLAYER KEYS
   * ============================================================
   *
   *   Space        play / pause, while the player is in use (playing,
   *                or paused part-way); otherwise it keys as before
   *   K or P       play / pause
   *   ← →          back / on a letter       Shift ← →, J L   a word
   *   Home End     the start / the end      Esc              cancel (layer.js)
   *   ↑ ↓          volume                   M                mute
   *   0 – 9        0% – 90% of the way in, while the player is in use
   *                (otherwise 1 and 3 are paddles, as before)
   *
   * Letters (K P J L M), Space and the numbers type instead while
   * the text keyboard is out, unless the player is active (below).
   */
  /* in use: playing, or loaded and not yet finished (paused, or
     scrubbed back to the start); a finished message isn't, so Space
     and the numbers go back to keying */
  const playerInUse = () =>
    player.playing || (state.playKey !== null && player.position < player.duration);
  const playerKeysDown = new Set();

  /* where each letter and each word starts, in what play would play */
  function stops(byWord) {
    const p = playable();
    if (!p) return [];
    const { letters } = timeline(p.words, timingNow(), p.rec);
    if (!byWord) return letters.map(l => l.start);
    const out = [];
    let i = 0;
    for (const word of p.words) { if (letters[i]) out.push(letters[i].start); i += word.length; }
    return out;
  }

  function seekTo(ms) {
    sound.unlock();
    if (!load()) return;
    clearTimeout(endTimer);
    player.seek(Math.max(0, Math.min(ms, player.duration)));
    playerControls();
  }

  /* a step back from just inside a letter goes to the one before, as players do */
  const STEP_GRACE = 250;
  function step(dir, byWord) {
    if (!load()) return;
    const at = player.position, marks = stops(byWord);
    if (dir > 0) seekTo(marks.find(t => t > at + 1) ?? player.duration);
    else seekTo([...marks].reverse().find(t => t < at - STEP_GRACE) ?? 0);
  }

  function nudgeVolume(by) {
    const v = $("#opt-vol");
    v.value = String(Math.max(Number(v.min), Math.min(Number(v.max), Number(v.value) + by)));
    v.dispatchEvent(new Event("input", { bubbles: true }));
    v.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /*
   * The player as an active region (as a video player takes the keys
   * once you've clicked it): a tap or click anywhere in the player
   * row, or tabbing into it, makes it active, outlined in brass.
   * While it's active, every key is the player's: the keys above
   * always work, and the rest do nothing (no keying, no typing, no
   * cutting the playback short). A tap anywhere else, or Escape,
   * lets go.
   */
  let playerActive = false;
  const playerRow = $(".player");

  function setPlayerActive(on) {
    playerActive = on;
    playerRow.classList.toggle("active", on);
  }
  playerRow.addEventListener("pointerdown", () => setPlayerActive(true));
  playerRow.addEventListener("focusin", () => setPlayerActive(true));
  playerRow.addEventListener("focusout", event => {
    if (!playerRow.contains(event.relatedTarget) && event.relatedTarget) setPlayerActive(false);
  });
  window.addEventListener("pointerdown", event => {
    if (playerActive && !event.target.closest?.(".player, .seek-pop")) setPlayerActive(false);
  }, true);

  /* keys that are never the player's to take, even while it's active */
  const passesThrough = event =>
    /^(Escape|Tab|F\d+|Media.*|Audio.*|Shift|Alt|Meta|Control|CapsLock|ContextMenu)$/.test(event.key);

  window.addEventListener("keydown", event => {
    const swallow = () => { event.preventDefault(); event.stopPropagation(); playerKeysDown.add(event.code); };
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (playerActive && /^Control/.test(event.code) && !event.repeat) swallow();   // a Ctrl paddle doesn't key here
      return;
    }
    if (event.target.closest?.("input, select, textarea") && event.target.id !== "seek") return;   // the scrub bar steps our way
    const active = playerActive;
    const typing = !active && state.mode === "type" && !state.inputAway;
    const inUse = active || playerInUse();
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const once = fn => () => { if (!event.repeat) fn(); };
    let act = null;
    if (event.code === "Space" && !typing && inUse) act = once(togglePlay);
    else if ((k === "k" || k === "p") && !typing) act = once(togglePlay);
    else if (k === "m" && !typing) act = once(() => $('[data-out="sound"]').click());
    else if (k === "ArrowLeft" || k === "ArrowRight") act = () => step(k === "ArrowRight" ? 1 : -1, event.shiftKey);
    else if ((k === "j" || k === "l") && !typing) act = () => step(k === "l" ? 1 : -1, true);
    else if (k === "Home") act = () => seekTo(0);
    else if (k === "End") act = () => seekTo(Infinity);
    else if (k === "ArrowUp" || k === "ArrowDown") act = () => nudgeVolume(k === "ArrowUp" ? 5 : -5);
    else if (/^[0-9]$/.test(k) && !typing && inUse) act = once(() => seekTo(player.duration * Number(k) / 10));
    if (!act) {
      if (active && !passesThrough(event)) swallow();   // active: nothing else gets through
      return;
    }
    swallow();                   // the keyer and the text keyboard don't see it
    act();
  }, true);

  /* and the key's release isn't the keyer's either */
  window.addEventListener("keyup", event => {
    if (!playerKeysDown.delete(event.code)) return;
    event.stopPropagation();
  }, true);

  /* a new speed changes the timeline */
  /* a new speed: the player re-times itself and carries on */
  function retimed() {
    if (state.playKey === null) return playerControls();   // nothing loaded: just the new length
    player.retime();
    refreshTrace();
    $("#seek").max = Math.round(player.duration);
    if (!player.playing) showPlayback(player.stateAt(player.position));
  }
  for (const id of ["#opt-wpm", "#opt-fwpm"]) $(id).addEventListener("input", retimed);
  /* the flashlight on or off changes the speed playback can go (main.js) */
  $("#opt-light").addEventListener("change", retimed);
  $('[data-out="light"]').addEventListener("click", retimed);


  /*
   * ============================================================
   * MEDIA KEYS
   * ============================================================
   *
   * A keyboard's (or headset's) play / pause and stop keys work the
   * player, through the media session where the browser offers one.
   * Volume up / down / mute stay the system's: the tone follows the
   * system volume already, and catching them too would do it twice.
   */
  {
    const play = () => { if (!player.playing) togglePlay(); };
    const pause = () => { if (player.playing) togglePlay(); };
    const acts = { MediaPlayPause: togglePlay, MediaPlay: play, MediaPause: pause, MediaStop: stopPlayback };
    window.addEventListener("keydown", event => {
      const act = acts[event.key];
      if (!act || event.repeat) return;
      event.preventDefault();
      act();
    });
    const session = navigator.mediaSession;
    if (session) {
      for (const [name, fn] of [["play", play], ["pause", pause], ["stop", stopPlayback]]) {
        try { session.setActionHandler(name, fn); } catch { /* not offered here */ }
      }
    }
  }

  return {
    player, trace, playerControls, togglePlay, stopPlayback, messageKey, shareable,
    /* the tape was redrawn: paused part-way, light it again where it
       stopped (a finished message rests unlit, as playbackEnded left it) */
    tapeRedrawn: () => {
      shown = null;
      if (!player.playing && state.playKey !== null && player.position < player.duration) showPlayback(player.stateAt(player.position));
    },
    isPlayerActive: () => playerActive,
    setPlayerActive
  };
}

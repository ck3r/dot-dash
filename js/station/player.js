/*
 * The player row: play, scrub, repeat, the trace on the scrub bar,
 * the keys that work it (and the media keys), and the message
 * lighting up as it plays.
 *
 *   createPlayback({ state, sound, keyer, tree, trainView, tab, ... }) → {
 *     player            the engine (js/shared/playback.js)
 *     trace             the scrub bar's trace (js/shared/trace.js)
 *     playerControls()  play / scrub / repeat / the readout, up to date
 *     togglePlay(), stopPlayback()
 *     messageKey()      what's loaded, to notice edits
 *     shareable()       the line being written, for the share menu
 *     tapeRedrawn()     the tape was redrawn: re-apply the highlight
 *     isPlayerActive(), setPlayerActive(on)
 *     retimed()         the pace changed: re-time what's loaded
 *   }
 */
import { namesFor, READING } from "../core/morse.js";
import { createPlayer, timeline } from "../shared/playback.js";
import { createTrace } from "../shared/trace.js";
import { flashRate } from "../shared/outputs.js";
import { morseOf, recOf, readingOf, wordsOf } from "./state.js";
import { $, icon, toast } from "../shared/dom.js";
import { createMediaControls } from "./media.js";
import { inApp } from "../core/where.js";
import { cardFrames } from "./card-art.js";
import { voiceTimeline } from "../shared/voice.js";
import { PIP_CSS, PIP_BODY, fillPip, pipShows, drawPip } from "../shared/pip.js";

export function createPlayback({
  state, sound, keyer, tree, trainView, tab, timingNow, speedNote, choice, cancelTaps, setSignal,
  buzzScript = () => false,
  wantsLamp, lampOk, askLamp, openLamp, closeLamp,
  drawLocal, drawTree, settleTape, fadeTape, followNode, inTree, REAL, isTreeOpen
}) {
  /*
   * ============================================================
   * PLAYBACK
   * ============================================================
   *
   * Plays the current line (nothing when it's empty). While it plays, the line lights mark by mark
   * (like the main page), and the logo and both trees follow.
   * Keying anything stops it: the message has changed.
   */

  /* the timeline: the Morse's, or with the voice on, the speech's
     (its own fixed pace: js/shared/voice.js) */
  function readingNow() {
    const entry = playable()?.entry ?? "current";
    return entry === "current" ? READING : readingOf(state.history[entry]);
  }
  const lineOf = (words, rec) => sound.speaks
    ? voiceTimeline(words, namesFor(words, readingNow()))
    : timeline(words, timingNow(), rec);

  const player = createPlayer({
    sound,
    lineOf,
    frame: showPlayback,
    end: playbackEnded,
    rounds: () => ROUNDS[repeatMode],
    gap: () => timingNow().word          // a word space between rounds
  });

  const media = createMediaControls();
  /* the app's own pop-out (apps/mobile, PipPlugin): see THE POP-OUT */
  const appPip = inApp() ? globalThis.Capacitor?.Plugins?.Pip ?? null : null;

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

  /* what play plays: the line being written, only. With none, the
     player rests greyed at 0 (play, the bar, repeat): it once played
     the last message sent, which read as that message being pulled
     back into the line */
  function playable() {
    const words = wordsOf(state.tokens);
    if (words.length) return { words, rec: pretty() ? [] : recOf(state.tokens, state.took), entry: "current" };
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

  /* (the readout's width is fixed, for the widest reading: station.css) */

  /*
   * The scrub bar's trace (js/shared/trace.js): the signal of whatever
   * play would play, with the playhead's progress.
   */
  const THUMB = 4;   // px: the playhead column's width (station.css)
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
    const line = lineOf(p.words, p.rec);
    /* each letter as its message reads it (the tray's now, or as sent) */
    const names = namesFor(p.words, readingNow()).flat();
    line.letters.forEach((l, i) => { l.label = names[i] ?? "?"; });
    trace.line(line);
  }

  new ResizeObserver(() => trace.redraw()).observe($(".seek-wrap"));
  $("#opt-sound").addEventListener("change", () => trace.redraw());   // the sounder draws clicks
  $("#opt-color").addEventListener("change", () => trace.redraw());

  /* hold the scrub bar: the magnified pop-out */
  $("#seek").addEventListener("pointerdown", () => { if (!$("#seek").disabled) trace.zoom(true); });
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => trace.zoom(false));

  function playerControls() {
    document.body.classList.toggle("playing", player.playing);
    /* playing, or paused part-way: the lit letter is where you are,
       so the caret (where typing goes) steps out until it's over */
    document.body.classList.toggle("playback", player.playing || (state.playKey !== null && player.position < player.duration));
    media.follow(player.playing, playable()?.words,   // the system's controls (js/station/media.js)
      { position: player.position, duration: playable() ? player.duration : 0, ...cardExtras() });
    scriptBuzz();                                       // the app's motor, the whole message at once
    pipFollow();                                        // the app's pop-out: its buttons, and small when left
    tab.playing(player.playing);                        // the tab's icon lit (js/station/tab.js)
    const can = !!playable();
    $("#play").disabled = !can;
    $("#seek").disabled = !can;
    $("#repeat").disabled = !can;      // greyed until there's something to play
    $("#pop").disabled = !can && !pip;
    const playIcon = player.playing ? "pause" : "play";
    if ($("#play").dataset.icon !== playIcon) {
      $("#play").dataset.icon = playIcon;
      $("#play").innerHTML = icon(playIcon);
    }
    $("#play").setAttribute("aria-label", player.playing ? "pause" : "play");
    /* nothing loaded yet: show the length of what would play, from its
       start (0.0/0.8s), as it reads while playing, so it never changes width */
    if (state.playKey === null && !player.playing) {
      const p = playable();
      const d = p ? lineOf(p.words, p.rec).duration : 0;
      $("#seek").max = Math.round(d);
      $("#seek").value = 0;
      refreshTrace();
      trace.at(0);
      $("#time").textContent = clock(0) + "/" + clock(d) + unitOf(d);
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

  let fetchingVoice = false;

  function togglePlay() {
    sound.unlock();
    if (player.playing) {
      player.pause();
      setSignal(false);     // like lifting off the key: the lamp, screen and flashlight go dark
    } else {
      if (!load()) return;
      /* the voice isn't here yet: play once it is */
      if (sound.speaks && !sound.voiceLoaded) {
        if (fetchingVoice) return;
        fetchingVoice = true;
        sound.voiceReady().then(togglePlay, () => toast("couldn't load the voice"))
          .finally(() => { fetchingVoice = false; });
        return;
      }
      if (wantsLamp() && $("#lamp").hidden) {
        const go = () => { openLamp(playable().words); togglePlay(); };
        const rate = flashRate(lineOf(playable().words, playable().rec));
        if (!lampOk(rate)) return askLamp(rate, go);
        return go();
      }
      clearTimeout(endTimer);
      keyer.cancel();
      cancelTaps();
      const note = speedNote();      // played slower than set (the flashlight)
      if (note) toast(note);
      scriptBuzz(true);              // before play(): its first frame would buzz the first mark itself
      player.play();
      drawTree();     // every branch the message takes (station/tree.js)
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
    drawLocal();
    drawTree();     // back to the letters, and the branch to what's showing
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

  /*
   * The app's motor, for playback. Buzzed mark by mark, ≋ follows the
   * frames (showPlayback → setSignal), and a page out of sight gets
   * none: the app put away or the screen off, the tone goes on (it's
   * scheduled ahead on the audio clock) and the motor stops. So in the
   * app the message is handed to the motor whole, from where it is,
   * and the motor keeps its own time (BuzzPlugin play()). Again after
   * anything that moves it (a seek, the speed, repeat); stopped with
   * the player.
   *
   *   position ↓
   *   ▁▁█▁███▁▁▁█▁█  ▁▁█▁███▁▁▁█▁█  ▁▁█▁███ …
   *   └ this round ┘ └ the rest, or one to loop (repeat ∞) ┘
   */
  let buzzed = null;      // what the motor was given: { key, position, at }
  function scriptBuzz(playing = player.playing) {
    if (!inApp()) return;       // on the web ≋ follows the signal (Chrome cuts a long pattern short)
    const p = playable();
    if (!playing || !p) {
      if (buzzed) buzzScript(null);
      buzzed = null;
      return;
    }
    const line = lineOf(p.words, p.rec);
    const rounds = ROUNDS[repeatMode], gap = timingNow().word;
    const key = [messageKey(), p.entry, line.duration, rounds, gap].join("|");
    /* (just before play(): from the end it starts again, as play() does) */
    const at = performance.now();
    const position = !player.playing && player.position >= line.duration ? 0 : player.position;
    if (buzzed?.key === key && Math.abs(buzzed.position + (at - buzzed.at) - position) < 100) return;
    const plan = buzzSteps(line, position, rounds - player.round, line.duration + gap);
    buzzed = buzzScript(plan.steps, plan.loop) ? { key, position, at } : null;
  }

  /* What the app's card shows beyond the browser's (js/station/media.js):
     its loop, repeat, and its pictures (js/station/card-art.js), a frame
     a letter, made when the message, its speed or its colours change */
  function cardExtras() {
    if (!inApp()) return {};
    const p = playable();
    if (!p) return {};
    const line = lineOf(p.words, p.rec);
    const t = timingNow();
    const signal = document.body.classList.contains("signal");
    return {
      period: line.duration + t.word,
      repeat: repeatMode,
      art: {
        key: [messageKey(), p.entry, line.duration, signal, JSON.stringify(readingNow())].join("|"),
        frames: () => cardFrames(line, namesFor(p.words, readingNow()).flat(),
          signal ? { dot: css("--dot"), dash: css("--dash") } : {})
      }
    };
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

    /* the trees follow the letter being sounded; the about column
       has the whole letter from its first mark, waiting in grey */
    const code = now.letter >= 0 ? wordsAt()[now.letter] ?? "" : "";
    drawLocal(now.path || code, now.path ? code : undefined, wordAt(now.letter));
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

  /* the word the i-th letter is in, and where in it: { codes, at } */
  function wordAt(i) {
    if (i < 0) return null;
    let n = 0;
    for (const codes of playable()?.words ?? []) {
      if (i < n + codes.length) return { codes, at: i - n };
      n += codes.length;
    }
    return null;
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

  $("#repeat").addEventListener("click", () => {
    setRepeat(NEXT[repeatMode]);
    playerControls();     // the app's card and its motor hear of it (how many times through)
  });
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
    const { letters } = lineOf(p.words, p.rec);
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
    playerRow.classList.toggle("active", on || keysAway());
  }

  /*
   * The keys put away (TX collapsed): nothing to compose into, so the
   * keyboard is the player's, as if it had been clicked, and its frame
   * stays brass to say so. Receiving keeps its own keys.
   */
  const keysAway = () => state.inputAway && !state.rx;
  /* (main.js puts them away; the body's classes, reading and rx, follow) */
  let wasAway = false;
  new MutationObserver(() => {
    if (keysAway() === wasAway) return;
    wasAway = keysAway();
    setPlayerActive(playerActive);
    if (wasAway && matchMedia("(hover: hover) and (pointer: fine)").matches)
      toast("playback keys on: k play, ← → step, 0–9 jump, m mute");
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
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
    if (event.target.closest?.('[role="tab"]') && /^Arrow(Left|Right)$/.test(event.key)) return;   // a tab's ← → move between tx and rx
    const active = playerActive || keysAway();
    /* typing (the keyboard out): every key is the message's, the
       player's only once it's clicked; put away, they're the player's */
    const typing = !active && !state.rx && state.mode === "type";
    const inUse = active || playerInUse();
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const once = fn => () => { if (!event.repeat) fn(); };
    /* said over the message, so a key pressed blind shows what it did */
    const said = (fn, what) => () => { fn(); if (keysAway()) toast(typeof what === "function" ? what() : what); };
    const where = () => `${clock(player.position)} of ${clock(player.duration)}`;
    let act = null;
    if (event.code === "Space" && !typing && inUse) act = once(said(togglePlay, () => player.playing ? "play" : "pause"));
    else if ((k === "k" || k === "p") && !typing) act = once(said(togglePlay, () => player.playing ? "play" : "pause"));
    else if (k === "m" && !typing && !state.rx) act = once(said(() => $('[data-out="sound"]').click(), () => `sound ${$('[data-out="sound"]').getAttribute("aria-pressed") === "true" ? "on" : "off"}`));
    else if ((k === "ArrowLeft" || k === "ArrowRight") && !typing) act = said(() => step(k === "ArrowRight" ? 1 : -1, event.shiftKey), () => `${k === "ArrowRight" ? "next" : "back a"} ${event.shiftKey ? "word" : "letter"}: ${where()}`);
    else if ((k === "j" || k === "l") && !typing) act = said(() => step(k === "l" ? 1 : -1, true), () => `${k === "l" ? "next" : "back a"} word: ${where()}`);
    else if (k === "Home" && !typing) act = said(() => seekTo(0), "to the start");
    else if (k === "End" && !typing) act = said(() => seekTo(Infinity), "to the end");
    else if ((k === "ArrowUp" || k === "ArrowDown") && !typing) act = said(() => nudgeVolume(k === "ArrowUp" ? 5 : -5), () => `volume ${$("#opt-vol").value}`);
    else if (/^[0-9]$/.test(k) && !typing && inUse) act = once(said(() => seekTo(player.duration * Number(k) / 10), `to ${k}0%`));
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
  $("#opt-voice").addEventListener("change", retimed);   // to or from the voice's own timeline
  $("#opt-sound").addEventListener("change", retimed);   // so is Di-Dah's
  /* the flashlight or ≋ on or off changes the speed playback can go (main.js) */
  $("#opt-light").addEventListener("change", retimed);
  $('[data-out="light"]').addEventListener("click", retimed);
  $('[data-out="vibrate"]').addEventListener("click", retimed);   // ≋ too, in the app (main.js BUZZ_WPM)


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
    /* the system's card (js/station/media.js: the browser's, or the
       app's own); seekto: its bar, dragged (seconds) */
    const seekto = details => seekTo((details.seekTime ?? 0) * 1000);
    for (const [name, fn] of [["play", play], ["pause", pause], ["stop", stopPlayback], ["seekto", seekto]]) media.handle(name, fn);
    media.handle("repeat", () => $("#repeat").click());   // the app's card: off → three → on, as the button
  }

  /*
   * ============================================================
   * THE POP-OUT
   * ============================================================
   *
   * ⧉ at the player's end: the message going out in a small window on
   * top of the others, the extension card's own (js/shared/pip.js:
   * the code, its character large, the switch, play, how far). It
   * draws on its own frames, so it keeps up in a tab you've left; a
   * click anywhere in it plays or pauses. Opening it plays.
   */
  const popButton = $("#pop");
  let pip = null, cells = [], cellsOf = null;
  if ("documentPictureInPicture" in window) popButton.hidden = false;
  popButton.addEventListener("click", () => (pip ? pip.close() : appPip ? appPop() : popOut()));
  async function popOut() {
    if (!playable()) return;
    try { pip = await documentPictureInPicture.requestWindow({ width: 340, height: 190 }); }
    catch { pip = null; return; }
    const d = fillPip(pip, {
      title: "dot-da.sh",
      classes: { light: document.documentElement.classList.contains("light"), plain: !document.body.classList.contains("signal") },
      css: PIP_CSS, body: PIP_BODY
    });
    d.body.onclick = () => togglePlay();
    pip.addEventListener("pagehide", () => {
      pip = null;
      popButton.setAttribute("aria-pressed", "false");
      playerControls();
    });
    popButton.setAttribute("aria-pressed", "true");
    if (!player.playing) togglePlay();      // popped out to hear it
    pip.requestAnimationFrame(pipFrame);
  }
  /*
   * In the app there's no Document Picture-in-Picture (not in a
   * WebView): the app itself goes small (PipPlugin), by ⧉ or by being
   * left while it plays, and while it's small the page shows the same
   * pop-out over everything, in a frame of its own. The frame stands
   * in for the window: fillPip and pipFrame draw into it as they would
   * the browser's. Its buttons are Android's, over it: play or pause,
   * and stop.
   *
   *   app small ──► "pip" on  ──► <iframe> over the page, the pop-out in it
   *   app big   ──► "pip" off ──► the frame gone, the station as it was
   */
  let pipPlaying = null;
  function pipFollow() {
    if (!appPip || pipPlaying === player.playing) return;
    pipPlaying = player.playing;
    Promise.resolve(appPip.follow({ playing: player.playing })).catch(() => { });
  }
  if (appPip) {
    Promise.resolve(appPip.info()).then(({ can } = {}) => { if (can) popButton.hidden = false; }, () => { });
    appPip.addListener?.("pip", ({ on }) => (on ? pipShown() : pipGone()));
  }
  function appPop() {
    if (!playable()) return;
    if (!player.playing) togglePlay();      // popped out to hear it
    Promise.resolve(appPip.enter()).catch(() => { });
  }
  function pipShown() {
    if (pip) return;
    const frame = document.createElement("iframe");
    frame.className = "app-pip";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#1c1916";
    document.body.append(frame);
    const win = frame.contentWindow;
    pip = {
      frame,
      document: win.document,
      CSSStyleSheet: win.CSSStyleSheet,
      requestAnimationFrame: f => requestAnimationFrame(f),
      close: () => pipGone()
    };
    fillPip(pip, {
      title: "dot-da.sh",
      classes: { light: document.documentElement.classList.contains("light"), plain: !document.body.classList.contains("signal") },
      css: PIP_CSS, body: PIP_BODY
    });
    /* Android draws its own play and stop over the window's foot, where
       the pop-out's play is (and a tap in the window reaches Android,
       not the page): ours keeps its place, so the time and bar don't
       move, but isn't drawn */
    const own = pip.document.createElement("style");
    own.textContent = ".play { visibility: hidden; }";
    pip.document.head.append(own);
    popButton.setAttribute("aria-pressed", "true");
    pip.requestAnimationFrame(pipFrame);
  }
  function pipGone() {
    if (!pip?.frame) return;
    pip.frame.remove();
    pip = null;
    popButton.setAttribute("aria-pressed", "false");
    playerControls();
  }

  /* the letters loaded, as the pop-out reads them: when each starts
     and ends, its code, its character as read, its word */
  function pipCells() {
    const line = player.line;
    if (cellsOf === line) return cells;
    cellsOf = line;
    const p = playable();
    const names = p ? namesFor(p.words, readingNow()).flat() : [];
    const wordOf = p ? p.words.flatMap((w, i) => w.map(() => i)) : [];
    cells = (line.letters ?? []).map((l, i) => ({ start: l.start, end: l.end, code: l.code, ch: names[i] ?? "", word: wordOf[i] ?? 0 }));
    return cells;
  }
  function pipFrame() {
    if (!pip) return;
    const loaded = state.playKey !== null, pos = loaded ? player.position : 0, dur = loaded ? player.duration : 0;
    drawPip(pip.document, pipShows(loaded ? pipCells() : [], pos, loaded && (player.playing || pos > 0)), {
      playing: player.playing,
      time: clock(pos) + "/" + clock(dur) + unitOf(dur),
      done: dur ? pos / dur : 0,
      down: player.playing && !!player.stateAt(pos).down
    });
    pip.requestAnimationFrame(pipFrame);
  }

  return {
    player, trace, playerControls, togglePlay, stopPlayback, messageKey, shareable,
    retimed,          // the pace changed from outside (the flashlight's, measured)
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

/*
 * The motor's steps for a message from `from` (ms into this round),
 * for `rounds` rounds (this one included; Infinity loops), each
 * `period` long (the message and the space after it): [ms, on, …],
 * and the step to loop back to (-1: once). Rounded on the running
 * total, so the lengths' rounding never adds up into drift.
 */
export function buzzSteps(line, from, rounds, period) {
  const steps = [];
  let done = 0;       // ms handed out so far (whole)
  const to = (until, on) => {
    const ms = Math.round(until) - done;
    if (ms > 0) { steps.push(ms, on ? 1 : 0); done += ms; }
  };
  const round = (base, start, last) => {
    for (const m of line.marks) {
      if (m.end <= start) continue;
      to(base + Math.max(m.start, start) - from, false);
      to(base + m.end - from, true);
    }
    if (!last) to(base + period - from, false);
  };
  round(0, from, rounds <= 1);
  let loop = -1;
  if (rounds === Infinity) {
    loop = steps.length / 2;
    round(period, 0, false);
  } else {
    for (let r = 1; r < rounds; r++) round(r * period, 0, r === rounds - 1);
  }
  return { steps, loop };
}

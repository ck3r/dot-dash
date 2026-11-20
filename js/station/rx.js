/*
 * RX: the station hears. Receiving, this view has the bottom of the
 * station to itself: the keys' slot and, above it, where the player
 * and the transmitter's settings were (js/station/main.js setRx). What it
 * hears is keyed onto the line like anything else: marks, letter
 * spaces, word spaces, as a guess to fix (⌫ and a computer keyboard
 * still work on it).
 *
 *   ┌──────────────────────────────────────────┐
 *   │            C      Q          D     X     │   the scope: what's heard,
 *   │           ▄ ▄▄▄  ▄▄▄ ▄      ▄▄▄ ▄  ▄▄▄ ▄  │   the newest at the right,
 *   │ ▁▁▁▁▁▁▁▁▁▁█▁███▁▁███▁█▁▁▁▁▁▁███▁█▁▁███▁█▁ │   each letter over its marks
 *   │ 6 s                 700 Hz · sine · 18 wpm│   how much is shown; the sender
 *   └──────────────────────────────────────────┘
 *   [ ● ][ ▶ ][ ❚❚ ][ ◀◀ ][ ▶▶ ][ ■ ][ × ]         a tape deck's keys
 *    rec  play pause  rw    ff   stop clear
 *
 * and above it all, in the row over the slot, after settings:
 *
 *   ⚙  Heard here only: …   open a file…  save a .wav
 *
 * It's a tape recorder. What's heard goes onto a tape (in memory,
 * the last ten minutes) as well as onto the line:
 *
 *   rec      listen: the microphone, from the end of the tape on
 *   play     the tape, from where the scope stands: only the tone that
 *            was read, the rest of the sound filtered away
 *            (isolate, over the scope, switches that off: raw)
 *   pause    hold whichever is going; again, and it goes on
 *   rw, ff   wind the tape while held (the scope winds with it)
 *   stop     stop, and that's that
 *   clear    the tape wiped (a second tap: it can't be undone). The
 *            line stays: that's the message, not the tape
 *
 * A tap on the scope is rec, then pause. Not recording, a drag winds
 * the tape by hand and a pinch (or the wheel) magnifies it. Wherever
 * the tape stands (wound, or playing), the line above stands there
 * too: the letters up to it lit, the rest dimmed, as when a message
 * is played.
 *
 * NOTHING STOPS IT BUT YOU: listening goes on until pause, stop,
 * play, a file opened, or leaving rx. Silence doesn't end it.
 *
 * SOUND OR LIGHT ("sound  light", in the suggestions' row): light is
 * the camera, pointed at a lamp that flashes. Its picture stands
 * over the scope with a ring in it, the spot that's watched: tap the
 * lamp and the ring goes there, as often as the camera wanders
 * (js/station/rx-eye.js; the reading is js/core/rx-light.js). The deck works
 * it the same way, with a camera's differences:
 *
 *   rec      watch: the camera; or a video that's been opened,
 *            played from where it stands
 *   pause    hold (a video stays where it is)
 *   stop     stop (a video goes back to its start)
 *   play     nothing to play: there's no tape of pictures. The scope
 *            still winds through what was seen, and the line with it
 *   clear    the video goes too
 *
 * What's seen is drawn on the same scope and goes onto the same
 * line; nothing of the picture is kept at all.
 *
 * POP OUT ("pop out", after save a .wav; where the browser has it):
 * what's heard, in a small window that stays on top of every other,
 * for listening to a radio or a video while you're in another window.
 *
 *   ╭──────────────────────────────────╮
 *   │                   CQ CQ DE K1ABC │   the line, its newest end
 *   │ ▁▁█▁███▁▁▁███▁█▁▁▁▁▁███▁█▁▁███▁█ │   the scope
 *   │ o/  ● ‖        700 Hz · 18 wpm   │   the switch, rec, pause, the sender
 *   ╰──────────────────────────────────╯
 *
 * A tab you've left gets no frames of its own, so while it's open the
 * window's frames draw the scope, and it's copied across.
 *
 *   createRx({ state, press, unitNow, fist, logo, playing }) → {
 *     show(on)     the view came or went (it stops when it goes)
 *     stop()       stop listening, and playing
 *     listening    is the microphone open?
 *   }
 *
 * The hearing itself is js/core/rx-decoder.js (no page in it), the seeing
 * js/core/rx-light.js; this is the microphone, a file, the tape and the
 * scope. Loaded the first
 * time rx is chosen: a station that only sends never fetches it.
 *
 * The sound stays on this device and isn't kept: the tape is in
 * memory only, gone with clear or with the page, and never sent.
 * "save a .wav" is the one way it's kept, and it's you who asks.
 */
import { createHearing, hear } from "../core/rx-decoder.js";
import { createSeeing } from "../core/rx-light.js";
import { createEye } from "./rx-eye.js";
import { DECODE } from "../core/morse.js";
import { wordsOf } from "./state.js";
import { $, toast } from "../shared/dom.js";

const COLUMN_MS = 16;         // one column of the scope
const SPAN_MS = 6000;         // how much it shows, to begin with
const SPAN_MIN = 1500;        // magnified: a letter or two across
const SPAN_MAX = 60000;       // and the other way: a minute
const KEPT_MS = 600000;       // the tape: ten minutes
const BREAK_MS = 400;         // between one recording and the next, on the tape
const TAP_PX = 5;             // a finger that moved less than this tapped
const WIND = 12;              // rw and ff: this many times as fast as it was heard
const JUMP_MS = 2000;         // rw and ff from a keyboard: a step

/*
 * THE TAPE: the sound, small. Morse lives under 1200 Hz, so 12,000
 * samples a second hold it with room to spare (a quarter of what the
 * microphone gives): ten minutes is 14 MB, not 115.
 *
 *   microphone 48,000 /s ─► every four averaged ─► 12,000 /s, 16 bit
 *
 * A place on the tape and a place on the scope are the same thing:
 * sample i was heard at i / 12 ms.
 */
const TAPE_RATE = 12000;
const BLOCK = TAPE_RATE * 10;
const TAPE_MAX = KEPT_MS / 1000 * TAPE_RATE;

function createTape() {
  let blocks = [], first = 0, end = 0;      // samples first..end are held
  let sum = 0, n = 0, phase = 0;
  function put(v) {
    const k = end - first;
    if (k === blocks.length * BLOCK) blocks.push(new Int16Array(BLOCK));
    blocks[Math.floor(k / BLOCK)][k % BLOCK] = v;
    end++;
    if (end - first > TAPE_MAX + BLOCK) { blocks.shift(); first += BLOCK; }
  }
  return {
    /* a new recording starts at `ms`: silence up to there */
    startAt(ms) {
      const to = Math.round(ms * TAPE_RATE / 1000);
      while (end < to) put(0);
      sum = n = phase = 0;
    },
    record(samples, rate) {
      const step = rate / TAPE_RATE;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i]; n++;
        if (++phase >= step) {
          phase -= step;
          put(Math.max(-1, Math.min(1, sum / n)) * 32767);
          sum = n = 0;
        }
      }
    },
    /* from `ms` to the end, as sound */
    from(ms) {
      const at = Math.max(first, Math.min(end, Math.round(ms * TAPE_RATE / 1000)));
      const out = new Float32Array(end - at);
      for (let i = at; i < end; i++) { const k = i - first; out[i - at] = blocks[Math.floor(k / BLOCK)][k % BLOCK] / 32767; }
      return out;
    },
    wipe() { blocks = []; first = end = 0; sum = n = phase = 0; },
    get startMs() { return first * 1000 / TAPE_RATE; },
    get endMs() { return end * 1000 / TAPE_RATE; },
    get empty() { return end === first; }
  };
}

export function createRx({ state, press, unitNow, fist, logo, playing }) {
  const view = $("#rx"), canvas = $("#rx-scope"), read = $("#rx-read"), shown = $("#rx-span");
  const keys = {
    rec: $("#rx-rec"), play: $("#rx-play"), pause: $("#rx-pause"), rw: $("#rx-rw"),
    ff: $("#rx-ff"), stop: $("#rx-stop"), clear: $("#rx-clear")
  };
  const saveButton = $("#rx-save");
  const tape = createTape();
  let ctx = null, stream = null, node = null, source = null, hearing = null;
  let starting = false;
  let medium = "sound";         // or "light": what rec takes in
  let eye = null, seeing = null;   // the camera's view (made when light is first chosen); what's reading it
  let asked = 0;                // (each time the camera's asked for: one that comes after a stop is let go)
  let sounded = false;          // is there sound on the tape (light leaves none)?
  /* taking in, either way: the microphone open, or the camera watched */
  const going = () => !!stream || starting || !!seeing;
  let paused = null;            // "rec" or "play": what pause is holding
  let learned = null;           // the hand heard before a pause: where the reader starts again

  /*
   * THE SCOPE: a column every 16 ms, as tall as the tone is loud
   * (against its own floor and peak, so a faint signal fills it as
   * a strong one does). A column is brass while the key's down and
   * not yet read; once the mark is called it takes the dit's or the
   * dah's colour. Over each letter's marks, the letter (graphite if
   * a mark of it was in doubt).
   *
   * Each recording (and each file) carries on to the right of the
   * last, a little apart: the hearing counts its own time from
   * nothing, so `from` is where this one starts. `parts` remembers
   * each one's pitch, for playing it back.
   *
   * What's shown: `span` ms of it, ending `back` ms before the
   * newest: that right edge is where the tape stands (the playhead).
   * Recording, it's always the newest (back is 0).
   *
   *   oldest ├───────────────┤◄─ span ─►├◄─ back ─►┤ newest
   */
  const columns = [];           // { at, level, down, mark }
  const letters = [];           // { from, to, name, unsure, line, n }: n, which letter of which line it became
  const parts = [];             // { from, pitch }
  let column = null, dirty = false, from = 0;
  let letter = [];              // the marks of the letter in the air: { at, on, m, sure }
  let span = SPAN_MS, back = 0;

  function begin() {
    from = columns.length ? columns.at(-1).at + BREAK_MS : 0;
    tape.startAt(from);
    parts.push({ from, pitch: null });
    column = null;
    letter = [];
    back = 0;
  }
  /* (`ms`: how long the column stands for, when it isn't the scope's
     own 16: a camera's pictures are further apart than that) */
  function level({ at, level: l, down, ms }) {
    at += from;
    if (!column || at - column.at >= COLUMN_MS) {
      column = { at, level: l, down, mark: null, ...(ms && { ms }) };
      columns.push(column);
      while (at - columns[0].at > KEPT_MS) columns.shift();
      while (letters.length && at - letters[0].to > KEPT_MS) letters.shift();
    } else {
      column.level = Math.max(column.level, l);
      column.down ||= down;
    }
    dirty = true;
  }
  /* a mark was called: the columns it covered take its colour */
  function colour(m, at, on) {
    for (let i = columns.length - 1; i >= 0 && columns[i].at >= at - on - COLUMN_MS; i--) {
      if (columns[i].at <= at && columns[i].down) columns[i].mark = m;
    }
    dirty = true;
  }

  /* heard marks go onto the line; `heard` keeps them out of YOUR
     keying's counts (station/stats.js). One that fell between a dit and a
     dah says so, and the tape shows its letter as a guess (station/tape.js) */
  function mark(m, how) {
    const at = how.at + from;
    colour(m, at, how.on);
    letter.push({ at, on: how.on, m, sure: how.sure });
    press(m, { on: how.on, gap: how.gap, unit: how.unit, ...(!how.sure && { unsure: true, dah: how.dah }) }, true);
  }
  function space(kind) {
    if (letter.length) {
      const heard = {
        from: letter[0].at - letter[0].on, to: letter.at(-1).at,
        name: DECODE[letter.map(l => l.m).join("")] ?? "?",
        unsure: letter.some(l => !l.sure), line: lineNow, n: -1
      };
      letters.push(heard);
      letter = [];
      dirty = true;
      press(kind, null, true);
      /* where it landed on the line (unless the line went: a prosign
         that returns takes the message up with it) */
      if (heard.line === lineNow) heard.n = wordsOf(state.tokens).flat().length - 1;
      return;
    }
    press(kind, null, true);
  }

  /*
   * THE LINE FOLLOWS THE TAPE. Wound back, or playing, the message
   * above shows where the tape stands, the way a played message does
   * (station.css .line.live): letters heard before that point lit, the
   * one just heard underlined, the ones still to come dimmed.
   *
   *   tape   C   Q  │  D   X          the scope's right edge: here
   *   line   C   Q     d   x          (D and X dimmed: not yet)
   *
   * Only the line being written: a message sent up to the history
   * (or cleared) is a line of its own, and the tape's letters from
   * before then have nowhere to point.
   */
  let lineNow = 0, followed = "off";
  state.on(event => { if (event.type === "send" || event.type === "clear") lineNow++; });
  function followLine() {
    const lineEl = document.querySelector("#tape .current .line:not(.empty-line)");
    const mine = letters.some(l => l.line === lineNow && l.n >= 0);
    const standing = (sounding || back > 0) && mine && lineEl && !view.hidden;
    if (!standing) {
      if (followed !== "off") {
        followed = "off";
        for (const l of document.querySelectorAll("#tape .current .line.live")) {
          l.classList.remove("live");
          for (const c of l.querySelectorAll(".c")) c.classList.remove("landed", "sent");
        }
      }
      return;
    }
    const at = newest() - back;
    const last = letters.findLast(l => l.line === lineNow && l.n >= 0 && l.to <= at);
    const n = last ? last.n : -1;
    /* (a key, a fix: the line is drawn again, and has to be lit again) */
    if (followed === n && lineEl.classList.contains("live")) return;
    followed = n;
    lineEl.classList.add("live");
    const cells = [...lineEl.querySelectorAll(".c")];
    cells.forEach((c, i) => {
      c.classList.toggle("sent", i < n);
      c.classList.toggle("landed", i === n);
    });
    cells[Math.max(0, n)]?.scrollIntoView({ block: "nearest" });
  }

  /* how far back there is to go: to the tape's first column */
  const newest = () => (columns.length ? columns.at(-1).at : 0);
  const reach = () => (columns.length ? newest() - columns[0].at : 0);
  function look(nextSpan, nextBack) {
    span = Math.max(SPAN_MIN, Math.min(SPAN_MAX, nextSpan));
    back = going() ? 0 : Math.max(0, Math.min(reach(), nextBack));
    dirty = true;
  }

  const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  function draw() {
    if (!dirty || view.hidden) return;
    dirty = false;
    /* the corner of the scope, as a meter has: how much is across it,
       and how far back the tape stands */
    const across = span >= 10000 ? `${Math.round(span / 1000)} s` : `${Math.round(span / 100) / 10} s`;
    const label = columns.length ? (back > 0 ? `${across} · −${clock(back)}` : across) : "";
    if (shown.textContent !== label) shown.textContent = label;
    const ratio = devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * ratio)) canvas.width = Math.round(w * ratio);
    if (canvas.height !== Math.round(h * ratio)) canvas.height = Math.round(h * ratio);
    const g = canvas.getContext("2d");
    const css = getComputedStyle(view);
    const ink = name => css.getPropertyValue(name).trim();
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    const base = h - 22, top = 22;            // (letters above the marks, the meter's line below)
    g.fillStyle = ink("--wire");
    g.fillRect(0, base, w, 1);
    g.font = `12px ${css.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (!columns.length) {
      /* (light: the picture above says "tap to watch") */
      if (!going() && medium === "sound") { g.fillStyle = ink("--graphite"); g.fillText("tap to listen", w / 2, h / 2); }
      return;
    }
    const end = newest() - back, per = w / span;
    for (let i = columns.length - 1; i >= 0; i--) {
      const c = columns[i];
      if (c.at > end) continue;
      const ms = c.ms ?? COLUMN_MS, wide = Math.max(1, ms * per + 0.4);   // (a hair over: magnified, no stripes between columns)
      const x = w - (end - c.at) * per - ms * per;
      if (x + wide < 0) break;
      const tall = Math.max(1, c.level * (base - top));
      g.fillStyle = c.mark === "." ? ink("--dot") : c.mark === "-" ? ink("--dash") : c.down ? ink("--brass") : ink("--graphite");
      g.fillRect(x, base - tall, wide, tall);
    }
    /* the letters, the newest first; one that would sit on the last
       drawn is left out (zoomed far out, there isn't room for all) */
    let clear = Infinity;
    for (let i = letters.length - 1; i >= 0; i--) {
      const l = letters[i];
      if (l.from > end) continue;
      const x = w - (end - (l.from + l.to) / 2) * per;
      if (x < -10) break;
      if (x > clear - 9) continue;
      clear = x;
      g.fillStyle = l.unsure ? ink("--graphite") : ink("--paper");
      g.fillText(l.name, x, 11);
    }
    /* wound back: a brass edge at the right, where the tape stands */
    if (back > 0) { g.fillStyle = ink("--brass"); g.fillRect(w - 2, top, 2, base - top); }
  }

  /*
   * THE READOUT, in the scope's bottom right corner: the sender.
   *
   *   700 Hz · sine · 18 wpm        the pitch, the tone's shape, the speed
   *   600 Hz · sine · 20/8 wpm      stretched spaces: letters at 20, spaced as 8
   *
   *   30 fps · 12 wpm               light: the pictures a second it's
   *                                 seen by (they're what limits the speed)
   *
   * It stays when listening stops (it's what was heard), until the
   * next recording starts, or the tape's wiped.
   */
  const speedOf = ({ wpm, fwpm }) => {
    const speed = Math.round(wpm), spaced = Math.round(fwpm ?? wpm);
    return `${spaced < speed * 0.85 ? `${speed}/${spaced}` : speed} wpm`;
  };
  const said = heard => [`${heard.pitch} Hz`, heard.wave, speedOf(heard)].filter(Boolean).join(" · ");
  function readout() {
    if (seeing) { read.textContent = seeing.settled ? `${Math.round(seeing.rate)} fps · ${speedOf(seeing)}` : "watching…"; return; }
    if (!hearing) return;
    if (hearing.settled) parts.at(-1).pitch = hearing.pitch;
    read.textContent = hearing.settled ? said(hearing) : "listening…";
  }

  /*
   * REC: the microphone. Asked for when rec is pressed, never before.
   * The browser's own tidying is switched off: echo cancelling and
   * noise suppression are made for voices, and a steady tone is
   * exactly what they take out.
   */
  async function rec(resume = false) {
    if (going()) return;
    if (medium === "light") { watch(resume); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      toast("this browser can't listen");
      return;
    }
    haltPlay();
    paused = null;
    starting = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      starting = false;
      toast(e?.name === "NotAllowedError" ? "the microphone wasn't allowed" : "no microphone here");
      sync();
      return;
    }
    try {
      ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/js/station/rx-worklet.js");
      await ctx.resume();
      begin();
      sounded = true;
      hearing = createHearing({
        sampleRate: ctx.sampleRate,
        unit: unitNow(),          // the speed set in the tray: where it starts from;
        /* better, the hand heard before the pause; or your own
           (station/stats.js): it may be you keying */
        expect: (resume && learned) || fist(),
        mark(m, how) { mark(m, how); readout(); },
        space,
        key: down => logo.classList.toggle("down", down),
        level
      });
      source = ctx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(ctx, "rx-tap", { numberOfInputs: 1, numberOfOutputs: 1 });
      /* (while the transmitter is playing, it would only hear itself) */
      const rate = ctx.sampleRate;
      node.port.onmessage = event => {
        if (!playing() && hearing) { tape.record(event.data, rate); hearing.feed(event.data); }
        readout();
      };
      /* on to the speakers through a gain of nothing: a node that
         leads nowhere isn't always run */
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node).connect(mute).connect(ctx.destination);
    } catch (e) {
      starting = false;
      stopRec();
      toast("this browser can't listen");
      return;
    }
    starting = false;
    state.record("listen");
    read.textContent = "listening…";
    sync();
  }

  /*
   * WATCH: rec, in light. The camera (asked for now, never before),
   * or the video that's open, played on from where it stands; either
   * way the eye says how bright the ring is, a picture at a time,
   * and the seeing reads it.
   */
  async function watch(resume) {
    haltPlay();
    paused = null;
    starting = true;
    sync();
    const mine = ++asked;
    const how = await eye.start();
    if (mine !== asked) { if (how === true) eye.halt(); return; }    // stopped while the camera was coming
    starting = false;
    if (how !== true) {
      toast(how === "denied" ? "the camera wasn't allowed" : how === "none" ? "no camera here" : "this browser can't watch");
      sync();
      return;
    }
    begin();
    seeing = createSeeing({
      unit: unitNow(),
      expect: (resume && learned) || fist(),
      mark(m, how) { mark(m, how); },
      space,
      shortest: aim === "blink" ? BLINK : 0,
      key(down) { logo.classList.toggle("down", down); eye.lit = down; },
      level
    });
    state.record("listen", { light: true });
    read.textContent = "watching…";
    sync();
  }

  function stopRec() {
    asked++;
    if (seeing) {
      eye.halt();
      seeing.flush();
      if (seeing.settled) learned = seeing.learned; else read.textContent = "";
      seeing = null;
    } else if (starting && medium === "light") starting = false;
    for (const track of stream?.getTracks?.() ?? []) track.stop();
    try { node?.disconnect(); source?.disconnect(); } catch { }
    try { ctx?.close(); } catch { }
    hearing?.flush();             // the letter in the air is closed
    if (hearing && !hearing.settled) read.textContent = "";
    if (hearing?.settled) learned = hearing.learned;
    stream = node = source = ctx = hearing = null;
    logo.classList.remove("down");
    sync();
  }

  /*
   * PLAY: the tape from where the scope stands, through a narrow
   * filter at the pitch that was read there, so what comes out is
   * the suspected Morse and little else (the hiss, the voices, the
   * other station a few hundred Hz away are turned down). At the
   * end of the tape it stops; started at the end, it starts from
   * the beginning.
   *
   *   tape ─► [ band at 700 Hz ] ─► [ again ] ─► speaker
   *
   * That's "isolate" (in the suggestions' row, at the right), on to
   * begin with. Off, the tape plays raw: the sound as it was, the
   * room and all. It can be switched while the tape plays (the bands
   * stay in the way and let everything through), and it's remembered.
   *
   * Nothing is read again: the line has it already.
   */
  let out = null;               // the speaker's context, made on the first play
  let sounding = null;          // { src, bands, t0, back0 }
  const isolateButton = $("#rx-isolate"), ISOLATE = "dot-dash:rx-isolate";
  let isolate = true;
  try { isolate = localStorage.getItem(ISOLATE) !== "0"; } catch { }
  isolateButton.setAttribute("aria-pressed", String(isolate));
  const bandType = () => (isolate ? "bandpass" : "allpass");
  isolateButton.addEventListener("click", () => {
    isolate = !isolate;
    isolateButton.setAttribute("aria-pressed", String(isolate));
    for (const band of sounding?.bands ?? []) band.type = bandType();
    try { localStorage.setItem(ISOLATE, isolate ? "1" : "0"); } catch { }
  });
  const pitchAt = ms => parts.findLast(p => p.from <= ms)?.pitch ?? parts.find(p => p.pitch)?.pitch ?? null;
  async function play() {
    if (tape.empty || !sounded) return;
    if (going()) stopRec();
    haltPlay();
    paused = null;
    if (back <= 0) back = reach();
    const head = newest() - back;
    const sound = tape.from(head);
    if (!sound.length) return;
    out ??= new AudioContext();
    await out.resume();
    const buffer = out.createBuffer(1, sound.length, TAPE_RATE);
    buffer.getChannelData(0).set(sound);
    const src = out.createBufferSource();
    src.buffer = buffer;
    const pitch = pitchAt(head);
    const bands = pitch ? [0, 1].map(() => {
      const band = out.createBiquadFilter();
      band.type = bandType();
      band.frequency.value = pitch;
      band.Q.value = pitch / 120;            // about 120 Hz across: a keyed tone and no more
      return band;
    }) : [];
    [src, ...bands, out.destination].reduce((a, b) => (a.connect(b), b));
    const mine = sounding = { src, bands, t0: out.currentTime, back0: back };
    src.onended = () => { if (sounding === mine) { sounding = null; back = 0; sync(); } };
    src.start();
    sync();
  }
  function haltPlay() {
    if (!sounding) return false;
    const { src } = sounding;
    sounding = null;
    try { src.stop(); } catch { }
    sync();
    return true;
  }
  /* while it plays, the scope stands where the sound is */
  function follow() {
    if (!sounding) return;
    back = Math.max(0, sounding.back0 - (out.currentTime - sounding.t0) * 1000);
    const pitch = pitchAt(newest() - back);
    if (pitch) for (const band of sounding.bands) if (band.frequency.value !== pitch) { band.frequency.value = pitch; band.Q.value = pitch / 120; }
    dirty = true;
  }

  /* PAUSE holds what's going, and lets it go on; STOP ends it */
  function pause() {
    if (going()) { stopRec(); paused = "rec"; }
    else if (sounding) { haltPlay(); paused = "play"; }
    else if (paused === "rec") rec(true);
    else if (paused === "play") play();
    sync();
  }
  function stop() {
    if (going()) stopRec();
    haltPlay();
    paused = null;
    eye?.rewind();                // (a video: stopped, it's at its start again)
    sync();
  }

  /*
   * RW, FF: held, the tape winds (twelve times as fast as it was
   * heard) and the scope with it; playing, it plays on from where
   * it's let go. From a keyboard, a step of two seconds.
   */
  let winding = 0, resume = false, last = 0;
  function wind(way) {
    if (going() || !columns.length) return;
    resume = haltPlay() || resume;
    winding = way;
  }
  function unwind() {
    if (!winding) return;
    winding = 0;
    if (resume) { resume = false; play(); }
  }
  for (const [key, way] of [["rw", 1], ["ff", -1]]) {
    keys[key].addEventListener("pointerdown", event => { keys[key].setPointerCapture?.(event.pointerId); wind(way); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) keys[key].addEventListener(type, unwind);
    keys[key].addEventListener("click", event => {
      if (event.detail || going()) return;          // (a pointer's click: the hold did it already)
      const going = haltPlay();
      look(span, back + way * JUMP_MS);
      if (going && back > 0) play();
    });
  }

  (function frame(now) {
    const dt = Math.min(100, now - last || 0);
    last = now;
    if (winding) {
      look(span, back + winding * dt * WIND);
      if (back <= 0 || back >= reach()) sync();     // (it ran out: the keys say so)
    }
    follow();
    followLine();
    draw();
    requestAnimationFrame(frame);
  })(0);
  new ResizeObserver(() => { dirty = true; }).observe(canvas);

  /*
   * CLEAR wipes the tape: the scope, the sound, what was known of
   * the sender. A second tap does it (the first only arms it, for
   * three seconds): there's no getting a tape back.
   */
  let armed = null;
  function clearTape() {
    if (!armed) {
      keys.clear.classList.add("armed");
      keys.clear.querySelector(".word").textContent = "sure?";
      armed = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    stop();
    columns.length = letters.length = parts.length = 0;
    tape.wipe();
    sounded = false;
    eye?.close();                 // (a video that was open goes with it: rec is the camera again)
    column = null; letter = []; from = 0; back = 0; learned = null;
    read.textContent = "";
    sync();
  }
  function disarm() {
    clearTimeout(armed);
    armed = null;
    keys.clear.classList.remove("armed");
    keys.clear.querySelector(".word").textContent = "clear";
  }

  keys.rec.addEventListener("click", () => { if (!going()) rec(); });
  keys.play.addEventListener("click", () => { if (!sounding) play(); });
  keys.pause.addEventListener("click", pause);
  keys.stop.addEventListener("click", stop);
  keys.clear.addEventListener("click", clearTape);

  /* SAVE A .WAV: the tape as it is, as a file. The one way the sound
     is kept, and only when asked */
  saveButton.addEventListener("click", async () => {
    if (tape.empty) return;
    const { wavFile, save } = await import("../shared/files.js");
    const d = new Date(), two = x => String(x).padStart(2, "0");
    save(wavFile(tape.from(tape.startMs), TAPE_RATE), `dot-dash_heard_${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}.wav`);
    toast("saved as a .wav");
  });

  /*
   * THE SCOPE UNDER A FINGER
   *
   *   a tap            rec, then pause (and again: on it goes)
   *   a drag           not recording: the tape, wound by hand
   *   a pinch          magnify (two fingers apart), or take in more
   *   the wheel        magnify; sideways (or with Shift), wind
   */
  const fingers = new Map();    // pointer id → x
  let moved = false, downX = 0, pinch = null, dragResume = false;
  canvas.addEventListener("pointerdown", event => {
    if (event.button > 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    if (!fingers.size) { moved = false; downX = event.clientX; }
    fingers.set(event.pointerId, event.clientX);
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      pinch = { apart: Math.max(10, Math.abs(a - b)), span };
      moved = true;             // two fingers are never a tap
    }
  });
  canvas.addEventListener("pointermove", event => {
    if (!fingers.has(event.pointerId)) return;
    const was = fingers.get(event.pointerId);
    fingers.set(event.pointerId, event.clientX);
    if (fingers.size === 2 && pinch) {
      const [a, b] = [...fingers.values()];
      look(pinch.span * pinch.apart / Math.max(10, Math.abs(a - b)), back);
    } else if (fingers.size === 1) {
      if (!moved && Math.abs(event.clientX - downX) <= TAP_PX) return;
      if (!moved) dragResume = haltPlay();          // playing: it plays on from where it's dropped
      moved = true;
      look(span, back + (event.clientX - was) * span / (canvas.clientWidth || 1));
    }
  });
  function lift(event) {
    if (!fingers.delete(event.pointerId)) return;
    if (fingers.size < 2) pinch = null;
    if (fingers.size) return;
    if (dragResume) { dragResume = false; if (back > 0) play(); }
    else if (!moved && event.type === "pointerup") tap();
  }
  function tap() {
    if (going() || sounding || paused) pause();
    else rec();
  }
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!sideways) { look(span * Math.exp(event.deltaY * 0.002), back); return; }
    const going = haltPlay();
    look(span, back - (event.deltaX || event.deltaY) * span / (canvas.clientWidth || 1));
    if (going && back > 0) play();
  }, { passive: false });

  /* the keys as they stand: paper for the one that's down, the ones
     with nothing to do greyed out */
  function sync() {
    const recording = going(), none = !columns.length, light = medium === "light";
    const down = (key, on) => keys[key].setAttribute("aria-pressed", String(on));
    down("rec", recording);
    down("play", !!sounding);
    down("pause", !!paused);
    keys.play.disabled = !sounded || (none && !recording);
    keys.pause.disabled = !recording && !sounding && !paused;
    keys.rw.disabled = none || recording || back >= reach();
    keys.ff.disabled = none || recording || back <= 0;
    keys.stop.disabled = !recording && !sounding && !paused;
    keys.clear.disabled = none && !recording && !eye?.film;
    saveButton.disabled = !sounded || (tape.empty && !recording);
    canvas.title = recording ? "tap to pause"
      : sounding ? "tap to pause; drag to wind the tape"
        : `tap to ${light ? "watch" : "listen"}; drag back through what was ${light ? "seen" : "heard"}, pinch (or the wheel) to magnify`;
    view.classList.toggle("on", recording);
    view.classList.toggle("paused", !recording && !none);
    dirty = true;
  }

  /*
   * A FILE: a recording, opened and read the same way, all at once
   * (and better than live: it's listened through once to learn the
   * sender's hand, then read from the start; js/core/rx-decoder.js hear).
   * It goes onto the tape as if just heard: there to wind and play.
   */
  const input = $("#rx-file-input");
  $("#rx-file").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";             // the same file again is still a change
    if (file) open(file);
  });
  /*
   * Or dropped onto the view. Whatever the browser can take the sound
   * out of: .wav, .mp3, .m4a, .ogg, .flac as a rule, and the sound of
   * a video (.mp4, .webm) where it can (which ones is the browser's
   * business; one it can't read says so).
   */
  view.addEventListener("dragover", event => {
    if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    view.classList.add("drop");
  });
  view.addEventListener("dragleave", event => { if (!view.contains(event.relatedTarget)) view.classList.remove("drop"); });
  view.addEventListener("drop", event => {
    view.classList.remove("drop");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    open(file);
  });
  async function open(file) {
    if (medium === "light") { film(file); return; }
    stop();
    let audio;
    try {
      const decoder = new (window.OfflineAudioContext ?? window.AudioContext)(1, 1, 44100);
      audio = await decoder.decodeAudioData(await file.arrayBuffer());
    } catch {
      toast("that file couldn't be read as sound");
      return;
    }
    let marks = 0;
    begin();
    sounded = true;
    tape.record(audio.getChannelData(0), audio.sampleRate);
    const heard = hear(audio.getChannelData(0), audio.sampleRate, {
      unit: unitNow(),
      expect: fist(),
      mark(m, how) { marks++; mark(m, how); },
      space,
      level
    });
    if (marks) parts.at(-1).pitch = heard.pitch;
    state.record("listen", { file: true });
    read.textContent = marks ? said(heard) : "";
    toast(marks ? `heard at ${Math.round(heard.wpm)} wpm` : "no Morse heard in it");
    sync();
  }

  /*
   * A VIDEO, in light: it isn't read all at once as a sound file is,
   * because nobody has said yet where in it the lamp is. It stands at
   * its first picture: tap the lamp, then rec plays it and reads it
   * (and the ring can be moved as it goes). Stop takes it back to the
   * start for another go; clear takes it away.
   */
  async function film(file) {
    stop();
    if (!(await eye.load(file))) { toast("that file couldn't be read as pictures"); sync(); return; }
    toast(aim === "blink" ? "tap the eye, then rec" : "tap the lamp, then rec");
    sync();
  }

  /*
   * SOUND OR LIGHT: two words in the suggestions' row, the one that's
   * on in paper. Changing stops what's going; the tape, the scope and
   * the line stay (they're what was taken in, either way). Isolate is
   * the sound's, so in light it's put out (its place kept: the words
   * beside it don't move).
   */
  const mediumButton = $("#rx-medium"), eyeBox = $("#rx-eye"), note = $("#rx-note"), MEDIUM = "dot-dash:rx-medium";
  function setMedium(next) {
    const light = next === "light";
    if (going() || sounding || paused) stop();
    if (!light) eye?.close();
    medium = next;
    if (light) eye ??= createEye({
      frame(value, at) { if (seeing) { seeing.see(value, at); eye.shut = seeing.down; readout(); } },
      ended: stop,
      tap
    });
    view.classList.toggle("light", light);
    eyeBox.hidden = !light;
    isolateButton.classList.toggle("off", light);
    lookButton.classList.toggle("off", !light);
    if (light) eye.reading = aim;
    for (const side of mediumButton.querySelectorAll(".side")) side.classList.toggle("on", side.dataset.medium === medium);
    mediumButton.setAttribute("aria-label", light ? "reading light: switch to sound" : "reading sound: switch to light");
    note.textContent = `${light ? "Seen" : "Heard"} here only: not kept, never sent.`;
    keys.rec.title = light ? "record: watch (the camera, or the video that's open), read as Morse onto the line" : "record: listen (the microphone), read as Morse onto the line";
    try { localStorage.setItem(MEDIUM, medium); } catch { }
    sync();
  }
  mediumButton.addEventListener("click", () => setMedium(medium === "light" ? "sound" : "light"));

  /*
   * LAMP OR BLINK, in light: what the ring is on. A lamp is read by
   * how bright it is; an eye by how much it has changed from rest,
   * and a mark shorter than a fifth of a second is a blink nobody
   * meant (js/core/rx-light.js). Changing stops what's going, as sound or
   * light does.
   */
  const lookButton = $("#rx-look"), LOOK = "dot-dash:rx-look";
  const BLINK = 200;            // ms: shorter, and it's a blink
  let aim = "lamp";             // what the ring is on
  function setLook(next) {
    if (going()) stop();
    aim = next;
    if (eye) eye.reading = aim;
    for (const side of lookButton.querySelectorAll(".side")) side.classList.toggle("on", side.dataset.look === aim);
    lookButton.setAttribute("aria-label", aim === "blink" ? "reading blinks: switch to a lamp" : "reading a lamp: switch to blinks");
    try { localStorage.setItem(LOOK, aim); } catch { }
    sync();
  }
  lookButton.addEventListener("click", () => setLook(aim === "blink" ? "lamp" : "blink"));
  let lookKept = null;
  try { lookKept = localStorage.getItem(LOOK); } catch { }
  if (lookKept === "blink") setLook("blink");
  let kept = null;
  try { kept = localStorage.getItem(MEDIUM); } catch { }
  if (kept === "light") setMedium("light");

  /*
   * THE POP-OUT. Its window is the page's own (a blank one, on top):
   * the look goes in as a constructed sheet, in the station's colours
   * as they stand (dark or light), and everything in it is drawn from
   * here.
   */
  const popButton = $("#rx-pop");
  let pip = null, pipRaf = 0;
  if ("documentPictureInPicture" in window) popButton.hidden = false;
  popButton.addEventListener("click", () => pip ? pip.close() : popOut());
  const textOf = () => wordsOf(state.tokens).map(w => w.map(c => DECODE[c] ?? "?").join("")).join(" ");
  async function popOut() {
    try { pip = await documentPictureInPicture.requestWindow({ width: 420, height: 170 }); }
    catch { pip = null; return; }
    const d = pip.document, css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    d.title = "dot-da.sh: heard";
    const look = `
      body { margin: 0; background: ${v("--bakelite")}; color: ${v("--paper")}; font: 13px ${css.fontFamily};
        display: grid; grid-template-rows: auto 1fr auto; height: 100vh; box-sizing: border-box; border: 1px solid ${v("--wire")}; overflow: hidden; }
      body.down { border-color: ${v("--brass")}; }
      .line { font-size: 22px; letter-spacing: 1px; padding: 10px 12px 2px; white-space: nowrap; overflow: hidden; direction: rtl; text-align: right; min-height: 1.3em; }
      .line span { direction: ltr; unicode-bidi: plaintext; }
      canvas { display: block; width: 100%; height: 100%; min-height: 0; }
      .bar { display: flex; align-items: center; gap: 10px; padding: 6px 12px 8px; }
      svg.sw { width: 24px; height: 26px; flex: none; overflow: visible; color: ${v("--paper")}; }
      .arm { transform-box: view-box; transform-origin: 16.02px 47.22px; transform: rotate(-30deg); }
      .down .arm { transform: none; } .led { fill: transparent; } .down .led { fill: ${v("--brass")}; }
      button { font: inherit; color: ${v("--graphite")}; background: none; border: 1px solid ${v("--wire")}; border-radius: 4px; padding: 1px 10px; cursor: pointer; }
      button[aria-pressed="true"] { color: ${v("--paper")}; border-color: ${v("--paper")}; }
      button:disabled { opacity: .4; cursor: default; }
      .read { margin-left: auto; color: ${v("--graphite")}; font-size: 12px; white-space: nowrap; }`;
    try {
      const sheet = new pip.CSSStyleSheet();
      sheet.replaceSync(look);
      d.adoptedStyleSheets = [sheet];
    } catch {
      const style = d.createElement("style");
      style.textContent = look;
      d.head.append(style);
    }
    d.body.innerHTML = `
      <div class="line"><span></span></div>
      <canvas></canvas>
      <div class="bar">
        <svg class="sw" viewBox="0 0 73 79" fill="none" aria-hidden="true">
          <circle cx="13.66" cy="52.81" r="7" stroke="currentColor" stroke-width="6"/>
          <rect class="arm" x="16.02" y="47.22" width="56" height="7" rx="3.5" fill="currentColor"/>
          <circle class="led" cx="13.66" cy="52.81" r="3.6"/>
        </svg>
        <button class="rec" type="button">● listen</button>
        <button class="pause" type="button">‖ pause</button>
        <span class="read"></span>
      </div>`;
    const q = s => d.querySelector(s);
    q(".rec").onclick = () => keys.rec.click();
    q(".pause").onclick = () => keys.pause.click();
    pip.addEventListener("pagehide", () => { pip = null; pipRaf = 0; popButton.textContent = "pop out"; });
    popButton.textContent = "pop back";
    pipRaf = pip.requestAnimationFrame(pipFrame);
  }
  function pipFrame() {
    if (!pip) return;
    const d = pip.document;
    /* the station's own frame may not be coming (a tab you've left):
       what it does, done here */
    follow();
    dirty = true;
    draw();
    const out = d.querySelector("canvas"), g = out.getContext("2d");
    const w = out.clientWidth, h = out.clientHeight, ratio = pip.devicePixelRatio || 1;
    if (out.width !== Math.round(w * ratio)) out.width = Math.round(w * ratio);
    if (out.height !== Math.round(h * ratio)) out.height = Math.round(h * ratio);
    g.clearRect(0, 0, out.width, out.height);
    if (canvas.width && canvas.height) g.drawImage(canvas, 0, 0, out.width, out.height);
    d.querySelector(".line span").textContent = textOf().slice(-60);
    const down = going() && !!columns.at(-1)?.down;
    d.body.classList.toggle("down", down);
    const rec = d.querySelector(".rec"), hold = d.querySelector(".pause");
    rec.setAttribute("aria-pressed", String(going()));
    rec.disabled = keys.rec.disabled;
    hold.setAttribute("aria-pressed", keys.pause.getAttribute("aria-pressed"));
    hold.disabled = keys.pause.disabled;
    d.querySelector(".read").textContent = read.textContent;
    pipRaf = pip.requestAnimationFrame(pipFrame);
  }

  sync();
  return {
    show(on) { if (!on) { stop(); pip?.close(); } dirty = true; },
    stop,
    get listening() { return going(); }
  };
}

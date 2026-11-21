/*
 * ============================================================
 * KEY DASH (/dash) — a runner; the letters come at it as obstacles
 * ============================================================
 *
 * The game from docs/games.md, first drawn for the Garmin app
 * (/design/watch/app/): a runner, and a text coming at it a mark at a
 * time. A dot is a hurdle, jumped with the dit key; a dash is a beam
 * at head height, as long as a dash, ducked under with the dah key
 * held. The obstacles carry the code and stay as they are, so a
 * letter is learned by its shape coming at you; and each press sounds
 * its mark, so the hand hears what it sends.
 *
 *                  R A I N                    the word, at the top
 *         ⌐R                                  its stroke letter, over
 *          ●      ▮   ▔▔▔▔▔ ● ▔▔▔▔▔   ▮       the runner while it passes
 *        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *               THE  AND  FOR                 the words done
 *
 * The marks are laid out as keyed, at the speed set (wpm, and farns.
 * stretching the gaps): a letter's gap between letters, a word's
 * between words, and inside a letter a little more room than the
 * code's one unit (ROOM, below), so a hand learning can lead or lag a
 * little and still clear. Just after every dash, where the hand lets
 * go of the dah, hangs a brass crumb at head height: taken standing
 * up, missed still ducked. Three in a row and it
 * all goes bronze, each mark worth two, until one's missed or a mark
 * is hit.
 *
 * A hit is a strike (Key hero's boxes, game/strikes.js), a letter
 * cleared clean heals a third, three whole ones and the run is over.
 * And a hit is a stumble: the run slows to 5 wpm in a moment, then
 * picks up again to where it was cruising, so a miskey costs time as
 * a trip would:
 *
 *   wpm  15 ──────╮            ╭────── 15
 *                 │         ╱
 *         5       ╰──── ╱               ¼ s down, 1.5 wpm a second up
 *                hit
 *
 * (Already at 5 or under, it drops to three fifths, never under 3.)
 *
 * After a hit, a moment's grace (the runner blinks): what it touches
 * then costs no strike, so one miss is one strike. A jump come down
 * too early lands on the hurdle like a step and drops off the far
 * side.
 *
 * With ramp, a word cleared clean is a wpm faster to cruise at.
 *
 *   ready ── a key ──▶ running ── three strikes ──▶ done
 *     ▲                  │  ▲                         │
 *     │      esc, p, ␣   ▼  │                         │
 *     │                  paused                       │
 *     └──────────────── a key (again) ────────────────┘
 *
 * The page is Key hero's (its settings, card, share menu, keys, and
 * a text of your own typed by tapping the word at the top: the game
 * furniture in js/game/), the run its own. (Named to sit beside Key
 * hero; "dot dash" would read as the site's own name.)
 */
import { DECODE, format } from "../core/morse.js";
import { timing } from "../core/keyer.js";
import { STROKES, createLetter } from "../core/strokes.js";
import { siteOrigin } from "../core/where.js";
import { timeline } from "../shared/playback.js";
import { createSound } from "../shared/sound.js";
import { $ } from "../shared/dom.js";
import { keep, kept, keptJSON, keptBox } from "../game/store.js";
import { createSpeed } from "../game/speed.js";
import { createLook } from "../game/look.js";
import { createPaddles, chord } from "../game/paddles.js";
import { createStrikes } from "../game/strikes.js";
import { createTexts } from "../game/texts.js";
import { createShare } from "../game/share.js";
import { createTyping } from "../game/typing.js";

const SONGS = ["SOS SOS SOS", "CQ CQ DE K", "PARIS PARIS", "TIME ITEM EMIT", "OMO MOM TOTO", "HELLO WORLD"];
/* what "random" draws from: short, common, and a few of the air's own */
const BAG = ["THE", "AND", "FOR", "YOU", "NOT", "ARE", "BUT", "ALL", "CAN", "ONE", "OUT", "DAY", "GET", "HOW", "NEW", "NOW", "OLD",
  "SEE", "TWO", "WAY", "TIME", "GOOD", "HERE", "NAME", "RAIN", "WIND", "SEND", "KEY", "CODE", "DOT", "DASH", "TONE", "WIRE", "SHIP",
  "MOON", "STAR", "EAST", "WEST", "RADIO", "SOS", "CQ", "TEST", "MORSE", "OK", "YES", "MOM", "TOO"];
const BEST_KEY = "dot-dash:dash-best";

/* the run, in the picture's units (a 420 × 200 view) */
const U = 40;                 // a unit of the code, along the ground
const GROUND = 170, RUNNER = 110, R = 15;
const HURDLE = { w: 14, h: 30 };
/* the beam's foot below the runner's head standing (30 up), above it
   ducked (15 up): it has to be ducked */
const BEAM = { y: GROUND - 40, h: 12 };
/* a brass crumb just after every dash, at head height: taken standing
   up, missed still ducked. It teaches when to let go of the dah: as
   the beam ends, not after */
const POINT = { y: GROUND - 24, r: 4 };
/* after a hit, a moment's grace while the run picks up again: what
   it touches then costs nothing (and scores nothing), so one miss is
   one strike */
const GRACE = 1500;
/* a step: a jump come down too early lands on the hurdle, rides its
   top, and drops off the far side in this long */
const DROP = 160;
const JUMP_H = 58;

/*
 * Room to learn in. The marks keep their lengths (a dash is three
 * dots long, a beam as long as a dash), but the gaps inside a letter
 * are two units, not one: room to land between two hurdles, and to
 * stand up between two beams, where a crumb hangs. From a dash to a
 * dot, half a unit more: the hand has to let go of the dah and wait a
 * beat before the dit, or the two run together into one long tone (a
 * bad habit on the air), and two crumbs there ask for both (below).
 * And the hits forgive a little either way, so a hand that leads or
 * lags still clears and goes on learning:
 *
 *   a beam      half a unit at each end doesn't count: ducked a
 *               little late, or up a little early, it's clear
 *               ░▓▓▓▓▓▓▓▓░
 *   a hurdle    only on the ground as it passes the runner's middle;
 *               a jump a little early or late still clears it
 *   a point     taken a little either side of the runner's middle
 */
const ROOM = { inner: 2, dashToDot: 2.5, beamEnds: 0.5 * 40, hurdle: 5, point: 9 };
const LETTER = 54;            // a stroke letter's size, riding over the run
const CARD_HOLD = 900;        // ms the card stays before a key sends it away
const NS = "http://www.w3.org/2000/svg";

const texts = createTexts({ list: $("#song"), texts: SONGS, bag: BAG, draw: 5, key: "dot-dash:dash-song", change: load });
const speed = createSpeed({ wpm: $("#opt-wpm"), fwpm: $("#opt-fwpm"), wpmKey: "dot-dash:dash-wpm", fwpmKey: "dot-dash:dash-fwpm", start: 5, change: load });
const look = createLook({ ctrl: $("#opt-ctrl"), mouse: $("#opt-mouse"), color: $("#opt-color"), theme: $("#opt-theme") });
const ramp = keptBox($("#opt-ramp"), "dot-dash:dash-ramp", { change: load });
const strikes = createStrikes({ element: $("#strikes") });

/* the station's tone, at the pitch set there */
const sound = createSound();
const pitch = Number(keptJSON("dot-dash:tx-settings")["opt-hz"]);
if (pitch) sound.setPitch(pitch);

const keys = { ".": $('.keybox [data-lane="."]'), "-": $('.keybox [data-lane="-"]') };
const svg = $("#run"), layer = svg.querySelector(".obstacles"), lettersLayer = svg.querySelector(".letters"), runner = svg.querySelector(".runner");

let state = "ready", frame = 0, last = 0, endedAt = 0;
/* wpm: the speed now; cruise: the speed to run at (the fader's, and
   ramp's); a stumble pulls wpm down and it climbs back to cruise */
let wpm = 5, cruise = 5, gaps = { letter: 3, word: 7 };     // the gaps in units (farns. stretches them)
let stumbleAt = -1, stumbleFrom = 5, graceUntil = 0, step = null, dropAt = -1;
const STUMBLE = { to: 5, ms: 250, back: 1.5 };      // down to 5 wpm in ¼ s; back 1.5 wpm a second
let x = 0, laidTo = 0, queue = [], words = [];
let obstacles = [], points = [], letters = [], laidWords = [];
let jumpAt = -1, air = 0, ducking = false;
let marks = 0, clean = 0, cleared = 0, row = 0, bronze = false, taken = 0, longest = 0;
let result = "";

const setState = next => { state = next; document.body.dataset.state = next; };
const unit = () => 1200 / wpm;                       // ms
const pxPerMs = () => U / unit();
/* the jump lasts about two units' worth, as a dit and its gap: quick
   at speed, never too quick to see */
const jumpMs = () => Math.min(520, Math.max(170, 1.7 * unit()));

/* a word's marks in units: each as long as it sounds, ROOM.inner
   between marks in a letter, the letter's gap between letters (the
   shape timeline() gives, with the room) */
function layout(codes) {
  const marks = [];
  let at = 0;
  codes.forEach((code, k) => {
    if (k) at += gaps.letter;
    [...code].forEach((m, i) => {
      if (i) at += code[i - 1] === "-" && m === "." ? ROOM.dashToDot : ROOM.inner;
      const len = m === "." ? 1 : 3;
      marks.push({ start: at, end: at + len, mark: m, letter: k, index: i });
      at += len;
    });
  });
  return { marks, duration: at };
}

/* the next word, laid out ahead from x0: each mark an obstacle where
   it would sound; a bronze point in each gap between two dashes; a
   stroke letter for each letter */
function lay(x0) {
  /* nothing to run (a text of your own, typed empty): nothing laid */
  if (!words.length) return x0 + 1000;
  if (!queue.length) queue = words.slice();
  const codes = queue.shift();
  const text = codes.map(c => DECODE[c] ?? "?").join("");
  const word = { text, codes, hits: 0, done: false };
  laidWords.push(word);
  const { marks: timed, duration } = layout(codes);
  timed.forEach((m, i) => {
    const dot = m.mark === ".";
    const o = { x: x0 + m.start * U, w: dot ? HURDLE.w : (m.end - m.start) * U, dot, word, letter: m.letter, index: m.index,
      last: m.index === codes[m.letter].length - 1, done: false, hit: false };
    o.el = document.createElementNS(NS, "rect");
    o.el.setAttribute("class", `ob ${dot ? "dot" : "dash"}`);
    o.el.setAttribute("width", o.w);
    o.el.setAttribute("height", dot ? HURDLE.h : BEAM.h);
    o.el.setAttribute("y", dot ? GROUND - HURDLE.h : BEAM.y);
    layer.append(o.el);
    obstacles.push(o);
    /* a crumb just after every dash, where the hand lets go of the dah:
       in the middle of the gap to the next mark of the letter, or a
       unit on after a letter's last dash. Before a dot, two: one as the
       hand lets go, one as it waits, still on the ground, before the
       jump (jumped early, it's jumped over)

          ▔▔▔▔▔  ●  ●   ▮        a dash, let go, wait, the dot */
    const next = timed[i + 1];
    if (!dot) {
      const inLetter = next && next.letter === m.letter;
      const afters = !inLetter ? [1] : next.mark === "." ? [0.6, 1.3] : [(next.start - m.end) / 2];
      for (const after of afters) {
        const p = { x: x0 + (m.end + after) * U, done: false };
        p.el = document.createElementNS(NS, "circle");
        p.el.setAttribute("class", "point");
        p.el.setAttribute("r", POINT.r);
        p.el.setAttribute("cy", POINT.y);
        layer.append(p.el);
        points.push(p);
      }
    }
  });
  /* each letter's stroke letter, inked as its marks are cleared */
  codes.forEach((code, k) => {
    const own = timed.filter(m => m.letter === k);
    const ch = text[k];
    const local = timeline([[code]], { unit: 1, letter: 3, word: 7 }).marks;
    const drawn = STROKES[ch] ? createLetter(STROKES[ch], local) : null;
    const el = drawn ? drawn.el : document.createElementNS(NS, "svg");
    if (!drawn) {
      el.setAttribute("viewBox", "0 0 100 100");
      el.innerHTML = `<text x="50" y="80" text-anchor="middle" font-size="90">${ch}</text>`;
    }
    for (const [name, value] of Object.entries({ y: 14, width: LETTER, height: LETTER })) el.setAttribute(name, value);
    el.classList.add("rider");
    lettersLayer.append(el);
    drawn?.at(0);
    letters.push({ word, k, el, drawn, local, from: x0 + own[0].start * U, to: x0 + own.at(-1).end * U, inked: 0 });
  });
  return x0 + (duration + gaps.word) * U;
}

function showWord() {
  /* the word coming at the top, what's cleared of it lit; the words
     done below the run */
  const w = $("#word");
  /* typing: the whole text as it's typed, a caret after it */
  if (typing?.on()) {
    w.word = null;
    w.replaceChildren(document.createTextNode(texts.typed()), Object.assign(document.createElement("span"), { className: "caret", textContent: "▮" }));
    return;
  }
  const next = obstacles.find(o => !o.done);
  if (!next) return;
  if (w.word !== next.word) {
    w.word = next.word;
    w.replaceChildren(...[...next.word.text].map(ch => Object.assign(document.createElement("span"), { textContent: ch })));
  }
  /* (not "now": that's Key hero's caret line, placed by the keys) */
  [...w.children].forEach((s, i) => { s.className = i < next.letter ? "cleared" : i === next.letter ? "here" : ""; });
}

function wordDone(word) {
  word.done = true;
  cleared++;
  const span = Object.assign(document.createElement("span"), { textContent: word.text, className: word.hits ? "hit" : "" });
  const done = $("#done");
  done.prepend(span);
  while (done.children.length > 6) done.lastChild.remove();
  /* ramp: a word cleared clean, and the next is a wpm faster */
  if (ramp() && !word.hits && cruise < 40) cruise++;
}

function setRow(n) {
  row = n;
  longest = Math.max(longest, row);
  [...$("#bronze").children].forEach((b, i) => b.classList.toggle("on", i < Math.min(row, 3)));
  $("#bronze").setAttribute("aria-label", `${row} brass crumbs in a row`);
  bronze = row >= 3;
  document.body.classList.toggle("bronzed", bronze);
}

/* each piece of the run where it is, for how far it's gone */
function place() {
  for (const o of obstacles) o.el.setAttribute("x", (o.x - x).toFixed(1));
  for (const p of points) p.el.setAttribute("cx", (p.x - x).toFixed(1));
  /* each stroke letter: in over its first mark, held over the runner
     while its marks pass under, then dragged off by its last one */
  for (const l of letters) {
    let left = Math.max(RUNNER - LETTER / 2, l.from - x);
    if (l.to - x < left + LETTER) left = l.to - x - LETTER;
    l.el.setAttribute("x", left.toFixed(1));
  }
}

/* how far a stumble drops it: to 5 wpm; already at 5 or under, to
   three fifths of it (never under 3), so it's always felt */
const low = from => (from > STUMBLE.to ? STUMBLE.to : Math.max(3, from * 0.6));

/* the speed now: down in a stumble, then back up to cruise */
function pace(now, dt) {
  if (stumbleAt >= 0 && now - stumbleAt < STUMBLE.ms) {
    const k = (now - stumbleAt) / STUMBLE.ms;
    wpm = stumbleFrom + (low(stumbleFrom) - stumbleFrom) * (1 - (1 - k) ** 2);   // eased: a trip, not a wall
  } else {
    if (stumbleAt >= 0) { stumbleAt = -1; runner.classList.remove("stumble"); }
    wpm = Math.min(cruise, wpm + STUMBLE.back * dt / 1000);
  }
  speed.show(Math.round(wpm) / speed.wpm());
}

function tick(now) {
  const dt = Math.min(50, now - last);
  last = now;
  pace(now, dt);
  x += pxPerMs() * dt;
  while (laidTo - x < 700) laidTo = lay(laidTo);

  /* the runner: up in an arc while jumping; on a step (a hurdle come
     down on too early), along its top, then dropping off the far
     side; squashed while ducking; blinking in its grace */
  const jump = jumpMs();
  const phase = jumpAt >= 0 ? (now - jumpAt) / jump : 1;
  const descending = phase > 0.5 && phase < 1;
  let lift = phase < 1 ? Math.sin(phase * Math.PI) * JUMP_H : 0;
  if (phase >= 1) jumpAt = -1;
  if (step) {
    if (step.x - x + step.w > RUNNER - R * 0.6) lift = Math.max(lift, HURDLE.h);
    else { step = null; dropAt = now; }
  }
  if (dropAt >= 0) {
    const k = (now - dropAt) / DROP;
    if (k >= 1) dropAt = -1;
    else lift = Math.max(lift, HURDLE.h * (1 - k * k));
  }
  air = lift;
  runner.setAttribute("transform", `translate(${RUNNER} ${GROUND - air}) scale(1 ${ducking && !step ? 0.5 : 1})`);
  runner.classList.toggle("grace", now < graceUntil);

  place();
  for (const o of obstacles) {
    const sx = o.x - x;
    /* over the runner: a hurdle wants it up, a beam wants it down */
    /* a beam forgives its ends; a hurdle counts only as it passes the
       runner's middle (ROOM) */
    const over = o.dot
      ? sx < RUNNER + ROOM.hurdle && sx + o.w > RUNNER - ROOM.hurdle
      : sx + ROOM.beamEnds < RUNNER + R - 3 && sx + o.w - ROOM.beamEnds > RUNNER - R + 3;
    if (!o.done && !o.hit && !o.excused && over) {
      const clear = o.dot ? air > HURDLE.h * 0.5 : ducking;
      if (!clear && now < graceUntil) {
        /* in the grace after a hit: no strike, no score */
        o.excused = true;
        o.el.classList.add("excused");
      } else if (!clear) {
        o.hit = true;
        o.word.hits++;
        o.el.classList.add("hit");
        /* come down too early on a hurdle: it's a step, ridden and
           dropped off */
        if (o.dot && descending) { step = o; jumpAt = -1; }
        /* the stumble, and the grace that follows (the runner blinks:
           that's the strike, seen) */
        stumbleAt = now; stumbleFrom = wpm;
        runner.classList.add("stumble");
        graceUntil = now + GRACE;
        /* and a miskey ends the bronze, as a missed crumb does */
        setRow(0);
        if (strikes.add(3)) return end();
      }
    }
    if (!o.done && sx + o.w < RUNNER - R) {
      o.done = true;
      if (!o.hit && !o.excused) marks += bronze ? 2 : 1;
      /* ink the letter's stroke to the end of this mark */
      const l = letters.find(l => l.word === o.word && l.k === o.letter);
      if (l?.drawn && !o.hit && !o.excused) l.drawn.at(l.local[o.index].end);
      if (o.last) {
        const hit = obstacles.some(p => p.word === o.word && p.letter === o.letter && p.hit);
        if (!hit) { clean++; strikes.heal(1); }
        if (o.letter === o.word.codes.length - 1) wordDone(o.word);
      }
    }
  }

  /* the brass crumbs: taken standing as the runner passes, missed
     still ducked */
  for (const p of points) {
    const sx = p.x - x;
    if (p.done) continue;
    if (Math.abs(sx - RUNNER) < ROOM.point && !ducking && air < 14) {
      p.done = true;
      p.el.classList.add("taken");
      taken++;
      setRow(row + 1);
    } else if (sx < RUNNER - R - 2) {
      p.done = true;
      p.el.classList.add("missed");
      setRow(0);
    }
  }

  /* what's gone off the left goes */
  const gone = (o, far) => { if (far < -200) { o.el.remove(); return false; } return true; };
  obstacles = obstacles.filter(o => gone(o, o.x - x));
  points = points.filter(p => gone(p, p.x - x));
  letters = letters.filter(l => gone(l, l.to - x));
  showWord();
  $("#score").textContent = marks;
  frame = requestAnimationFrame(tick);
}

function load() {
  cancelAnimationFrame(frame);
  layer.replaceChildren();
  lettersLayer.replaceChildren();
  obstacles = []; points = []; letters = []; laidWords = [];
  /* the text, drawn once for the run (random's draw too): what a link
     shares; when it runs out it comes round again */
  words = texts.words();
  queue = words.slice();
  wpm = cruise = speed.wpm();
  stumbleAt = -1; graceUntil = 0; step = null; dropAt = -1;
  runner.classList.remove("grace");
  runner.classList.remove("stumble");
  speed.show(1);
  const t = timing(speed.wpm(), speed.fwpm());
  gaps = { letter: t.letter / t.unit, word: t.word / t.unit };
  x = 0; laidTo = 460; jumpAt = -1; air = 0; ducking = false;
  marks = 0; clean = 0; cleared = 0; taken = 0; longest = 0;
  setRow(0);
  strikes.reset();
  while (laidTo < 1300) laidTo = lay(laidTo);
  place();
  runner.setAttribute("transform", `translate(${RUNNER} ${GROUND})`);
  $("#card").hidden = true;
  $("#word").word = null;
  $("#done").replaceChildren();
  showWord();
  $("#score").textContent = "0";
  setState("ready");
  $("#restart").disabled = true;
  $("#pause").disabled = true;
  $("#pause").textContent = "pause";
}

function run() {
  setState("running");
  $("#restart").disabled = false;
  $("#pause").disabled = false;
  $("#pause").textContent = "pause";
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

function pause() {
  if (state !== "running") return;
  cancelAnimationFrame(frame);
  ducking = false;
  sound.key(false);
  setState("paused");
  $("#pause").textContent = "go on";
}

function end() {
  cancelAnimationFrame(frame);
  setState("done");
  endedAt = performance.now();
  const best = Number(kept(BEST_KEY)) || 0;
  if (marks > best) keep(BEST_KEY, String(marks));
  $("#c-marks").textContent = `${marks} marks`;
  $("#c-best").textContent = marks > best ? "your best" : best ? `best ${best}` : "";
  $("#c-letters").textContent = clean;
  $("#c-words").textContent = cleared;
  $("#c-bronze").textContent = taken;
  $("#c-streak").textContent = longest;
  $("#c-speed").textContent = `${cruise} wpm`;
  result = `Key dash: ${marks} marks, ${cleared} words, ${longest} bronze in a row, at ${cruise} wpm`;
  $("#card").hidden = false;
  $("#pause").disabled = true;
}

/* a key: sounds as the hand sends it (the dit a dit long; the dah as
   long as it's held, as a straight key's tone is); in a run, the dit
   jumps and the dah held ducks; otherwise any key starts one (or goes
   on, or runs again) */
function press(lane) {
  if (typing.on()) return;
  keys[lane].classList.add("down");
  if (lane === ".") sound.mark(0, unit() / 1000);
  else sound.key(true);
  if (state === "done") { if (performance.now() - endedAt > CARD_HOLD) { load(); run(); } return; }
  if (state !== "running") run();
  if (lane === ".") { if (jumpAt < 0) jumpAt = performance.now(); }
  else ducking = true;
}
function release(lane) {
  keys[lane].classList.remove("down");
  if (lane === "-") { ducking = false; sound.key(false); }
}

/* share, as Key hero's: the text as a link that opens here (random's
   draw too), and the run just played */
const linkHere = () => (words.length ? `${siteOrigin()}/dash/?/${format(words)}` : "");
const share = createShare({
  toggle: $("#share-toggle"),
  menu: $("#share"),
  copy: { link: linkHere, result: () => (result ? `${result} ${linkHere()}` : "") },
  native: () => ({ title: "Key dash", text: result || "Run this, in Morse:", url: linkHere() }),
  opened() {
    pause();
    $("#share-station").href = `/?/${format(words)}`;
  },
});

/* a text of your own, as Key hero's: the word at the top tapped, the
   station's keyboard in the keys' place; what's typed is the run's
   text, from the top */
const typing = createTyping({
  field: $("#word"),
  board: $("#kbd"),
  text: texts.typed,
  change: text => { texts.type(text); load(); },
  before: pause,
  /* nothing typed: back to the text that was chosen before */
  toggle: on => { if (!on) texts.settle(); load(); },
});

const PAUSE_KEYS = new Set(["Escape", "KeyP", "Space"]);
createPaddles({
  pads: keys,
  ctrl: look.ctrl,
  mouse: look.mouse,
  press,
  release,
  keydown(event) {
    if (share.isOpen()) {
      if (event.code === "Escape") share.open(false);
      return true;
    }
    if (typing.on()) { typing.key(event); return true; }
    if (event.target.closest?.("select, input")) return true;
    if (event.code === "KeyR" && !chord(event) && state !== "ready") {
      event.preventDefault();
      if (!event.repeat) load();
      return true;
    }
    if (!PAUSE_KEYS.has(event.code) || chord(event) || (state !== "running" && state !== "paused")) return false;
    event.preventDefault();
    if (!event.repeat) state === "running" ? pause() : run();
    return true;
  },
  off: typing.on,
  clickable: ".settings, .result, .hero-top, .share-menu, .word, .kbd",
});

/* the gear: the settings, open or shut, and kept that way */
const setTray = open => {
  $("#tray").hidden = !open;
  $("#gear").setAttribute("aria-expanded", String(open));
};
setTray(kept("dot-dash:dash-tray") === "1");
$("#gear").addEventListener("click", () => {
  const open = $("#tray").hidden;
  setTray(open);
  keep("dot-dash:dash-tray", open ? "1" : "0");
  $("#gear").blur();
});
$("#pause").addEventListener("click", () => { $("#pause").blur(); state === "running" ? pause() : run(); });
$("#restart").addEventListener("click", () => { $("#restart").blur(); load(); });
$("#again").addEventListener("click", () => { load(); run(); });
$("#card-close").addEventListener("click", load);
/* looking away: the run waits */
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);

load();

/*
 * ============================================================
 * KEY HERO (/hero) — notes come down a road; key them at the line
 * ============================================================
 *
 * Two keys, both timed by hand: the left is the dit, the right the
 * dah, each held as long as its note is long. The only sound is
 * yours. (The design, and why these keys and no others: docs/hero.md.)
 *
 *   ready ── a key ──▶ running ── the last note ──▶ done
 *     ▲                  │  ▲       or three strikes  │
 *     │      esc, p, ␣   ▼  │                         │
 *     │                  paused                       │
 *     └────────────────── a key (again) ──────────────┘
 *
 * This file is the game's own rules (what a press costs, what ramp
 * does, what the card says) and the wiring. What another game would
 * want as it is lives in js/game/:
 *
 *   store     what's kept between visits     texts    the text picker
 *   clock     the song's time                typing   a text of your own
 *   speed     the two faders                 strikes  three, in thirds
 *   look      the station's four boxes       chart    a message in time
 *   paddles   two keys, however pressed      share    the share menu
 *
 * and beside it: judge.js grades a press, road.js and message.js are
 * this game's two views.
 */
import { timing } from "../core/keyer.js";
import { createSound } from "../shared/sound.js";
import { createJudge } from "../core/judge.js";
import { $ } from "../shared/dom.js";
import { keep, kept, keptJSON, keptBox } from "../game/store.js";
import { createClock } from "../game/clock.js";
import { createSpeed } from "../game/speed.js";
import { createLook } from "../game/look.js";
import { createPaddles, chord } from "../game/paddles.js";
import { createStrikes } from "../game/strikes.js";
import { createTexts } from "../game/texts.js";
import { createTyping } from "../game/typing.js";
import { createShare } from "../game/share.js";
import { createWin } from "../game/win.js";
import { applyLinked, withSettings } from "../game/link.js";
import { format } from "../core/morse.js";
import { siteOrigin } from "../core/where.js";
import { chart } from "../game/chart.js";
import { createRoad, MARGIN } from "./road.js";
import { createMessage } from "./message.js";

const SONGS = ["ET TE TEE TET", "TIME ITEM EMIT MEET", "KM MK KMK MKM", "SOS SOS SOS", "CQ CQ DE K", "PARIS PARIS", "HELLO WORLD"];
/* what "random" draws from: short, common, and a few of the air's own */
const BAG = ["THE", "AND", "FOR", "YOU", "NOT", "ARE", "BUT", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HAS", "HIM",
  "HOW", "MAN", "NEW", "NOW", "OLD", "SEE", "TWO", "WAY", "WHO", "TIME", "GOOD", "HERE", "NAME", "RAIN", "WIND", "SEND", "KEY", "CODE",
  "DOT", "DASH", "TONE", "WIRE", "SHIP", "MOON", "STAR", "NORTH", "EAST", "WEST", "SOUTH", "RADIO", "CQ", "DE", "ES", "TNX", "FB", "73"];
const BEST_KEY = "dot-dash:hero-best";
/* the count-in is seen, not heard: the first note starts part way
   down the road, and never less than a couple of seconds off */
const LEAD = 16, LEAD_MIN = 2000;
/* the card stays a moment before a key can send it away: a hand
   still keying the last letter shouldn't dismiss what it hasn't read */
const CARD_HOLD = 900;
/* going on after a pause, the road backs up this much (of the page's
   time) and runs up to where it stood: the hand finds the beat again
   before a note is due. What comes by again has been keyed, or
   missed, and a key down on it is nothing */
const RUN_UP = 1500;

/*
 * Strikes, in thirds: three whole ones end the run. What costs what:
 *
 *   a key down between two letters   ⅓     (the road there is empty:
 *   a key down between two words     1      road.js draws its edges)
 *   both keys down at once           ⅓     (two hand-timed keys: never right)
 *   a key down on the heels of the   ⅓     (no gap between two marks:
 *   last one coming up                      they'd run together)
 *
 * And every ten notes keyed in a row takes a whole strike back
 * (never under none).
 */
const THIRDS = { letterGap: 1, wordGap: 3, both: 1, noGap: 1 };
const HEAL_EVERY = 10, HEAL = 3;
const GAP_MIN = 0.2;      // units: nearer than this to the last key-up is no gap at all
const WPM_MAX = 40;       // as far as ramp goes

/* ---------- the parts ---------- */

const texts = createTexts({ list: $("#song"), texts: SONGS, bag: BAG, draw: 5, key: "dot-dash:hero-song", change: load });
const speed = createSpeed({ wpm: $("#opt-wpm"), fwpm: $("#opt-fwpm"), wpmKey: "dot-dash:hero-wpm", fwpmKey: "dot-dash:hero-fwpm", change: load });
const look = createLook({ ctrl: $("#opt-ctrl"), mouse: $("#opt-mouse"), color: $("#opt-color"), theme: $("#opt-theme") });
/* and a box of the game's own. ramp: a word keyed with no letter
   missed, and the next is a wpm faster (the whole song's clock runs
   faster, so farns. keeps its share), up to 40 */
const ramp = keptBox($("#opt-ramp"), "dot-dash:hero-ramp", { change: load });
/* a link's settings (the speed, ramp) for this visit, over what's kept */
applyLinked({ wpm: $("#opt-wpm"), fwpm: $("#opt-fwpm"), ramp: $("#opt-ramp"), show: () => speed.show() });

/* the station's tone, at the pitch set there */
const sound = createSound();
const pitch = Number(keptJSON("dot-dash:tx-settings")["opt-hz"]);
if (pitch) sound.setPitch(pitch);

const clock = createClock();
const strikes = createStrikes({ element: $("#strikes") });
const road = createRoad({ element: $(".road") });
const message = createMessage({ feed: $(".incoming"), keyed: $("#keyed"), word: $("#word") });
const keys = { ".": $('.keybox [data-lane="."]'), "-": $('.keybox [data-lane="-"]') };
const down = { ".": false, "-": false };
const holding = { ".": null, "-": null };   // the note each key is on, if it's on one

/* a text of your own: a tap on the incoming message, and the
   station's keyboard is in the keys' place (js/game/typing.js) */
const typing = createTyping({
  field: $(".incoming"),
  board: $("#kbd"),
  text: texts.typed,
  change: text => { texts.type(text); load(); },
  before: pause,
  /* nothing typed: back to the song that was chosen before */
  toggle: on => { if (!on) texts.settle(); load(); },
});

/*
 * share, where the station's is: the text as a link that opens here
 * (a challenge: the same words, random's draw too), the run just
 * keyed in a line, and the text in the station.
 */
/* the text and the settings it's played at, so a run shared is the same run */
const linkHere = () => withSettings(words.length ? `${siteOrigin()}/hero/?/${format(words)}` : "", { wpm: speed.wpm(), fwpm: speed.fwpm(), ramp: ramp() });
const share = createShare({
  toggle: $("#share-toggle"),
  menu: $("#share"),
  copy: { link: linkHere, result: () => (result ? `${result} ${linkHere()}` : "") },
  native: () => ({ title: "Key hero", text: result || "Key this, in Morse:", url: linkHere() }),
  opened() {
    pause();
    $("#share-station").href = `/?/${format(words)}`;
  },
});

let state = "ready";
let t, song, judge;
let words = [];           // the text being played (random: this draw of it)
let result = "";          // the run just keyed, in a line: there while its card is
let heldAt = 0;           // the song's clock at the last pause: before it, on the run-up, a key is nothing
let doneAt = 0;           // the page's clock when the card came up
let lastUp = -Infinity;   // the song's clock when a key last came up

function load() {
  t = timing(speed.wpm(), speed.fwpm());
  words = texts.words();
  result = "";
  heldAt = 0;
  song = chart(words, t, { lead: Math.max(LEAD * t.unit, LEAD_MIN) });
  judge = createJudge(song.notes, { unit: t.unit });
  road.load(song, t, judge.windows);
  message.load(song.letters, t.unit);
  clock.reset();
  speed.show();
  strikes.reset();
  lastUp = -Infinity;
  setState("ready");
  streak();
}

/* a song finished, no three strikes: V for victory, on the card's border and the tab */
const win = createWin({ frame: $("#card") });

function setState(next) {
  if (next !== "done") win.rest();
  state = next;
  document.body.dataset.state = next;
  $("#pause").textContent = next === "paused" ? "go on" : "pause";
  $("#pause").disabled = next === "ready" || next === "done";
  $("#restart").disabled = next === "ready";
  $("#card").hidden = next !== "done";
  $("#note").textContent = typing.on() ? "type your text" : { ready: "press either key to start", paused: "paused" }[next] ?? "";
}

/*
 * A note has its grade. Its letter is done when its last mark is,
 * and takes the worst of them: missed if any was, perfect if every
 * one landed (the timing, not just the keys), else correct. The
 * message shows it once the letter's dotted line has gone by.
 */
function graded(note) {
  road.grade(note);
  streak();
  const run = judge.tally().streak;
  if (run && run % HEAL_EVERY === 0 && strikes.any()) strikes.heal(HEAL);
  const letter = note.letter;
  if (letter.notes.some(n => !n.grade)) return;
  letter.grade = letter.notes.some(n => n.grade === "missed") ? "missed"
    : letter.notes.every(n => n.grade === "landed") ? "perfect" : "correct";
  /* ramp: its word done, and no letter of it missed */
  if (!ramp() || !letter.last || state !== "running") return;
  const word = song.letters.filter(l => l.word === letter.word);
  if (word.every(l => l.grade && l.grade !== "missed")) {
    const wpm = speed.wpm();
    clock.setRate(Math.min(WPM_MAX, Math.round(wpm * clock.rate) + 1) / wpm);
    speed.show(clock.rate);
  }
}

/* three, and it's over, with no key left down */
function strike(n) {
  if (!strikes.add(n) || state !== "running") return;
  for (const lane of [".", "-"]) release(lane, performance.now());
  finish();
}

/* a press that took no note: was it in the empty road between two
   letters, past the one's closing line and short of the other's
   opening one? (The lines stand a little off the marks, road.js: a
   key that's only early or late for its note isn't in the space.) */
function inSpace(at) {
  const off = Math.max(judge.windows.reach, MARGIN * t.unit);
  const next = song.letters.findIndex(l => l.t0 > at);
  if (next < 1) return 0;
  const before = song.letters[next - 1], after = song.letters[next];
  if (at < before.end + off || at > after.t0 - off) return 0;
  return after.space ? THIRDS.wordGap : THIRDS.letterGap;
}

/* the run of notes keyed, one after another: grey while there's none */
function streak() {
  const n = judge.tally().streak;
  $("#streak").textContent = "×" + n;
  $("#streak").classList.toggle("none", n === 0);
}

/*
 * A key still down as its letter's dotted line goes by. The letter
 * can't wait on it (the next one is due), so the press is cut at the
 * line: what was held so far is this letter's, and the rest goes on
 * as a press of its own, toward the next letter.
 *
 *   S ▓ ▓ ▓▓▓▓▓▓┊▓▓▓▓      the third dit, held on and on
 *               ┊└ from here it's the next letter's (a stray, or
 *                  its first mark if that's near enough): a key down
 *                  in the space, and a strike as any other
 */
function carry(lane, at) {
  road.up(lane, at);
  const note = judge.up(lane, at);
  if (note) graded(note);
  holding[lane] = judge.down(lane, at);
  road.down(lane, at, holding[lane]);
  if (!holding[lane]) strike(inSpace(at) || THIRDS.letterGap);
}

/* ---------- the run ---------- */

function start(stamp) {
  setTray(false);
  if (state === "paused") { heldAt = clock.now(); clock.rewind(RUN_UP); }
  clock.start(stamp);
  setState("running");
  requestAnimationFrame(frame);
}

function pause() {
  if (state !== "running") return;
  for (const lane of [".", "-"]) release(lane, performance.now());
  clock.stop();
  setState("paused");
}

function frame(stamp) {
  if (state !== "running") return;
  const at = clock.now(stamp);
  for (const lane of [".", "-"]) {
    const until = holding[lane]?.letter.until;
    if (until <= at) carry(lane, until);
  }
  if (state !== "running") return;            // that was the third strike
  for (const note of judge.sweep(at)) graded(note);
  road.draw(at);
  message.draw(at);
  if (at > song.end + 4 * t.unit && !down["."] && !down["-"]) return finish();
  requestAnimationFrame(frame);
}

/*
 * The card: what landed, and the hand behind it. The dah to dit ratio
 * is the one a fist is known by (3 to 1 by the book), from the notes
 * that were keyed, however they were graded.
 */
function finish() {
  clock.stop();
  const out = strikes.out();
  const { landed, close, missed, stray, best } = judge.tally();
  const total = song.notes.length;
  const percent = Math.round(100 * (landed + close) / total);
  const mean = lane => {
    const lengths = song.notes.filter(n => n.lane === lane && n.err).map(n => n.t1 - n.t0 + n.err.length);
    return lengths.length ? lengths.reduce((a, b) => a + b) / lengths.length : null;
  };
  const dit = mean("."), dah = mean("-");
  const starts = song.notes.filter(n => n.err).map(n => n.err.start);
  const lag = starts.length ? Math.round(starts.reduce((a, b) => a + b) / starts.length) : null;

  const wpm = speed.wpm(), fwpm = speed.fwpm();
  const id = `${texts.name()} @${wpm}${fwpm < wpm ? "/" + fwpm : ""}${ramp() ? " ramp" : ""}`;
  const bests = keptJSON(BEST_KEY);
  const before = bests[id] ?? null;
  /* a run that struck out isn't a best: the song wasn't finished */
  if (!out && (before === null || percent > before)) { bests[id] = percent; keep(BEST_KEY, JSON.stringify(bests)); }

  $("#c-percent").textContent = percent + "%";
  $("#c-best").textContent = out ? "three strikes" : before === null ? "first run" : percent > before ? `best yet (was ${before}%)` : `best ${before}%`;
  $("#c-strikes").textContent = `${strikes.said()} of 3`;
  $("#c-speed").textContent = `${Math.round(wpm * clock.rate)} wpm`;
  $("#c-landed").textContent = landed;
  $("#c-close").textContent = close;
  $("#c-missed").textContent = missed;
  $("#c-stray").textContent = stray;
  $("#c-streak").textContent = best;
  /* the ghost over the card: the longest run, or, struck out, the
     three strikes that ended it (the boxes, full) */
  $("#c-ghost").textContent = out ? "" : "×" + best;
  $("#c-ghost").classList.toggle("struck", out);
  if (out) $("#c-ghost").append(...[0, 1, 2].map(() => document.createElement("i")));
  $("#c-ratio").textContent = dit && dah ? `${(dah / dit).toFixed(1)} : 1` : "–";
  $("#c-lag").textContent = lag === null ? "–" : lag === 0 ? "on the line" : `${Math.abs(lag)} ms ${lag > 0 ? "late" : "early"}`;
  result = `Key hero: ${texts.name() === "random" ? "random words" : texts.name()} at ${Math.round(wpm * clock.rate)} wpm, ${percent}%, longest run ×${best}${out ? " (three strikes)" : ""}.`;
  doneAt = performance.now();
  setState("done");
  if (!out) win.key();
  $("#again").focus({ preventScroll: true });
}

/* ---------- the keys ---------- */

function press(lane, stamp) {
  if (down[lane] || typing.on()) return;
  if (state === "done") {                 // either key: again
    if (performance.now() - doneAt > CARD_HOLD) load();
    return;
  }
  if (state === "ready" || state === "paused") { sound.unlock(); return start(stamp); }   // the press that starts isn't a note
  if (clock.now(stamp) < heldAt) return;  // the run-up after a pause: not a note either
  down[lane] = true;
  keys[lane].classList.add("down");
  sound.key(true);
  road.lit(true);
  const at = clock.now(stamp);
  holding[lane] = judge.down(lane, at);
  road.down(lane, at, holding[lane]);
  /* what it costs, the dearest of what applies */
  strike(Math.max(
    down[lane === "." ? "-" : "."] ? THIRDS.both : 0,
    at - lastUp < GAP_MIN * t.unit ? THIRDS.noGap : 0,
    holding[lane] ? 0 : inSpace(at)
  ));
}

function release(lane, stamp) {
  if (!down[lane]) return;
  down[lane] = false;
  keys[lane].classList.remove("down");
  if (!down["."] && !down["-"]) { sound.key(false); road.lit(false); }
  const at = clock.now(stamp);
  lastUp = at;
  holding[lane] = null;
  road.up(lane, at);
  const note = judge.up(lane, at);
  if (note) graded(note);
}

/* Esc, P or the space bar: pause, and go on */
const PAUSE_KEYS = new Set(["Escape", "KeyP", "Space"]);

createPaddles({
  pads: keys,
  ctrl: look.ctrl,
  mouse: look.mouse,
  press,
  release,
  /* the page's own keys, before the paddles': typing, and pause */
  keydown(event) {
    if (share.isOpen()) {                 // Esc puts it away; no key keys under it
      if (event.code === "Escape") share.open(false);
      return true;
    }
    if (typing.on()) { typing.key(event); return true; }
    if (event.target.closest?.("select")) return true;
    /* R: from the top, with no wait for three strikes */
    if (event.code === "KeyR" && !chord(event) && state !== "ready") {
      event.preventDefault();
      if (!event.repeat) load();
      return true;
    }
    if (!PAUSE_KEYS.has(event.code) || chord(event) || (state !== "running" && state !== "paused")) return false;
    event.preventDefault();
    if (!event.repeat) state === "running" ? pause() : start(event.timeStamp);
    return true;
  },
  off: typing.on,
  clickable: ".settings, .result, .hero-top, .share-menu, .key, .incoming, .kbd",
});

/* looking away: the song waits, and no key is left down */
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);
addEventListener("resize", () => { road.measure(); road.draw(clock.now()); });
/* the type comes in after the first drawing, and the lines are cut to its width */
document.fonts?.ready.then(() => { if (state === "ready") load(); });

/* ---------- the controls ---------- */

/*
 * The gear, as the station's: the settings in the keys' place, shut to
 * start (the keys are what you came for). A tap anywhere else shuts
 * them, as the station's popups go; so does a song starting.
 *
 *    ⚙ > word                    ⚙ > word
 *   ┌────────┬────────┐   →    ┌ text ▾  [x] color   ┃ ┃ ┐
 *   │   ●    │   ▬    │        │ [ ] ctrl [ ] ramp   speed │
 */
const setTray = open => {
  $("#tray").hidden = !open;
  $("#gear").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("tray-open", open);
};
setTray(false);
$("#gear").addEventListener("click", () => {
  setTray($("#tray").hidden);
  $("#gear").blur();
});
document.addEventListener("pointerdown", event => {
  if (!$("#tray").hidden && !event.target.closest("#tray, #gear")) setTray(false);
});

$("#pause").addEventListener("click", event => {
  $("#pause").blur();        // or the space bar would press it, as well as pause
  return state === "running" ? pause() : start(event.timeStamp);
});
$("#restart").addEventListener("click", () => { $("#restart").blur(); load(); });
$("#again").addEventListener("click", load);
$("#card-close").addEventListener("click", load);

load();

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
 * Time is the page's own clock (performance.now), and a press is
 * judged by its event's time stamp, not by the frame it's drawn in.
 *
 * A message in the address is the song (/hero/?/_..._---_..._, the
 * station's own links); else one from the short list.
 */
import { readLink, encode, DECODE } from "../morse.js";
import { timing } from "../tx-keyer.js";
import { createSound } from "../tx-sound.js";
import { createJudge } from "../judge.js";
import { DIT_KEYS, DAH_KEYS } from "../keymap.js";
import { $ } from "../tx/dom.js";
import { chart } from "./chart.js";
import { createRoad, MARGIN } from "./road.js";
import { createMessage } from "./message.js";

const SONGS = ["ET TE TEE TET", "TIME ITEM EMIT MEET", "KM MK KMK MKM", "SOS SOS SOS", "CQ CQ DE K", "PARIS PARIS", "HELLO WORLD"];
const WPM_KEY = "dot-dash:hero-wpm", FWPM_KEY = "dot-dash:hero-fwpm", SONG_KEY = "dot-dash:hero-song", BEST_KEY = "dot-dash:hero-best";
/* the count-in is seen, not heard: the first note starts part way
   down the road, and never less than a couple of seconds off */
const LEAD = 16, LEAD_MIN = 2000;
/* the card stays a moment before a key can send it away: a hand
   still keying the last letter shouldn't dismiss what it hasn't read */
const CARD_HOLD = 900;

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
const OUT = 9, HEAL_EVERY = 10, HEAL = 3;
const GAP_MIN = 0.2;      // units: nearer than this to the last key-up is no gap at all
const WPM_MAX = 40;       // as far as ramp goes

const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };
const kept = key => { try { return localStorage.getItem(key); } catch { return null; } };
const keptJSON = key => { try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; } };

/* ---------- the song ---------- */

/* "auto": the text that came in the address (/hero/?/hello+world or
   /hero/?/_...._.._), or the one typed here (below: your own text) */
let own = location.search.startsWith("?/") ? readLink(location.search.slice(2)) : [];
const songList = $("#song");
songList.add(new Option("auto", "link"));
for (const [i, text] of SONGS.entries()) songList.add(new Option(text.toLowerCase(), i));
songList.value = own.length ? "link" : SONGS[kept(SONG_KEY)] ? kept(SONG_KEY) : 0;
const wordsNow = () => (songList.value === "link" ? own : encode(SONGS[songList.value]));
const songName = () => (songList.value === "link" ? own.map(w => w.map(c => DECODE[c] ?? "?").join("")).join(" ") : SONGS[songList.value]);

/*
 * ---------- the speed ----------
 *
 * Two faders, as the station's: wpm is how fast a letter's marks go,
 * farns. (Farnsworth) the speed overall, the spaces between letters
 * stretched to make it. It follows wpm while the two are equal, stays
 * where it's put once lower, and is never the faster.
 */
const wpmFader = $("#opt-wpm"), fwpmFader = $("#opt-fwpm");
const within = (input, value) => Math.min(Number(input.max), Math.max(Number(input.min), value));
wpmFader.value = within(wpmFader, Number(kept(WPM_KEY)) || 10);
fwpmFader.value = Math.min(wpmFader.value, within(fwpmFader, Number(kept(FWPM_KEY)) || Number(wpmFader.value)));
let wpmWas = Number(wpmFader.value);

function markFaders() {
  for (const input of [wpmFader, fwpmFader]) {
    input.style.setProperty("--p", String((input.value - input.min) / (input.max - input.min)));
    input.closest(".fader").querySelector("output").value = input.value;
  }
  /* the farnsworth track above wpm: out of reach (the cap) */
  fwpmFader.closest(".track").style.setProperty("--f", String((fwpmFader.max - wpmFader.value) / (fwpmFader.max - fwpmFader.min)));
}

wpmFader.addEventListener("input", () => {
  const wpm = Number(wpmFader.value);
  if (Number(fwpmFader.value) === wpmWas || Number(fwpmFader.value) > wpm) fwpmFader.value = wpm;
  wpmWas = wpm;
  markFaders();
});
fwpmFader.addEventListener("input", () => {
  if (Number(fwpmFader.value) > Number(wpmFader.value)) fwpmFader.value = wpmFader.value;
  markFaders();
});
for (const input of [wpmFader, fwpmFader]) {
  input.addEventListener("change", () => {
    keep(WPM_KEY, wpmFader.value);
    keep(FWPM_KEY, fwpmFader.value);
    input.blur();           // or the arrow keys and the keying keys would be the slider's
    load();
  });
}

/*
 * ---------- how it looks ----------
 *
 * Four boxes, the station's own and kept with them. ctrl: the Ctrl
 * keys as paddles (a VBand adapter). mouse: its buttons as the keys,
 * left dit and right dah. color: dots red, dashes blue, on what's
 * been keyed, the keys and the far end (on unless it's been turned
 * off). invert: the light theme, the same instrument printed on paper.
 */
const colorBox = $("#opt-color"), themeBox = $("#opt-theme"), ctrlBox = $("#opt-ctrl"), mouseBox = $("#opt-mouse");
/* and one of the game's own. ramp: a word keyed with no letter
   missed, and the next is a wpm faster (the whole song's clock runs
   faster, so farns. keeps its share), up to 40 */
const rampBox = $("#opt-ramp");
rampBox.checked = kept("dot-dash:hero-ramp") === "1";
rampBox.addEventListener("change", () => { keep("dot-dash:hero-ramp", rampBox.checked ? "1" : "0"); rampBox.blur(); load(); });
ctrlBox.checked = kept("dot-dash:tx-ctrl-keys") === "1";
mouseBox.checked = kept("dot-dash:tx-mouse-key") === "1";
ctrlBox.addEventListener("change", () => { keep("dot-dash:tx-ctrl-keys", ctrlBox.checked ? "1" : "0"); ctrlBox.blur(); });
mouseBox.addEventListener("change", () => { keep("dot-dash:tx-mouse-key", mouseBox.checked ? "1" : "0"); mouseBox.blur(); });
colorBox.checked = kept("dot-dash:signal") !== "0";
themeBox.checked = document.documentElement.classList.contains("light");
function look() {
  document.body.classList.toggle("signal", colorBox.checked);
  document.documentElement.classList.toggle("light", themeBox.checked);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeBox.checked ? "#ebe5d7" : "#1c1916");
}
look();
colorBox.addEventListener("change", () => { look(); keep("dot-dash:signal", colorBox.checked ? "1" : "0"); colorBox.blur(); });
themeBox.addEventListener("change", () => { look(); keep("dot-dash:theme", themeBox.checked ? "light" : "dark"); themeBox.blur(); });

/* ---------- the parts ---------- */

/* the station's tone, at the pitch set there */
const sound = createSound();
const pitch = Number(keptJSON("dot-dash:tx-settings")["opt-hz"]);
if (pitch) sound.setPitch(pitch);

const road = createRoad({ element: $(".road") });
const message = createMessage({ feed: $(".incoming"), keyed: $("#keyed"), word: $("#word") });
const keys = { ".": $('.keybox [data-lane="."]'), "-": $('.keybox [data-lane="-"]') };
const down = { ".": false, "-": false };
const holding = { ".": null, "-": null };   // the note each key is on, if it's on one

let state = "ready";
let t, song, judge;
/*
 * The song's clock: where it stood (base) when the page's clock read
 * mark, and how fast it runs from there (rate: 1, or more as ramp
 * speeds it up). Paused, it stands at base.
 */
let base = 0, mark = 0, rate = 1;
let doneAt = 0;           // the page's clock when the card came up
let thirds = 0;           // strikes, in thirds
let lastUp = -Infinity;   // the song's clock when a key last came up
let typing = false;       // the text keyboard is up (your own text, below)

const now = (stamp = performance.now()) => (state === "running" ? base + (stamp - mark) * rate : base);

function setRate(next) {
  const stamp = performance.now();
  base = now(stamp);
  mark = stamp;
  rate = next;
  speedNow();
}

/* the speed as it is now, over the faders (the handles stay where they were set) */
function speedNow() {
  for (const input of [wpmFader, fwpmFader]) input.closest(".fader").querySelector("output").value = Math.round(input.value * rate);
}

function load() {
  const wpm = Number(wpmFader.value), fwpm = Number(fwpmFader.value);
  t = timing(wpm, fwpm);
  song = chart(wordsNow(), t, { lead: Math.max(LEAD * t.unit, LEAD_MIN) });
  judge = createJudge(song.notes, { unit: t.unit });
  road.load(song, t, judge.windows);
  message.load(song.letters, t.unit);
  markFaders();
  base = 0;
  rate = 1;
  thirds = 0;
  lastUp = -Infinity;
  setState("ready");
  streak();
  strikes();
}

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  $("#pause").textContent = next === "paused" ? "go on" : "pause";
  $("#pause").disabled = next === "ready" || next === "done";
  $("#card").hidden = next !== "done";
  $("#note").textContent = typing ? "type your text" : { ready: "press either key to start", paused: "paused" }[next] ?? "";
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
  if (run && run % HEAL_EVERY === 0 && thirds) { thirds = Math.max(0, thirds - HEAL); strikes(); }
  const letter = note.letter;
  if (letter.notes.some(n => !n.grade)) return;
  letter.grade = letter.notes.some(n => n.grade === "missed") ? "missed"
    : letter.notes.every(n => n.grade === "landed") ? "perfect" : "correct";
  /* ramp: its word done, and no letter of it missed */
  if (!rampBox.checked || !letter.last || state !== "running") return;
  const word = song.letters.filter(l => l.word === letter.word);
  const wpm = Number(wpmFader.value);
  if (word.every(l => l.grade && l.grade !== "missed")) setRate(Math.min(WPM_MAX, Math.round(wpm * rate) + 1) / wpm);
}

/* the strikes, three boxes filling by thirds */
function strikes() {
  for (const [i, box] of [...$("#strikes").children].entries()) box.style.setProperty("--fill", Math.min(1, Math.max(0, thirds / 3 - i)));
  $("#strikes").setAttribute("aria-label", `${strikesSaid()} of 3 strikes`);
}
const strikesSaid = () => `${Math.floor(thirds / 3) || (thirds % 3 ? "" : "0")}${["", "⅓", "⅔"][thirds % 3]}`;

/* three, and it's over, with no key left down */
function strike(n) {
  thirds = Math.min(OUT, thirds + n);
  strikes();
  if (thirds < OUT || state !== "running") return;
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
  mark = stamp;
  setState("running");
  requestAnimationFrame(frame);
}

function pause() {
  if (state !== "running") return;
  for (const lane of [".", "-"]) release(lane, performance.now());
  base = now();
  setState("paused");
}

function frame(stamp) {
  if (state !== "running") return;
  const at = now(stamp);
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
  base = now();
  const out = thirds >= OUT;
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

  const wpm = wpmFader.value, fwpm = fwpmFader.value;
  const id = `${songName()} @${wpm}${fwpm < wpm ? "/" + fwpm : ""}${rampBox.checked ? " ramp" : ""}`;
  const bests = keptJSON(BEST_KEY);
  const before = bests[id] ?? null;
  /* a run that struck out isn't a best: the song wasn't finished */
  if (!out && (before === null || percent > before)) { bests[id] = percent; keep(BEST_KEY, JSON.stringify(bests)); }

  $("#c-percent").textContent = percent + "%";
  $("#c-best").textContent = out ? "three strikes" : before === null ? "first run" : percent > before ? `best yet (was ${before}%)` : `best ${before}%`;
  $("#c-strikes").textContent = `${strikesSaid()} of 3`;
  $("#c-speed").textContent = rate > 1 ? `${Math.round(wpm * rate)} wpm` : `${wpm} wpm`;
  $("#c-landed").textContent = landed;
  $("#c-close").textContent = close;
  $("#c-missed").textContent = missed;
  $("#c-stray").textContent = stray;
  $("#c-streak").textContent = best;
  $("#c-ghost").textContent = "×" + best;
  $("#c-ratio").textContent = dit && dah ? `${(dah / dit).toFixed(1)} : 1` : "–";
  $("#c-lag").textContent = lag === null ? "–" : lag === 0 ? "on the line" : `${Math.abs(lag)} ms ${lag > 0 ? "late" : "early"}`;
  doneAt = performance.now();
  setState("done");
  $("#again").focus({ preventScroll: true });
}

/* ---------- the keys ---------- */

function press(lane, stamp) {
  if (down[lane] || typing) return;
  if (state === "done") {                 // either key: again
    if (performance.now() - doneAt > CARD_HOLD) load();
    return;
  }
  if (state === "ready" || state === "paused") { sound.unlock(); return start(stamp); }   // the press that starts isn't a note
  down[lane] = true;
  keys[lane].classList.add("down");
  sound.key(true);
  road.lit(true);
  const at = now(stamp);
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
  const at = now(stamp);
  lastUp = at;
  holding[lane] = null;
  road.up(lane, at);
  const note = judge.up(lane, at);
  if (note) graded(note);
}

/* the pads: on pointer DOWN, as the station's, and held */
for (const [lane, key] of Object.entries(keys)) {
  key.addEventListener("pointerdown", event => {
    event.preventDefault();
    key.setPointerCapture?.(event.pointerId);
    press(lane, event.timeStamp);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    key.addEventListener(type, event => release(lane, event.timeStamp));
  key.addEventListener("contextmenu", event => event.preventDefault());
}

/* a keyboard, or a paddle plugged in as one: the station's own keys
   for its two paddles (js/keymap.js; and Ctrl, with its box ticked) */
function laneFor(event) {
  const { code } = event, ctrlKeys = ctrlBox.checked;
  if (DIT_KEYS.has(code) || event.key === "." || (ctrlKeys && code === "ControlLeft")) return ".";
  if (DAH_KEYS.has(code) || event.key === "-" || (ctrlKeys && code === "ControlRight")) return "-";
  return null;
}
const chord = event => event.metaKey || event.altKey || (event.ctrlKey && !/^Control/.test(event.code));

/* Esc, P or the space bar: pause, and go on */
const PAUSE_KEYS = new Set(["Escape", "KeyP", "Space"]);

addEventListener("keydown", event => {
  if (typing) return typed(event);
  if (event.target.closest?.("select")) return;
  if (PAUSE_KEYS.has(event.code) && !chord(event) && (state === "running" || state === "paused")) {
    event.preventDefault();
    if (event.repeat) return;
    return state === "running" ? pause() : start(event.timeStamp);
  }
  const lane = laneFor(event);
  if (!lane || chord(event)) return;
  event.preventDefault();
  if (!event.repeat) press(lane, event.timeStamp);
});
addEventListener("keyup", event => {
  const lane = laneFor(event);
  if (lane) release(lane, event.timeStamp);
});

/*
 * The mouse as the key (its box ticked): left is dit, right is dah,
 * wherever the pointer is, but for the things that are there to be
 * clicked (the settings, the card, the top; the pads key themselves).
 */
const mouseLane = event => (event.button === 0 ? "." : event.button === 2 ? "-" : null);
const mouseKeys = event => mouseBox.checked && !typing && !event.target.closest?.(".settings, .result, .hero-top, .key, .incoming, .kbd");
addEventListener("mousedown", event => {
  const lane = mouseLane(event);
  if (!lane || !mouseKeys(event)) return;
  event.preventDefault();
  press(lane, event.timeStamp);
});
addEventListener("mouseup", event => {
  const lane = mouseLane(event);
  if (lane && mouseBox.checked) release(lane, event.timeStamp);
});
addEventListener("contextmenu", event => { if (mouseKeys(event)) event.preventDefault(); });

/* looking away: the song waits, and no key is left down */
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);
addEventListener("resize", () => { road.measure(); road.draw(now()); });
/* the type comes in after the first drawing, and the lines are cut to its width */
document.fonts?.ready.then(() => { if (state === "ready") load(); });

/* ---------- the controls ---------- */

/* the gear: the settings, open or shut, and kept that way */
function setTray(open) {
  $("#tray").hidden = !open;
  $("#gear").setAttribute("aria-expanded", String(open));
}
setTray(kept("dot-dash:hero-tray") === "1");
$("#gear").addEventListener("click", () => {
  const open = $("#tray").hidden;
  setTray(open);
  keep("dot-dash:hero-tray", open ? "1" : "0");
  $("#gear").blur();
});

$("#pause").addEventListener("click", event => {
  $("#pause").blur();        // or the space bar would press it, as well as pause
  return state === "running" ? pause() : start(event.timeStamp);
});
$("#again").addEventListener("click", load);
$("#card-close").addEventListener("click", load);
songList.addEventListener("change", () => {
  if (songList.value !== "link") keep(SONG_KEY, songList.value);
  songList.blur();
  load();
});

/*
 * ---------- your own text ----------
 *
 * A tap on the incoming message brings the station's text keyboard up
 * in the keys' place (the same height: nothing above it moves), and
 * what's typed is the song, "auto", shown where it will come in from.
 * A tap there again, ↵ or Esc, and the keys are back.
 *
 *   ┌ incoming ─┐           ┌ incoming ─┐
 *   │ CQ DE K   │  tap ▶    │ HELLO▮    │
 *   ├─────┬─────┤           ├───────────┤
 *   │  ●  │  ▬  │           │ Q W E R … │
 *   └─────┴─────┘           └───────────┘
 */
const typedText = () => own.map(w => w.map(c => DECODE[c] ?? "").join("")).join(" ");
let draft = "";
let keyboard = null;        // the station's (js/tx/keyboard.js), fetched the first time

function setDraft(text) {
  draft = text.toUpperCase().replace(/\s+/g, " ").replace(/^ /, "");
  own = encode(draft);
  songList.value = "link";
  history.replaceState(null, "", draft.trim() ? `/hero/?/${encodeURIComponent(draft.trim()).replace(/%20/g, "+")}` : "/hero/");
  load();
}

function typeKey(k) {
  if (k === "send") return setTyping(false);
  if (k === "back") return setDraft(draft.slice(0, -1));
  if (k === "back-word") return setDraft(draft.replace(/\S*\s*$/, ""));
  setDraft(draft + k);
}

/* a real keyboard types too, while the on-screen one is up */
function typed(event) {
  if (chord(event) || event.ctrlKey) return;
  if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); return setTyping(false); }
  if (event.key === "Backspace") { event.preventDefault(); return typeKey("back"); }
  if (event.key.length !== 1) return;
  event.preventDefault();
  typeKey(event.key);
}

async function setTyping(on) {
  if (on === typing) return;
  if (on && state === "running") pause();
  if (on && !keyboard) keyboard = (await import("../tx/keyboard.js")).createKeyboard({ typeKey });
  typing = on;
  document.body.dataset.input = on ? "text" : "keys";
  $("#kbd").hidden = !on;
  if (on) draft = songList.value === "link" ? typedText() : "";
  /* nothing typed: back to the song that was chosen before */
  if (!on && !own.length) songList.value = SONGS[kept(SONG_KEY)] ? kept(SONG_KEY) : 0;
  load();
}

$(".incoming").addEventListener("click", () => setTyping(!typing));

load();

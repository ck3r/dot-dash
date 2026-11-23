/*
 * ============================================================
 * TONE: a character's marks, sounded once (the card, the column)
 * ============================================================
 *
 * The marks on a card, or in the station's column, tapped: they key
 * themselves at the station's own speed, pitch and loudness, each
 * mark lit as it sounds.
 *
 *   ▪          di
 *   ▬    →     dah        at the wpm the station is set to
 *   ▪          dit        (its sliders, or what it last saved)
 *
 *   playMarks(code, { lights, end })   lights: one element per mark;
 *                                      end: called once it's done (or cut off)
 *
 * A phrase too: a space is the gap between letters (three units), a
 * slash between words (seven), as written: ".. / .-.. ---".
 *
 * Small on purpose: the reference has no station, only this. The
 * edges are soft (~5 ms), as the station's tone is, so no clicks.
 * A second tap starts it again from the top.
 */

const SETTINGS_KEY = "dot-dash:tx-settings";
const DEFAULTS = { "opt-wpm": 10, "opt-hz": 600, "opt-vol": 50 };

/* the station's slider where there is one, else what it saved */
function setting(id) {
  const input = document.getElementById(id);
  if (input?.value) return Number(input.value);
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))?.[id];
    if (saved !== undefined && !Number.isNaN(Number(saved))) return Number(saved);
  } catch { }
  return DEFAULTS[id];
}

let ctx = null, now = null;    // now: what's sounding { gain, timers }

function stop() {
  if (!now) return;
  now.end?.();
  now.timers.forEach(clearTimeout);
  now.lights.forEach(l => l.classList.remove("sounding"));
  now.gain.gain.cancelScheduledValues(ctx.currentTime);
  now.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.0015);   // soft, not a click
  try { now.osc.stop(ctx.currentTime + 0.03); } catch { }
  now = null;
}

export function playMarks(code, { lights = [], end } = {}) {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume?.();
  stop();
  const unit = 1.2 / setting("opt-wpm");               // seconds (PARIS)
  const volume = setting("opt-vol") / 100;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.value = setting("opt-hz");
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);

  const t0 = ctx.currentTime + 0.05, timers = [];
  /* each mark is followed by a unit; a space makes that three (a
     letter gap), and " / " seven (2 + 2 + 2 more: a word gap) */
  let at = 0, i = 0;
  for (const m of code) {
    if (m !== "." && m !== "-") { if (m === " " || m === "/") at += 2; continue; }
    const len = m === "." ? 1 : 3;
    gain.gain.setTargetAtTime(0.5 * volume, t0 + at * unit, 0.0015);
    gain.gain.setTargetAtTime(0, t0 + (at + len) * unit, 0.0015);
    const light = lights[i++];
    if (light) {
      timers.push(setTimeout(() => light.classList.add("sounding"), (0.05 + at * unit) * 1000));
      timers.push(setTimeout(() => light.classList.remove("sounding"), (0.05 + (at + len) * unit) * 1000));
    }
    at += len + 1;
  }
  osc.start(t0);
  osc.stop(t0 + at * unit + 0.1);
  now = { osc, gain, timers, lights, end };
  osc.onended = () => { if (now?.osc === osc) { now = null; end?.(); } };
}

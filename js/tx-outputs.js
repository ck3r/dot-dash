/*
 * ============================================================
 * TX OUTPUTS — light and vibration
 * ============================================================
 *
 * Everything that keys (your presses, taps, the keyboard,
 * playback) sends one signal: key closed / key open. Sound has
 * its own exact scheduling; these follow the signal as it
 * happens.
 *
 * Always: the lamp, the switch's LED and a brass glow round the
 * message area (never the whole screen: safe at any speed).
 *
 * Light (☼), one of, picked in settings:
 *   signal lamp  full screen, for playback (see tx/settings.js: it asks
 *                first, and twice if it would flash faster than
 *                3 times a second)
 *   invert       the whole screen flips while the key is down (asks
 *                first, like the signal lamp)
 *   flashlight   the phone's torch (Android Chrome only: it goes
 *                through the camera, so it asks for camera access)
 *
 * Vibration (where the phone supports it; not iPhone): buzzes for
 * each mark. A web page can't set how hard a phone vibrates, so
 * "strength" pulses the motor: 100 = steady, lower = short bursts
 * with gaps, which feels lighter.
 */

const PULSE = 20;        // ms per on/off cycle when pulsing
const REISSUE = 900;     // ms: a held key re-sends the buzz this often

/*
 * Chrome on Android keeps a vibration pattern to 99 entries of at
 * most 10 s each, and cuts a longer one short (or drops it), so a
 * held key is buzzed in short stretches, re-sent while it's held.
 */
export function createOutputs({ settings, lampTarget, overlay }) {
  let down = false;

  /* ---------- vibration ---------- */

  function buzzPattern() {
    const { strength } = settings();
    if (strength >= 95) return [REISSUE + 200];
    const on = Math.max(6, Math.round(PULSE * strength / 100));
    const off = Math.max(4, PULSE - on);
    const pattern = [];
    for (let t = 0; t < REISSUE + 200 && pattern.length < 96; t += on + off) pattern.push(on, off);
    return pattern;
  }

  let buzzing = false;
  let again = 0;

  function vibrate(on) {
    if (!("vibrate" in navigator)) return;
    if (on && !settings().vibrate) return;
    if (!on && !buzzing) return;                    // nothing to stop
    buzzing = on;
    clearInterval(again);
    try {
      if (on) {
        navigator.vibrate(buzzPattern());
        again = setInterval(() => { try { navigator.vibrate(buzzPattern()); } catch { } }, REISSUE);
      } else {
        navigator.vibrate(0);
      }
    } catch { }
  }

  /* a short buzz to feel the setting (call it from a tap) */
  function testBuzz() {
    if (!("vibrate" in navigator)) return false;
    try { return navigator.vibrate(buzzPattern().slice(0, 12)); } catch { return false; }
  }

  /* ---------- flashlight ---------- */

  let torchTrack = null;
  let torchAsked = false;

  async function torchReady() {
    if (torchTrack) return torchTrack;
    if (torchAsked || !navigator.mediaDevices?.getUserMedia) return null;
    torchAsked = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const track = stream.getVideoTracks()[0];
      if (!track?.getCapabilities?.().torch) {
        track?.stop();
        return null;
      }
      torchTrack = track;
      return track;
    } catch {
      return null;
    }
  }

  function torch(on) {
    if (!torchTrack) return;
    torchTrack.applyConstraints({ advanced: [{ torch: on }] }).catch(() => { });
  }

  function releaseTorch() {
    if (torchTrack) { torch(false); torchTrack.stop(); }
    torchTrack = null;
    torchAsked = false;
  }

  /* ---------- the signal ---------- */

  function signal(next) {
    if (next === down) return;
    down = next;
    const s = settings();
    lampTarget.classList.toggle("lit", down);          // the lamp: always
    if (s.light) {
      if (s.lightMode === "torch") torch(down);
      else if (s.lightMode === "invert") document.documentElement.classList.toggle("inverted", down);
      else if (overlay.isOpen()) overlay.flash(down);
    } else {
      document.documentElement.classList.remove("inverted");
    }
    vibrate(down);
  }

  /* drop everything (page hidden, outputs switched off) */
  function quiet() {
    down = false;
    lampTarget.classList.remove("lit");
    document.documentElement.classList.remove("inverted");
    overlay.flash(false);
    torch(false);
    vibrate(false);
  }

  return { signal, quiet, torchReady, releaseTorch, testBuzz, get down() { return down; } };
}


/*
 * The fastest flashing in a timeline: the shortest mark-start to
 * next mark-start, as flashes per second.
 */
export function flashRate(line) {
  let shortest = Infinity;
  for (let i = 1; i < line.marks.length; i++) shortest = Math.min(shortest, line.marks[i].start - line.marks[i - 1].start);
  if (line.marks.length === 1) shortest = line.marks[0].end - line.marks[0].start + 1;
  return shortest === Infinity ? 0 : 1000 / shortest;
}

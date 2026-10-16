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
 * Light, picked in settings:
 *   lamp         the switch's LED + a brass glow round the message
 *                area. Never the whole screen: safe at any speed.
 *   signal lamp  full screen, for playback (see tx.js: it asks
 *                first, and twice if it would flash faster than
 *                3 times a second)
 *   flashlight   the phone's torch (Android Chrome only: it goes
 *                through the camera, so it asks for camera access)
 *
 * Vibration (where the phone supports it; not iPhone): buzzes for
 * each mark. A web page can't set how hard a phone vibrates, so
 * "strength" pulses the motor: 100 = steady, lower = short bursts
 * with gaps, which feels lighter.
 */

const PULSE = 20;        // ms per on/off cycle when pulsing
const LONG = 60000;      // "until told to stop" (a held key)


export function createOutputs({ settings, lampTarget, overlay }) {
  let down = false;

  /* ---------- vibration ---------- */

  function buzzPattern(length) {
    const { strength } = settings();
    if (strength >= 95) return [length];
    const on = Math.max(4, Math.round(PULSE * strength / 100));
    const off = PULSE - on;
    const pattern = [];
    for (let t = 0; t < length; t += PULSE) pattern.push(on, off);
    return pattern;
  }

  let buzzing = false;

  function vibrate(on) {
    if (!("vibrate" in navigator)) return;
    if (on && !settings().vibrate) return;
    if (!on && !buzzing) return;                    // nothing to stop
    buzzing = on;
    try { navigator.vibrate(on ? buzzPattern(LONG) : 0); } catch { }
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
    if (s.light) {
      if (s.lightMode === "torch") torch(down);
      else if (overlay.isOpen()) overlay.flash(down);
      else lampTarget.classList.toggle("lit", down);
    } else {
      lampTarget.classList.remove("lit");
    }
    vibrate(down);
  }

  /* drop everything (page hidden, outputs switched off) */
  function quiet() {
    down = false;
    lampTarget.classList.remove("lit");
    overlay.flash(false);
    torch(false);
    vibrate(false);
  }

  return { signal, quiet, torchReady, releaseTorch, get down() { return down; } };
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

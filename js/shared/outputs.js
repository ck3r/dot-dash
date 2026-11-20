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
 *   signal lamp  full screen, for playback (see station/settings.js: it asks
 *                first, and twice if it would flash faster than
 *                3 times a second)
 *   flashlight   the phone's torch (Android Chrome only: it goes
 *                through the camera, so it asks for camera access;
 *                slow to switch: see "flashlight" below)
 *
 * Vibration (where the phone supports it; not iPhone): buzzes for
 * each mark. A web page can't set how hard a phone vibrates, so
 * "strength" pulses the motor: 100 = steady, lower = short bursts
 * with gaps, which feels lighter. A motor needs tens of milliseconds
 * to spin up, so a burst can't go below LEAST: shorter ones (10 ms
 * was the old middle setting) are sent, and never felt.
 *
 *   strength 0    ▪▪▫▫▪▪▫▫     25 on, 35 off
 *   strength 50   ▪▪▪▫▪▪▪▫     43 on, 17 off
 *   strength 100  ▪▪▪▪▪▪▪▪     steady
 *
 * A page can't tell if it's felt: Android stays still in silent mode
 * or battery saver, and navigator.vibrate still says yes.
 */

const PULSE = 60;        // ms per on/off cycle when pulsing
const LEAST = 25;        // ms: the shortest burst a motor shows
const GAP = 10;          // ms: the shortest gap that still reads as one
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
    const on = Math.round(LEAST + (PULSE - LEAST) * strength / 100);
    const off = Math.max(GAP, PULSE - on);
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

  /*
   * The torch is slow, and a page can't hurry it: each switch goes
   * through the camera and takes its time (the lag: tens of ms on
   * some phones, a couple of hundred on others), one switch at a
   * time. A mark longer than the lag comes out right, just late:
   *
   *   wanted   ▁███▁▁▁      lit   ▁▁███▁▁     (on and off both late)
   *
   * but a mark shorter than the lag can't: "off" waits for "on" to
   * finish, so the light stays lit a whole lag whatever was asked.
   * With a lag of a dah, E and T looked the same:
   *
   *   wanted   ▁█▁▁▁▁▁      lit   ▁▁▁███▁
   *
   * So the lag is measured when the flashlight is chosen (it blinks
   * twice: the first switch also wakes the camera, the second is the
   * one that counts), and playback goes no faster than it can follow
   * (station/main.js). Switches are sent one at a time, the latest wanted
   * state last, so none is lost if your hand outruns it.
   */
  let torchTrack = null;
  let torchAsked = false;
  let torchLag = 0;        // ms one switch takes here (0: not measured)
  let torchLit = false;    // what the torch was last told
  let torchWant = false;   // what the signal wants
  let torchBusy = false;   // a switch is under way

  /* one switch; resolves with the ms it took */
  function flip(track, on) {
    const t = performance.now();
    return track.applyConstraints({ advanced: [{ torch: on }] }).then(() => performance.now() - t, () => 0);
  }

  /* asked again while it's still being measured: the same answer */
  let torchComing = null;
  function torchReady() {
    if (torchComing) return torchComing;
    const coming = torchComing = findTorch().finally(() => { if (torchComing === coming) torchComing = null; });
    return coming;
  }

  async function findTorch() {
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
      let lag = 0;
      for (let i = 0; i < 2; i++) lag = Math.max(await flip(track, true), await flip(track, false));
      if (!torchAsked) { track.stop(); return null; }   // let go of meanwhile
      torchLag = lag;
      torchTrack = track;
      torchLit = false;
      torch(torchWant);                                  // keyed while it blinked
      return track;
    } catch {
      return null;
    }
  }

  function torch(on) {
    torchWant = on;
    if (!torchTrack || torchBusy || torchLit === on) return;
    const track = torchTrack;
    torchLit = on;
    torchBusy = true;
    flip(track, on).then(() => {
      torchBusy = false;
      if (torchTrack === track) torch(torchWant);        // changed again meanwhile
    });
  }

  function releaseTorch() {
    if (torchTrack) { torchTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(() => { }); torchTrack.stop(); }
    torchTrack = null;
    torchAsked = false;
    torchLag = 0;
    torchLit = torchWant = torchBusy = false;
  }

  /* ---------- the signal ---------- */

  function signal(next) {
    if (next === down) return;
    down = next;
    const s = settings();
    lampTarget.classList.toggle("lit", down);          // the lamp: always
    if (s.light) {
      if (s.lightMode === "torch") torch(down);
      else if (overlay.isOpen()) overlay.flash(down);
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

  return {
    signal, quiet, torchReady, releaseTorch, testBuzz,
    get down() { return down; },
    get torchLag() { return torchLag; }
  };
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

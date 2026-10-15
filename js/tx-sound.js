/*
 * ============================================================
 * TX SOUND — the tone and the sounder (Web Audio)
 * ============================================================
 *
 * Two voices, picked in settings:
 *
 *   tone      a sine wave at the pitch slider (default 600 Hz).
 *             Every mark starts and ends with a ~5 ms soft
 *             edge: an abrupt start/stop makes a click ("key
 *             clicks"), which real CW transmitters shape away.
 *
 *                 ┌──────────┐
 *              __/            \__       not   __|‾‾‾‾‾‾‾‾‾‾|__
 *
 *   sounder   a telegraph sounder: no tone, just the armature.
 *             Key down = the heavier, woody CLACK as it strikes;
 *             key up   = a lighter click as it springs back.
 *             Made from a burst of noise through filters (the
 *             strike) plus a short ring (the wooden body).
 *
 * The audio clock schedules everything, so marks are sample-
 * accurate. Live keying calls key(true/false) now; playback can
 * schedule ahead with mark(delay, length).
 *
 * Browsers only allow sound after a tap or key press, so the
 * audio starts on the first press (unlock()).
 *
 * Pass { context } (e.g. an OfflineAudioContext) to render to
 * a buffer instead of the speakers.
 */

const RISE = 0.0015;        // setTargetAtTime constant: ~5 ms to full
const TONE_LEVEL = 0.5;     // headroom under the master volume

export function createSound(options = {}) {
  let ctx = options.context ?? null;
  let master, osc, toneGain, noise;

  let kind = "tone";
  let pitch = 600;
  let volume = 0.6;
  let enabled = true;
  let toneOn = false;

  /* volume slider 0..1 → gain, on a curve that sounds even */
  const loudness = v => v * v;

  function build() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx({ latencyHint: "interactive" });
    }
    if (master) return ctx;

    master = ctx.createGain();
    master.gain.value = loudness(volume);

    /* a gentle limiter, so stacked clacks never distort */
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    master.connect(limiter).connect(ctx.destination);

    /* the tone runs all the time at zero gain: no start-up delay */
    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = pitch;
    toneGain = ctx.createGain();
    toneGain.gain.value = 0;
    osc.connect(toneGain).connect(master);
    osc.start();

    /* half a second of white noise, reused for every clack */
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  /* call from inside a tap / key press: browsers need a gesture */
  function unlock() {
    if (!build()) return null;
    if (ctx.state === "suspended") ctx.resume?.();
    return ctx;
  }

  /* ---------- the sounder ---------- */

  function burst(t, { freq, q, level, decay }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = freq;
    band.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.0008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(band).connect(env).connect(master);
    src.start(t, Math.random() * 0.4);   // a different slice each time: no two clacks identical
    src.stop(t + decay + 0.02);
  }

  function clack(down, t) {
    if (down) {
      /* strike: a broad knock, the wooden body ringing, a low thud */
      burst(t, { freq: 1400, q: 1.2, level: 0.9, decay: 0.03 });
      burst(t, { freq: 720, q: 9, level: 0.7, decay: 0.07 });
      const thud = ctx.createOscillator();
      thud.frequency.setValueAtTime(170, t);
      thud.frequency.exponentialRampToValueAtTime(90, t + 0.05);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      thud.connect(env).connect(master);
      thud.start(t);
      thud.stop(t + 0.08);
    } else {
      /* back stop: lighter and brighter */
      burst(t, { freq: 2600, q: 2, level: 0.45, decay: 0.018 });
      burst(t, { freq: 1150, q: 10, level: 0.3, decay: 0.045 });
    }
  }

  /* ---------- keying ---------- */

  /* key closed / opened, now or at a given audio time */
  function key(down, at) {
    if (!enabled && down) return;
    if (!unlock()) return;
    const t = at ?? ctx.currentTime;
    if (kind === "tone") {
      toneOn = down;
      toneGain.gain.setTargetAtTime(down ? TONE_LEVEL : 0, t, RISE);
    } else {
      clack(down, t);
    }
  }

  /* a whole mark, `delay` s from now, `length` s long (playback, taps) */
  function mark(delay, length) {
    if (!enabled || !unlock()) return;
    const t = ctx.currentTime + delay;
    key(true, t);
    key(false, t + length);
  }

  function silence() {
    if (!ctx || !toneGain) return;
    toneOn = false;
    toneGain.gain.cancelScheduledValues(ctx.currentTime);
    toneGain.gain.setTargetAtTime(0, ctx.currentTime, RISE);
  }

  /* ---------- settings ---------- */

  function setKind(next) {
    if (next === kind) return;
    silence();
    kind = next === "sounder" ? "sounder" : "tone";
  }

  function setPitch(hz) {
    pitch = hz;
    if (osc) osc.frequency.setTargetAtTime(hz, ctx.currentTime, 0.01);
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(loudness(v), ctx.currentTime, 0.02);
  }

  function setEnabled(on) {
    enabled = on;
    if (!on) silence();
  }

  return {
    key, mark, silence, unlock,
    setKind, setPitch, setVolume, setEnabled,
    get context() { return ctx; },
    get enabled() { return enabled; }
  };
}

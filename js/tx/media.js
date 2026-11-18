/*
 * The system's media controls (the notification and lock screen on
 * Android, the media hub on desktop) while a message plays, so it
 * can always be paused or stopped from outside the page.
 *
 *   createMediaControls() → {
 *     follow(playing, words, { position, duration })
 *                              in step with the player, after any change
 *                              (ms: where it is, and the whole message)
 *   }
 *
 * Chrome only shows them for a playing <audio> element; the message
 * itself is Web Audio. So a silent track plays alongside it, looping,
 * started and stopped with the player:
 *
 *   player   ▶━━━━━━━━━━━━━━━━━━━━━━━━━━━━━⏸
 *   silence  ▶┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄⏸   (real samples at the
 *                                                 midpoint: a muted
 *                                                 element gets no
 *                                                 controls)
 *
 * The buttons there (play, pause, stop) are the media session's
 * handlers, set in js/tx/player.js, and so is seekto: the panel's bar,
 * dragged, moves through the message.
 *
 * THE BAR is the message's, not the silence's: left to itself the
 * system draws the playing <audio>'s place, and that's the six-second
 * loop going round and round. So the message's length and place are
 * handed over (setPositionState) at every change; between changes the
 * system moves it along by itself, at the rate it's told.
 *
 *   silence  ┄┄┄┄┄┄↺┄┄┄┄┄┄↺┄┄┄┄┄┄↺     what the bar showed
 *   message  ━━━━━━━━━━━●┄┄┄┄┄┄┄┄┄     what it shows
 */
import { format } from "../morse.js";
import { plainText } from "./state.js";

/* six seconds (Chrome wants five or more) of 8-bit silence, 8 kHz:
   a 48 KB .wav, made here rather than downloaded */
function silentTrack() {
  const rate = 8000, n = rate * 6;
  const wav = new ArrayBuffer(44 + n);
  const v = new DataView(wav);
  const text = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + n, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  text(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(wav, 44).fill(128);   // 8-bit audio is unsigned: 128 is silence
  const audio = new Audio(URL.createObjectURL(new Blob([wav], { type: "audio/wav" })));
  audio.loop = true;
  return audio;
}

export function createMediaControls() {
  let track = null;     // made on the first play (inside a tap, as play() needs)
  let title = null;

  function follow(playing, words, { position = 0, duration = 0 } = {}) {
    const session = navigator.mediaSession;
    if (session) session.playbackState = playing ? "playing" : "paused";
    place(session, position, duration);
    if (!playing) {
      track?.pause();
      return;
    }
    track ??= silentTrack();
    if (track.paused) track.play().catch(() => { /* no controls, the sound still plays */ });
    const now = words?.length ? plainText(words) ?? format(words) : null;
    if (session && window.MediaMetadata && now !== title) {
      title = now;
      session.metadata = new MediaMetadata({
        title: now ?? "Morse",
        artist: "dot-da.sh",
        artwork: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
                  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }]
      });
    }
  }

  /* (a message of no length clears it; the system's own clamps are
     strict, so the place is kept inside the length) */
  function place(session, position, duration) {
    if (!session?.setPositionState) return;
    try {
      if (!(duration > 0)) return session.setPositionState();
      const d = duration / 1000;
      session.setPositionState({ duration: d, position: Math.max(0, Math.min(d, position / 1000)), playbackRate: 1 });
    } catch { /* not offered here */ }
  }

  return { follow };
}

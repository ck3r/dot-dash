/*
 * The system's media controls (the notification and lock screen on
 * Android, the media hub on desktop) while a message plays, so it
 * can always be paused or stopped from outside the page.
 *
 *   createMediaControls() → {
 *     follow(playing, words, { position, duration, period, repeat, art })
 *                              in step with the player, after any change
 *                              (ms: where it is, and the whole message);
 *                              the app's card only: period, one time
 *                              through and the space after it; repeat,
 *                              off / three / on; art, { key, frames() }
 *                              its pictures (js/station/card-art.js),
 *                              made when the key is new
 *     handle(action, fn)       a button there: play, pause, stop, seekto
 *                              (fn({ seekTime }), in seconds)
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
 * handlers, set in js/station/player.js, and so is seekto: the panel's bar,
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
 *
 * IN THE APP (apps/mobile) Android's WebView draws no card from a
 * page's media session, so the app has its own (MediaPlugin.java),
 * told the same things over Capacitor's bridge, and its buttons come
 * back as "action" events to the same handlers. Only when something
 * changes: the bar between changes is the system's to move.
 *
 *   follow() ──► navigator.mediaSession            (the web: Chrome's card)
 *            └─► Capacitor.Plugins.Media.follow()  (the app: its own card)
 */
import { format, pretty } from "../core/morse.js";
import { inApp } from "../core/where.js";
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

/* the app's card, through the bridge (as ≋'s motor is, shared/outputs.js) */
const appCard = () => (inApp() ? globalThis.Capacitor?.Plugins?.Media ?? null : null);

export function createMediaControls() {
  let track = null;     // made on the first play (inside a tap, as play() needs)
  let title = null;
  const card = appCard();
  let told = null;      // what the app's card was last told, and when

  function follow(playing, words, { position = 0, duration = 0, period = duration, repeat = "off", art = null } = {}) {
    const session = navigator.mediaSession;
    if (session) session.playbackState = playing ? "playing" : "paused";
    place(session, position, duration);
    const now = words?.length ? plainText(words) ?? format(words) : null;
    if (card && playing) paint(art);
    tell(playing, now, position, duration, { morse: words?.length ? pretty(words) : "", period, repeat });
    if (!playing) {
      track?.pause();
      return;
    }
    track ??= silentTrack();
    if (track.paused) track.play().catch(() => { /* no controls, the sound still plays */ });
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

  /* The app's card, only when it would show something new: playing or
     not, another message or length, or a place that isn't where the
     bar would have got to by itself (a seek), give or take a beat.
     The player asks after every change, and each call crosses the
     bridge. */
  function tell(playing, now, position, duration, { morse, period, repeat }) {
    if (!card) return;
    const at = performance.now();
    const name = now ?? "Morse";
    if (told && told.playing === playing && told.title === name && told.duration === duration
        && told.period === period && told.repeat === repeat) {
      const expected = told.position + (playing ? at - told.at : 0);
      if (Math.abs(expected - position) < 250) return;
    }
    told = { playing, title: name, duration, position, at, period, repeat };
    Promise.resolve(card.follow({ playing, title: name, morse, position, duration, period, repeat }))
      .catch(() => { /* no card, the sound still plays */ });
  }

  /* The card's pictures, once for each message as it's drawn (its
     look, its speed): made as it starts to play, before follow() says
     so, so the app has them to swap from the start. */
  let painted = null;
  function paint(art) {
    if (!art || art.key === painted) return;
    painted = art.key;
    let frames = [];
    try { frames = art.frames(); } catch { /* no pictures: the card keeps the icon */ }
    Promise.resolve(card.art?.({ frames })).catch(() => { });
  }

  /* a button on the card: the web's media session and the app's both */
  const handlers = new Map();
  function handle(action, fn) {
    try { navigator.mediaSession?.setActionHandler(action, fn); } catch { /* not offered here */ }
    if (card) handlers.set(action, fn);
  }
  card?.addListener?.("action", ({ action, seekTime }) => handlers.get(action)?.({ action, seekTime }));

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

  return { follow, handle };
}

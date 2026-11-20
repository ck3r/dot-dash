/*
 * RX's eye: the camera (or a video), its picture, and the spot in it
 * that's watched. It reads nothing itself: for each picture taken it
 * says how bright the spot is, and js/core/rx-light.js makes Morse of it
 * (js/station/rx.js joins the two, and shows the result on its scope).
 *
 *   ┌──────────────────────────────────┐ [+]
 *   │                                  │
 *   │              ┌   ┐               │ 2×    the ring: what's watched.
 *   │                ●                 │       Tap the lamp and it goes
 *   │              └   ┘               │       there; drag, and it follows
 *   │                                  │ [−]
 *   └──────────────────────────────────┘
 *
 * NOTHING IS TRACKED. A hand-held camera wanders, and following a
 * lamp through a picture frame by frame is heavy work that goes
 * wrong in its own ways. Instead the ring has a margin (the lamp can
 * be anywhere in it: rx-light.js brightOf), and when the lamp leaves
 * it you put it back with a finger, as often as you like, while it
 * reads.
 *
 * ZOOM: − and +, a pinch, or the wheel. The camera's own lens where
 * it has one a page may work (a phone's, mostly); otherwise the
 * picture is magnified here, which is all a video can have anyway.
 * Magnified here, it grows about the place that's pinched (or the
 * ring, from the buttons), so the lamp stays in sight; with two
 * fingers the picture can be slid as well.
 *
 *   createEye({ frame, ended, tap }) → {
 *     start()      the camera (asked for now, never before), or the
 *                  video from where it stands → true, or why not:
 *                  "cant", "denied", "none"
 *     halt()       the camera closed, the video held (the last
 *                  picture stays)
 *     load(file)   a video, shown at its first picture → true / false
 *     rewind()     the video, back to its start
 *     flip()       the other camera, front or back (the back first):
 *                  kept, and swapped now if it's running → as start()
 *     close()      all of it away
 *     film         is a video loaded?
 *     reading      "lamp" or "blink": what the ring is on
 *   }
 *   frame(value, at)   the spot's brightness (or, on a blink, how far
 *                      it is from rest), 0..1, and the picture's time (ms)
 *   ended()            the video ran out
 *   tap()              the picture was tapped with nothing in it
 *
 * The pictures stay on this device: looked at, and gone.
 */
import { brightOf, createRest } from "../core/rx-light.js";
import { $, toast } from "../shared/dom.js";

const RING = 22;              // the ring, from its middle to its side, as the finger sees it (px)
const PATCH = 24;             // and as it's looked at: this many pixels a side
const ZOOM_MAX = 8;           // magnified here: this far
const FACING_KEY = "dot-dash:rx-facing";   // "user" once flipped to the front

export function createEye({ frame, ended = () => { }, tap = () => { } }) {
  const canvas = $("#rx-picture"), video = $("#rx-video");
  const slider = $("#rx-zoom"), label = $("#rx-zoom-now");
  const patch = document.createElement("canvas");
  patch.width = patch.height = PATCH;
  const eyes = patch.getContext("2d", { willReadFrequently: true });

  let stream = null, track = null, film = null, run = 0;
  /* which camera: the back one, unless flipped (and kept) */
  let facing = "environment";
  try { if (localStorage.getItem(FACING_KEY) === "user") facing = "user"; } catch { }
  /* the flip (⇄, the picture's corner): only where there are two
     cameras to choose from, known once one has been allowed */
  const flipper = $("#rx-flip");
  async function showFlip() {
    if (!flipper) return;
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      flipper.hidden = cams.length < 2;
    } catch { flipper.hidden = true; }
    flipper.title = facing === "environment" ? "the front camera" : "the back camera";
    flipper.setAttribute("aria-label", flipper.title);
  }
  flipper?.addEventListener("click", event => {
    event.stopPropagation();
    flipper.blur();
    api.flip().then(ok => { if (ok !== true) toast("can't open that camera"); });
  });
  let lens = null;              // the camera's own zoom: { min, max }
  let zoom = 1;                 // 1: as the camera gives it
  /* where the ring is and where the middle of what's shown is, both
     as parts of the whole picture (0..1 across, 0..1 down) */
  const spot = { x: 0.5, y: 0.5 }, centre = { x: 0.5, y: 0.5 };
  let lit = false;              // (the ring shows the lamp as it's read: rx.js says)

  const showing = () => (!!stream || !!film) && video.videoWidth > 0;
  const within = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /*
   * WHAT'S SHOWN: the picture fills the frame (cut at the sides or
   * top and bottom, as it must be), times the zoom if it's magnified
   * here. `scale` is screen pixels for each of the picture's.
   *
   *   the whole picture ┌──────────────┐
   *                     │  ┌──────┐    │
   *                     │  │ shown│    │   x, y, w, h: in its pixels
   *                     │  └──────┘    │
   *                     └──────────────┘
   */
  function shown() {
    const vw = video.videoWidth, vh = video.videoHeight, cw = canvas.clientWidth, ch = canvas.clientHeight;
    const scale = Math.max(cw / vw, ch / vh) * (lens ? 1 : zoom);
    const w = cw / scale, h = ch / scale;
    centre.x = within(centre.x, w / 2 / vw, 1 - w / 2 / vw);
    centre.y = within(centre.y, h / 2 / vh, 1 - h / 2 / vh);
    return { x: centre.x * vw - w / 2, y: centre.y * vh - h / 2, w, h, scale, vw, vh, cw, ch };
  }
  /* a place on the screen (within the frame) → a place in the picture */
  function placeOf(event) {
    const box = canvas.getBoundingClientRect(), s = shown();
    const sx = within((event.clientX - box.left) / (box.width || 1), 0, 1), sy = within((event.clientY - box.top) / (box.height || 1), 0, 1);
    return { x: (s.x + sx * s.w) / s.vw, y: (s.y + sy * s.h) / s.vh, sx, sy };
  }

  function draw() {
    const ratio = devicePixelRatio || 1, cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * ratio)) canvas.width = Math.round(cw * ratio);
    if (canvas.height !== Math.round(ch * ratio)) canvas.height = Math.round(ch * ratio);
    const g = canvas.getContext("2d");
    const css = getComputedStyle(canvas);
    const ink = name => css.getPropertyValue(name).trim();
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!showing()) {
      g.clearRect(0, 0, cw, ch);
      g.font = `12px ${css.fontFamily}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = ink("--graphite");
      g.fillText("tap to watch", cw / 2, ch / 2);
      return;
    }
    const s = shown();
    const x = (spot.x * s.vw - s.x) * s.scale, y = (spot.y * s.vh - s.y) * s.scale, arm = 7;
    /*
     * Only the ring's patch is in colour and as bright as it is: the
     * rest of the picture is greyed and dimmed. What's outside isn't
     * looked at, and shouldn't look as if it were.
     *
     *   ░░░░░░░░░░░░░░░░░
     *   ░░░░░┌   ┐░░░░░░░      grey: there to aim by
     *   ░░░░░  ●  ░░░░░░░      clear: what's read
     *   ░░░░░└   ┘░░░░░░░
     *
     * (where a canvas can't grey a picture, it's dimmed all the same)
     */
    try {
      g.filter = "grayscale(1)";
      g.drawImage(video, s.x, s.y, s.w, s.h, 0, 0, cw, ch);
      g.filter = "none";
      g.fillStyle = "rgba(0, 0, 0, 0.45)";
      g.fillRect(0, 0, cw, ch);
      g.save();
      g.beginPath();
      g.rect(x - RING, y - RING, 2 * RING, 2 * RING);
      g.clip();
      g.drawImage(video, s.x, s.y, s.w, s.h, 0, 0, cw, ch);
      g.restore();
    } catch { return; }
    /* the ring: four corners, brass; paper while the lamp's read as on */
    for (const [colour, width] of [["rgba(0,0,0,0.55)", 4], [lit ? ink("--paper") : ink("--brass"), 1.6]]) {
      g.strokeStyle = colour;
      g.lineWidth = width;
      g.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(x + dx * RING, y + dy * (RING - arm));
        g.lineTo(x + dx * RING, y + dy * RING);
        g.lineTo(x + dx * (RING - arm), y + dy * RING);
      }
      g.stroke();
    }
  }

  /* the ring's patch of the picture: how bright it is (a lamp), or
     how far from rest (a blink), 0..1 */
  let reading = "lamp", then = null;
  let shut = false;             // seen as shut, even before it's long enough to be a mark (rx.js says)
  const rest = createRest();
  function look(at) {
    const s = shown(), side = 2 * RING / s.scale;
    const x = within(spot.x * s.vw - side / 2, 0, Math.max(0, s.vw - side)), y = within(spot.y * s.vh - side / 2, 0, Math.max(0, s.vh - side));
    const dt = then === null ? 0 : at - then;
    then = at;
    try {
      eyes.drawImage(video, x, y, Math.min(side, s.vw), Math.min(side, s.vh), 0, 0, PATCH, PATCH);
      const pixels = eyes.getImageData(0, 0, PATCH, PATCH).data;
      return reading === "blink" ? rest.change(pixels, dt, shut) : brightOf(pixels);
    } catch { return 0; }
  }
  /* what was at rest isn't, once the ring's moved or the zoom's changed */
  const unsettle = () => { rest.reset(); then = null; };

  /*
   * A PICTURE AT A TIME: the browser says when the video has a new
   * one, and when it was taken (a video's own clock; the camera's).
   * That time is what the marks are measured by, not when the page
   * got round to looking.
   */
  function pump() {
    const mine = run;
    const next = at => {
      if (mine !== run) return;
      if (showing()) { draw(); frame(look(at), at); }
      if (film) pace();
      pump();
    };
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback((now, meta) => next(film ? meta.mediaTime * 1000 : meta.captureTime ?? meta.expectedDisplayTime ?? now));
    } else requestAnimationFrame(now => next(film ? video.currentTime * 1000 : now));
  }

  /*
   * A VIDEO WITH MORE PICTURES THAN THE SCREEN SHOWS (a phone's slow
   * motion: 120 or 240 a second, on a screen that shows 60): played
   * as it is, most of them go by unlooked at. So it's counted: how
   * many pictures the video went through against how many came this
   * way, and while it's getting ahead it's played at half the speed,
   * and half again, until every one is seen.
   *
   *   240 a second, as it is   ● · · · ● · · · ●     one in four looked at
   *   at a quarter the speed   ● ● ● ● ● ● ● ● ●     all of them
   *
   * The marks are timed by the video's own clock, so played slowly
   * it reads the same, only finer.
   */
  let count = null;             // { from: pictures gone through at the start of the count, came: how many came }
  let slowed = false;           // (said once for each video)
  function pace() {
    const gone = video.getVideoPlaybackQuality?.().totalVideoFrames;
    if (gone === undefined) return;
    count ??= { from: gone, came: 0 };
    if (++count.came < 20) return;
    if (gone - count.from > count.came * 1.3 && video.playbackRate > 0.125) {
      if (!slowed) toast("played slowly: every picture is looked at");
      slowed = true;
      video.playbackRate /= 2;
    }
    count = null;
  }

  /*
   * ZOOM, to `to`, with `hold` staying where it is on the screen:
   * { x, y } in the picture, { sx, sy } across the frame. The
   * camera's own lens only grows about its middle, so there the ring
   * is moved instead, to stay on what it was on.
   */
  const limits = () => (lens ? [1, lens.max / lens.min] : [1, ZOOM_MAX]);
  function zoomTo(to, hold) {
    const [lo, hi] = limits();
    to = within(to, lo, hi);
    if (to !== zoom) unsettle();
    if (lens) {
      spot.x = within(0.5 + (spot.x - 0.5) * to / zoom, 0, 1);
      spot.y = within(0.5 + (spot.y - 0.5) * to / zoom, 0, 1);
      zoom = to;
      track?.applyConstraints({ advanced: [{ zoom: within(lens.min * zoom, lens.min, lens.max) }] }).catch(() => { });
    } else {
      zoom = to;
      if (showing() && hold) {
        const s = shown();
        centre.x = hold.x + (0.5 - hold.sx) * s.w / s.vw;
        centre.y = hold.y + (0.5 - hold.sy) * s.h / s.vh;
      }
    }
    says();
    if (showing()) draw();
  }
  /*
   * The slider, as the settings' faders: how far at the top, low at
   * the bottom. Its travel is by ratio, not by step (each tenth of the
   * way up multiplies the zoom by the same), so 1× to 2× takes as much
   * room as 4× to 8×.
   */
  const TRAVEL = 1000;
  const zoomAt = v => { const [lo, hi] = limits(); return lo * (hi / lo) ** (v / TRAVEL); };
  const placeOfZoom = z => { const [lo, hi] = limits(); return hi > lo ? Math.round(TRAVEL * Math.log(z / lo) / Math.log(hi / lo)) : 0; };
  function says() {
    label.textContent = `${zoom >= 10 ? Math.round(zoom) : Math.round(zoom * 10) / 10}×`;
    slider.disabled = !showing();
    slider.value = String(placeOfZoom(zoom));
    slider.style.setProperty("--p", String(slider.value / TRAVEL));
  }
  /* (from the slider: about the ring, where it is on the screen now) */
  function ringHeld() {
    if (!showing()) return null;
    const s = shown();
    return { x: spot.x, y: spot.y, sx: (spot.x * s.vw - s.x) / s.w, sy: (spot.y * s.vh - s.y) / s.h };
  }
  slider.addEventListener("input", () => zoomTo(zoomAt(Number(slider.value)), ringHeld()));

  /*
   * THE PICTURE UNDER A FINGER
   *
   *   one finger     the ring goes there, and follows it
   *   two            a pinch: zoom (and the ring goes back where it
   *                  was: the first finger of two wasn't pointing)
   *   the wheel      zoom, about the pointer
   */
  const fingers = new Map();    // pointer id → event
  let pinch = null, before = null;
  const apart = ([a, b]) => Math.max(10, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
  const between = ([a, b]) => ({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 });
  function aim(event) {
    const at = placeOf(event);
    spot.x = at.x; spot.y = at.y;
    unsettle();
    draw();
  }
  canvas.addEventListener("pointerdown", event => {
    if (event.button > 0) return;
    if (!showing()) { tap(); return; }
    canvas.setPointerCapture?.(event.pointerId);
    fingers.set(event.pointerId, event);
    if (fingers.size === 1) { before = { ...spot }; aim(event); }
    else if (fingers.size === 2) {
      if (before) { spot.x = before.x; spot.y = before.y; unsettle(); }
      const two = [...fingers.values()];
      pinch = { apart: apart(two), zoom, held: placeOf(between(two)) };
    }
  });
  canvas.addEventListener("pointermove", event => {
    if (!fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, event);
    if (pinch && fingers.size === 2) {
      const two = [...fingers.values()], mid = placeOf(between(two));
      zoomTo(pinch.zoom * apart(two) / pinch.apart, { x: pinch.held.x, y: pinch.held.y, sx: mid.sx, sy: mid.sy });
    } else if (!pinch && fingers.size === 1 && showing()) aim(event);
  });
  function lift(event) {
    if (!fingers.delete(event.pointerId)) return;
    if (!fingers.size) pinch = before = null;       // (a pinch is over when both fingers are up: the one left isn't pointing)
  }
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("wheel", event => {
    if (!showing()) return;
    event.preventDefault();
    zoomTo(zoom * Math.exp(-event.deltaY * 0.002), placeOf(event));
  }, { passive: false });

  video.addEventListener("ended", () => { if (film) ended(); });
  video.addEventListener("seeked", () => { if (film) draw(); });
  new ResizeObserver(() => draw()).observe(canvas);

  function halt() {
    run++;
    for (const t of stream?.getTracks?.() ?? []) t.stop();
    if (stream) video.srcObject = null;
    stream = track = null;
    lens = null;
    if (film) video.pause();
    lit = shut = false;
    unsettle();
    says();
  }

  const api = {
    async start() {
      if (film) {
        if (video.ended || video.duration - video.currentTime < 0.05) video.currentTime = 0;
        try { await video.play(); } catch { return "cant"; }
        count = null;
        run++; pump(); says();
        return true;
      }
      if (!navigator.mediaDevices?.getUserMedia) return "cant";
      /* the back of a phone, where the lamp is, for certain ("ideal"
         alone, some phones give the front); and as many pictures a
         second as it will give (each one is a look at the lamp). No
         camera that way (a laptop's one): whichever there is */
      const ask = facingMode => navigator.mediaDevices.getUserMedia({
        video: { facingMode, frameRate: { ideal: 60 }, width: { ideal: 1280 } }, audio: false
      });
      try {
        try { stream = await ask({ exact: facing }); }
        catch (e) {
          if (e?.name !== "OverconstrainedError" && e?.name !== "NotFoundError") throw e;
          stream = await ask({ ideal: facing });
        }
      } catch (e) {
        stream = null;
        return e?.name === "NotAllowedError" ? "denied" : "none";
      }
      showFlip();
      track = stream.getVideoTracks()[0] ?? null;
      const can = track?.getCapabilities?.().zoom;
      lens = can && can.max > can.min && can.min > 0 ? { min: can.min, max: can.max } : null;
      video.srcObject = stream;
      try { await video.play(); } catch { halt(); return "cant"; }
      /* the zoom it had before a pause, as near as this lens goes */
      const [lo, hi] = limits();
      zoom = within(zoom, lo, hi);
      if (lens && zoom > 1) track.applyConstraints({ advanced: [{ zoom: lens.min * zoom }] }).catch(() => { });
      run++; pump(); says();
      return true;
    },
    halt,
    async load(file) {
      api.close();
      film = URL.createObjectURL(file);
      slowed = false;
      video.src = film;
      const ok = await new Promise(done => {
        video.addEventListener("loadeddata", () => done(true), { once: true });
        video.addEventListener("error", () => done(false), { once: true });
      });
      if (!ok || !video.videoWidth) { api.close(); return false; }
      says(); draw();
      return true;
    },
    rewind() { if (film) video.currentTime = 0; },
    /* the other camera (front or back), kept for next time; running,
       it's swapped there and then */
    async flip() {
      facing = facing === "environment" ? "user" : "environment";
      try { localStorage.setItem(FACING_KEY, facing); } catch { }
      if (!stream) return true;
      halt();
      return api.start();
    },
    close() {
      halt();
      if (film) {
        URL.revokeObjectURL(film);
        film = null;
        video.removeAttribute("src");
        video.load();
      }
      zoom = 1;
      spot.x = spot.y = centre.x = centre.y = 0.5;
      says(); draw();
    },
    /* what the ring is on: "lamp" (how bright) or "blink" (how changed) */
    set reading(how) { reading = how; unsettle(); },
    set shut(on) { shut = on; },
    /* the lamp, as it's read (rx.js): the ring says so */
    set lit(on) { if (on !== lit) { lit = on; if (showing()) draw(); } },
    get film() { return !!film; }
  };
  says(); draw();
  return api;
}

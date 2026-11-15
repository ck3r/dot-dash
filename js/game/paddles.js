/*
 * Two keys, however they're pressed: the pads on the screen, a
 * keyboard (or a paddle plugged in as one), the mouse's buttons. All
 * of them come out as the same two calls, with the event's own time
 * stamp, so a press is timed by when it happened.
 *
 *   pad ●  [ or , or ← …  left button ─┐
 *                                      ├─▶ press(lane, stamp)
 *   pad ▬  ] or / or → …  right button ┘   release(lane, stamp)
 *
 *   lane: "." the dit, "-" the dah
 *
 *   createPaddles({ pads, ctrl, mouse, press, release, keydown, off, clickable })
 *
 * pads: { ".": element, "-": element }; ctrl(), mouse(): whether the
 * Ctrl keys and the mouse are keys just now (look.js); keydown(event):
 * the page's own keys, asked first, true if the key was its (pause,
 * typing); off(): the mouse isn't a key just now; clickable: a
 * selector for what the mouse is still a mouse on.
 *
 * It keeps no state: whether a key counts as down is the game's.
 */
import { DIT_KEYS, DAH_KEYS } from "../keymap.js";

/* a key with a modifier is the browser's, not ours (Ctrl by itself may be a paddle) */
export const chord = event => event.metaKey || event.altKey || (event.ctrlKey && !/^Control/.test(event.code));

export function createPaddles({ pads, ctrl = () => false, mouse = () => false, press, release, keydown, off = () => false, clickable = "" }) {
  /* the pads: on pointer DOWN, as the station's, and held */
  for (const [lane, pad] of Object.entries(pads)) {
    pad.addEventListener("pointerdown", event => {
      event.preventDefault();
      pad.setPointerCapture?.(event.pointerId);
      press(lane, event.timeStamp);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      pad.addEventListener(type, event => release(lane, event.timeStamp));
    pad.addEventListener("contextmenu", event => event.preventDefault());
  }

  /* a keyboard: the station's own keys for its two paddles
     (js/keymap.js; and Ctrl, with its box ticked) */
  function laneFor(event) {
    const { code } = event, ctrlKeys = ctrl();
    if (DIT_KEYS.has(code) || event.key === "." || (ctrlKeys && code === "ControlLeft")) return ".";
    if (DAH_KEYS.has(code) || event.key === "-" || (ctrlKeys && code === "ControlRight")) return "-";
    return null;
  }

  addEventListener("keydown", event => {
    if (keydown?.(event)) return;
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
   * clicked (the pads key themselves).
   */
  const mouseLane = event => (event.button === 0 ? "." : event.button === 2 ? "-" : null);
  const mouseKeys = event => mouse() && !off() && !(clickable && event.target.closest?.(clickable));
  addEventListener("mousedown", event => {
    const lane = mouseLane(event);
    if (!lane || !mouseKeys(event)) return;
    event.preventDefault();
    press(lane, event.timeStamp);
  });
  addEventListener("mouseup", event => {
    const lane = mouseLane(event);
    if (lane && mouse()) release(lane, event.timeStamp);
  });
  addEventListener("contextmenu", event => { if (mouseKeys(event)) event.preventDefault(); });
}

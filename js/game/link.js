/*
 * A game's link carries its settings as well as its text, so a run
 * shared is the same run: the same words at the same speed, ramping or
 * not. They go after "#", in words, as the station's do
 * (station/settings.js: "#wpm20.farns12.hz700"), so the link's
 * preview, which only sees what's before the "#", is the same:
 *
 *   /dash/?/_.._-.-_#wpm12.farns8.ramp
 *          └ text ──┘└ settings ────┘
 *
 *   wpmN     the speed (always said: the run is at this speed, whoever
 *            opens it)
 *   farnsN   farns., only when it's slower than wpm (left out, it's
 *            the same)
 *   ramp     there when it's on; a game link without it has it off
 *
 * Opened, they set the game for that visit: what the player has kept
 * (store.js) is left as it was, and the address is tidied back to the
 * text, as the station's is. And as the station's, a toast says what
 * the link changed, with "keep" to make it the player's own. The look
 * (colour, invert, the Ctrl keys, the mouse) is the player's own, and
 * isn't shared.
 *
 *   linked(hash)                 what a "#…" says: { wpm, fwpm, ramp },
 *                                or null if it isn't a game's settings
 *   applyLinked({ wpm, fwpm, ramp, show })
 *                                this address's, set on the faders and
 *                                the box for the visit (no change
 *                                event, so not kept), taken off the
 *                                address, and said in a toast with keep
 *   withSettings(url, { wpm, fwpm, ramp })
 *                                the url with them on the end
 */
import { toast } from "../shared/dom.js";

export function linked(hash = location.hash) {
  const parts = hash.replace(/^#/, "").split(".").map(p => p.toLowerCase()).filter(Boolean);
  const out = { wpm: null, fwpm: null, ramp: false };
  for (const part of parts) {
    const n = part.match(/^(wpm|farns)(\d+)$/);
    if (n) out[n[1] === "wpm" ? "wpm" : "fwpm"] = Number(n[2]);
    else if (part === "ramp") out.ramp = true;
    else return null;                 // not a game's settings (or not ours)
  }
  return out.wpm === null ? null : out;
}

export function applyLinked({ wpm, fwpm, ramp, show }) {
  const set = linked();
  if (!set) return;
  const within = (input, value) => Math.min(Number(input.max), Math.max(Number(input.min), value));
  const was = { wpm: wpm.value, fwpm: fwpm.value, ramp: ramp?.checked };
  wpm.value = within(wpm, set.wpm);
  /* farns. never faster than wpm; unsaid, it's the same as wpm */
  fwpm.value = set.fwpm === null ? wpm.value : Math.min(Number(wpm.value), within(fwpm, set.fwpm));
  if (ramp) ramp.checked = set.ramp;
  show?.();
  history.replaceState(null, "", location.pathname + location.search);
  /* what it changed, said; "keep" makes it the player's own (the
     faders' and the box's own change events keep them) */
  const said = [];
  if (wpm.value !== was.wpm) said.push(`${wpm.value} wpm`);
  if (fwpm.value !== was.fwpm && Number(fwpm.value) < Number(wpm.value)) said.push(`farns. ${fwpm.value}`);
  if (ramp && ramp.checked !== was.ramp) said.push(ramp.checked ? "ramp" : "no ramp");
  if (!said.length) return;
  const keep = () => {
    for (const input of [wpm, fwpm, ramp].filter(Boolean)) input.dispatchEvent(new Event("change"));
    toast("kept");
  };
  /* once the page has drawn (the toast centres on what's there) */
  requestAnimationFrame(() => toast(`the link's settings: ${said.join(" · ")}`, { ms: 8000, action: ["keep", keep] }));
}

export function withSettings(url, { wpm, fwpm, ramp }) {
  if (!url) return url;
  const parts = [`wpm${wpm}`];
  if (fwpm < wpm) parts.push(`farns${fwpm}`);
  if (ramp) parts.push("ramp");
  return `${url}#${parts.join(".")}`;
}

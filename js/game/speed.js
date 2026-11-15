/*
 * The speed: two faders, as the station's. wpm is how fast a letter's
 * marks go, farns. (Farnsworth) the speed overall, the spaces between
 * letters stretched to make it. It follows wpm while the two are
 * equal, stays where it's put once lower, and is never the faster.
 *
 *   wpm    ├────────●─────┤ 18
 *   farns. ├────●───┄┄┄┄┄┄┤ 12     ┄ out of its reach: above wpm
 *
 * A game's speed is its own, kept apart from the station's: the speed
 * to play at isn't the speed to send at.
 *
 *   createSpeed({ wpm, fwpm, wpmKey, fwpmKey, start, change }) → {
 *     wpm(), fwpm()     as set
 *     show(rate = 1)    the numbers over the faders, as fast as the
 *                       song now runs (the handles stay where they
 *                       were set)
 *   }
 *
 * wpm, fwpm: the two range inputs, each in a .fader with an output,
 * farns.'s in a .track; the keys: where they're kept; start: the wpm
 * of a first visit; change(): a fader was let go.
 */
import { keep, kept } from "./store.js";

export function createSpeed({ wpm, fwpm, wpmKey, fwpmKey, start = 10, change }) {
  const within = (input, value) => Math.min(Number(input.max), Math.max(Number(input.min), value));
  wpm.value = within(wpm, Number(kept(wpmKey)) || start);
  fwpm.value = Math.min(wpm.value, within(fwpm, Number(kept(fwpmKey)) || Number(wpm.value)));
  let wpmWas = Number(wpm.value);

  function show(rate = 1) {
    for (const input of [wpm, fwpm]) {
      input.style.setProperty("--p", String((input.value - input.min) / (input.max - input.min)));
      input.closest(".fader").querySelector("output").value = Math.round(input.value * rate);
    }
    /* the farnsworth track above wpm: out of reach (the cap) */
    fwpm.closest(".track").style.setProperty("--f", String((fwpm.max - wpm.value) / (fwpm.max - fwpm.min)));
  }

  wpm.addEventListener("input", () => {
    const now = Number(wpm.value);
    if (Number(fwpm.value) === wpmWas || Number(fwpm.value) > now) fwpm.value = now;
    wpmWas = now;
    show();
  });
  fwpm.addEventListener("input", () => {
    if (Number(fwpm.value) > Number(wpm.value)) fwpm.value = wpm.value;
    show();
  });
  for (const input of [wpm, fwpm]) {
    input.addEventListener("change", () => {
      keep(wpmKey, wpm.value);
      keep(fwpmKey, fwpm.value);
      input.blur();           // or the arrow keys and the keying keys would be the slider's
      change?.();
    });
  }

  return { wpm: () => Number(wpm.value), fwpm: () => Number(fwpm.value), show };
}

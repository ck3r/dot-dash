/*
 * The browser tab keys too, with the site's one tab animation
 * (js/keyer.js, the same as the reference's). What's the station's:
 *
 *   createTab() → {
 *     arrive(words, morse)  on load: a link's message, or (none) the
 *                           name keying itself
 *     follow(morse)         after any change: once the message isn't
 *                           the link's any more, the tab says the name
 *     playing(on)           while it plays, the icon keys the name on a
 *                           loop (it can't keep pace with the message)
 *     greet()               the name keys itself (keyed: · − − · −)
 *   }
 *
 * The name keying itself gives way to you: the first press or key
 * (anywhere) stops it, the tab resting on the name.
 *
 * The station's switch logo keys along with the name, as the
 * reference's header switch does.
 */
import * as keyer from "../keyer.js";

export function createTab() {
  const logo = document.querySelector(".logo");
  keyer.on(event => { if (event.type === "key" && event.name) logo?.classList.toggle("down", event.down); });

  let shows = null;        // the Morse the tab is about (a link's), or null
  let greeting = false;    // the name keying itself

  function arrive(words, morse = null) {
    shows = words?.length ? morse : null;
    greeting = !words?.length;
    keyer.play(words ?? []);
  }

  /* first in line (capture), so a press that keys the name anew
     (the egg) stops the old greeting before it starts the new one */
  const giveWay = () => {
    if (!greeting) return;
    greeting = false;
    keyer.rest();
  };
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, giveWay, { capture: true });

  function follow(morse) {
    if (shows === null || morse === shows) return;
    shows = null;
    keyer.rest();
  }

  const playing = on => keyer.hold(on);

  const greet = () => { shows = null; greeting = true; keyer.play([]); };

  return { arrive, follow, playing, greet };
}

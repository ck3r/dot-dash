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
 * The station's switch logo keys along with the name, as the
 * reference's header switch does.
 */
import * as keyer from "../keyer.js";

export function createTab() {
  const logo = document.querySelector(".logo");
  keyer.on(event => { if (event.type === "key" && event.name) logo?.classList.toggle("down", event.down); });

  let shows = null;        // the Morse the tab is about (a link's), or null

  function arrive(words, morse = null) {
    shows = words?.length ? morse : null;
    keyer.play(words ?? []);
  }

  function follow(morse) {
    if (shows === null || morse === shows) return;
    shows = null;
    keyer.rest();
  }

  const playing = on => keyer.hold(on);

  const greet = () => { shows = null; keyer.play([]); };

  return { arrive, follow, playing, greet };
}

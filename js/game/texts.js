/*
 * The text to play: one from a short list, or "auto", which is the
 * one that came in the address (/hero/?/hello+world or /hero/?/_...._.._,
 * the station's own links) or the one typed here (typing.js), or
 * "random", a few words drawn from a bag, new every time it's asked
 * for.
 *
 *   text ▾
 *   ┌──────────────┐
 *   │ auto         │  ← the address's, or your own
 *   │ random       │  ← a new draw each run
 *   │ et te tee tet│
 *   │ …            │
 *   └──────────────┘
 *
 *   createTexts({ list, texts, bag, draw, key, change }) → {
 *     words()       the chosen text, in morse.js's shape (words of
 *                   codes): for random, a new draw
 *     name()        as letters, for telling runs apart ("?" for a
 *                   code that's no letter; "random" for any draw)
 *     typed()       your own as it would be typed, "" if a listed one
 *                   is chosen
 *     type(text)    your own, from now: and chosen
 *     settle()      nothing of your own after all: back to the listed
 *                   one chosen before
 *   }
 *
 * list: the select; texts: the listed ones; bag: the words random
 * draws from (none: no random), draw of them at a time; key: where
 * the choice is kept; change(): another was picked from the list.
 */
import { readLink, encode, DECODE } from "../morse.js";
import { keep, kept } from "./store.js";

const AUTO = "link", RANDOM = "random";

export function createTexts({ list, texts, bag = [], draw = 5, key, change }) {
  let own = location.search.startsWith("?/") ? readLink(location.search.slice(2)) : [];
  const listed = () => {
    const was = kept(key);
    return (was === RANDOM && bag.length) || texts[was] ? was : 0;
  };

  /* so many from the bag, no word twice */
  function drawn() {
    const left = [...bag], out = [];
    while (out.length < draw && left.length) out.push(...left.splice(Math.floor(Math.random() * left.length), 1));
    return out.join(" ");
  }

  list.add(new Option("auto", AUTO));
  if (bag.length) list.add(new Option("random", RANDOM));
  for (const [i, text] of texts.entries()) list.add(new Option(text.toLowerCase(), i));
  list.value = own.length ? AUTO : listed();

  list.addEventListener("change", () => {
    if (list.value !== AUTO) keep(key, list.value);
    list.blur();
    change?.();
  });

  const isOwn = () => list.value === AUTO;
  const letters = gap => own.map(w => w.map(c => DECODE[c] ?? gap).join("")).join(" ");

  return {
    words: () => (isOwn() ? own : encode(list.value === RANDOM ? drawn() : texts[list.value])),
    name: () => (isOwn() ? letters("?") : list.value === RANDOM ? RANDOM : texts[list.value]),
    typed: () => (isOwn() ? letters("") : ""),
    type(text) { own = encode(text); list.value = AUTO; },
    settle() { if (!own.length) list.value = listed(); },
  };
}

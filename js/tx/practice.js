/*
 * Copy practice, the Koch way: start with two characters at full
 * speed, and add one when you copy 90% of them. Never slow sounds
 * to count dots by, only more of them to tell apart.
 *
 *   K M  →  K M R  →  K M R S  →  …  (the order LCWO uses)
 *
 * Groups of five, random, from the characters you have so far; the
 * newest comes up twice as often, being the one to learn.
 *
 *   groups(3)  →  [["-.-", "--", "--", "-.-", ".-."], …]   K M M K R
 *
 * Pure: the profile (js/tx/profile.js) picks how many, and the
 * station (js/tx/main.js) puts them on the line.
 */
import { ENCODE } from "../morse.js";

export const KOCH = "KMRSUAPTLOWI.NJEF0Y,VG5/Q9ZH38B?427C1D6X".split("");

export const KOCH_MIN = 2;

export function groups(known, { count = 5, size = 5, random = Math.random } = {}) {
  const set = KOCH.slice(0, Math.max(KOCH_MIN, Math.min(KOCH.length, known)));
  const pool = [...set, set[set.length - 1]];            // the newest, twice
  return Array.from({ length: count }, () =>
    Array.from({ length: size }, () => ENCODE[pool[Math.floor(random() * pool.length)]]));
}

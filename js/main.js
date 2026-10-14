/*
 * ============================================================
 * MAIN — wires the page to the core
 * ============================================================
 *
 *   URL ──► parse ──► words ──┬──► page   (#morse, #text)
 *                             └──► keyer  (favicon, title)
 *
 *   input ──► encode/parse ──► [share] ──► canonical URL
 */

import * as morse from "./morse.js";
import * as keyer from "./keyer.js";


const WPM = 20;
const FARNSWORTH_WPM = 20;
const DOT_MS = 1200 / WPM;

const $ = selector => document.querySelector(selector);


function getPayload() {
  const query = location.search;
  return query.startsWith("?/") ? query.slice(2) : "";
}


function show(words) {
  $("#morse").textContent = morse.pretty(words);
  $("#text").textContent = morse.decode(words);

  keyer.play(words);

  const k = keyer.stats();
  $("#status").textContent =
    `URL:          ${getPayload()}\n` +
    `Canonical:    ${morse.format(words)}\n` +
    `Text:         ${morse.decode(words)}\n` +
    `WPM:          ${WPM}\n` +
    `Farnsworth:   ${FARNSWORTH_WPM}\n` +
    `Dot:          ${DOT_MS}ms\n` +
    `Tab:          ${k.tab}\n` +
    `Reduced:      ${k.reducedMotion}\n` +
    `Title frames: ${k.titleFrames}\n` +
    `Keyer events: ${k.keyerEvents}`;
}


/*
 * ============================================================
 * SHARE
 * ============================================================
 *
 * The URL only changes when the user asks for it.
 * Accepts plain text ("hello world") or Morse
 * (".... . / .--" , "...._._/_.--" or "...././/.--").
 */

$("#compose").addEventListener("submit", async event => {
  event.preventDefault();

  const input = $("#input").value;
  if (!input.trim()) return;

  const words = morse.looksLikeMorse(input)
    ? morse.parse(input.trim().replace(/\s*\/\s*/g, "_/_"))
    : morse.encode(input);

  if (!words.length) return;

  const url = `${location.origin}/?/${morse.format(words)}`;

  history.pushState(null, "", url);
  show(words);

  $("#link").textContent = url;

  try {
    await navigator.clipboard.writeText(url);
    $("#link").textContent += "  (copied)";
  } catch {
    /* clipboard blocked: the link is still shown */
  }
});

window.addEventListener("popstate", () => show(morse.parse(getPayload())));


show(morse.parse(getPayload()));

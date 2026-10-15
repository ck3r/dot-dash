/*
 * ============================================================
 * TX SHARE — paste in, copy / save / share out
 * ============================================================
 *
 * Paste: if it starts with . or - it's Morse, in any common
 * spelling; otherwise it's text to encode.
 *
 *   ".... . .-.. .-.. --- / .-- --- .-. .-.. -.."   spaces and slashes
 *   "_...._._/_.--_"                               the site's URL form
 *   "•••• • •–•• / •––"                            pretty marks
 *   "https://dot-da.sh/?/_..._"                    a dot-da.sh link
 *   "hello world"                                  plain text
 *
 * Out: the message as Morse text, plain text, a link, a .txt,
 * a .wav (rendered with the page's own sound, at the keyed
 * timing), or the link-preview .gif.
 */

import { encode, parse, format, pretty, DECODE } from "./morse.js";
import { createSound } from "./tx-sound.js";
import { timeline } from "./tx-player.js";


/* ---------- in ---------- */

const DOTS = /[•·∙●⋅]/g;
const DASHES = /[–—−‒―]/g;

export function readPaste(raw) {
  const s = raw.trim();

  /* a dot-da.sh link: the message is after "?/" */
  const link = s.match(/\?\/(\S+)/);
  if (link) return { words: clean(parse(link[1])), morse: true };

  const n = s.replace(DOTS, ".").replace(DASHES, "-")
    .replace(/\s*\|\s*/g, " / ")      // "|" between words
    .replace(/[ \t]{3,}/g, " / ");     // a wide gap (3+ spaces) between words
  if (!/^[._-]/.test(n)) return { words: encode(s), morse: false };

  /* parse() reads every spacing: "a b / c", "_a_b_/_c_", "a/b//c" */
  return { words: clean(parse(n)), morse: true };
}

/* keep only real marks; drop anything else that came along */
function clean(words) {
  return words
    .map(w => w.map(c => c.replace(/[^.-]/g, "")).filter(Boolean))
    .filter(w => w.length);
}


/* ---------- out ---------- */

export const morseText = words => pretty(words);

export function plainText(words) {
  return words.map(w => w.map(c => DECODE[c] ?? "�").join("")).join(" ");
}

export function linkTo(words, origin = location.origin) {
  return `${origin}/?/${format(words)}`;
}

export function gifLink(words, origin = location.origin) {
  return `${origin}/og/${format(words)}.gif`;
}

/* a short, file-safe name from the text */
export function fileName(words, ext) {
  const slug = plainText(words).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `dot-da.sh${slug ? "-" + slug : ""}.${ext}`;
}

export function textFile(words) {
  const body = [morseText(words), plainText(words), linkTo(words), ""].join("\n");
  return new Blob([body], { type: "text/plain" });
}

export function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/*
 * The message as a .wav, rendered offline with the same sound
 * code (tone or sounder, pitch, volume) and the same timeline
 * as playback, so it's your keyed timing when there is one.
 */
export async function renderWav({ words, rec, timing, kind, pitch, volume }) {
  const rate = 44100;
  const line = timeline(words, timing, rec);
  const lead = 0.25, tail = 0.5;
  const seconds = lead + line.duration / 1000 + tail;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, Math.ceil(rate * seconds), rate);

  const sound = createSound({ context: ctx });
  sound.setKind(kind);
  sound.setPitch(pitch);
  sound.setVolume(volume);
  for (const m of line.marks) sound.mark(lead + m.start / 1000, (m.end - m.start) / 1000);

  const data = (await ctx.startRendering()).getChannelData(0);

  /* 16-bit mono PCM */
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); str(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}

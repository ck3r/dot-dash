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
  return `dot-dash${slug ? "_" + slug : ""}.${ext}`;   // no dot before the extension
}

/*
 * The message as a shell script, named like the site: hello_dot-da.sh
 * Run it in a terminal (sh hello_dot-da.sh) and it keys the message:
 * the marks print as they're sent, with the letters after them, and
 * it beeps through `play` (SoX) if that's installed, or the terminal
 * bell if not. UNIT sets the speed: UNIT=0.06 sh hello_dot-da.sh
 */
export function scriptName(words) {
  const slug = plainText(words).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${slug || "message"}_dot-da.sh`;
}

export function scriptFile(words, unitMs) {
  const unit = (unitMs / 1000).toFixed(3);
  const say = s => s.replace(/'/g, "'\\''");
  const lines = [
    "#!/bin/sh",
    `# ${plainText(words)}`,
    "# in Morse code, from dot-da.sh",
    `# ${linkTo(words)}`,
    "#",
    `# run it:   sh ${scriptName(words)}`,
    "# faster:   UNIT=0.06 sh …   (seconds per unit; this one was keyed at " + unit + ")",
    "",
    `UNIT=\${UNIT:-${unit}}`,
    `t() { awk "BEGIN { print $UNIT * $1 }"; }`,
    "U1=$(t 1); U2=$(t 2); U3=$(t 3); U4=$(t 4)",
    "if command -v play >/dev/null 2>&1; then",
    "  tone() { play -qn synth \"$1\" sine 600 2>/dev/null; }",
    "else",
    "  tone() { printf '\\a'; sleep \"$1\"; }",
    "fi",
    "dit() { printf '.'; tone \"$U1\"; sleep \"$U1\"; }",
    "dah() { printf -- '-'; tone \"$U3\"; sleep \"$U1\"; }",
    "letter() { printf '  %s\\n' \"$1\"; sleep \"$U2\"; }   # 3 units after a letter",
    "word() { printf '/\\n'; sleep \"$U4\"; }                 # 7 after a word",
    ""
  ];
  words.forEach((word, w) => {
    if (w) lines.push("word");
    for (const code of word) {
      const marks = [...code].map(m => (m === "." ? "dit" : "dah")).join("; ");
      lines.push(`${marks}; letter '${say(DECODE[code] ?? "?")}'`);
    }
  });
  lines.push("");
  return new Blob([lines.join("\n")], { type: "text/x-shellscript" });
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
export async function renderWav({ words, rec, timing, kind, wave = "sine", pitch, volume }) {
  const rate = 44100;
  const line = timeline(words, timing, rec);
  const lead = 0.25, tail = 0.5;
  const seconds = lead + line.duration / 1000 + tail;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, Math.ceil(rate * seconds), rate);

  const sound = createSound({ context: ctx });
  sound.setKind(kind);
  sound.setWave(wave);
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

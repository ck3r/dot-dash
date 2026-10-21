/*
 * ============================================================
 * TX FILES — the message saved as a file
 * ============================================================
 *
 * A .txt, a shell script that keys it (.sh), a .wav (rendered with
 * the page's own sound, at the keyed timing), or the link-preview
 * .gif (made by the worker). Loaded the first time a file is saved
 * (js/tx/share.js), not at startup.
 */

import { format, DECODE } from "./morse.js";
import { createSound } from "./tx-sound.js";
import { timeline } from "./tx-player.js";
import { morseText, plainText, linkTo } from "./tx-share.js";

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
 * each mark lights as it sounds (NO_COLOR, or not a terminal: plain),
 * the letter follows once it's done, and at the end, the link back.
 * It beeps through `play` (SoX) if that's installed, or the terminal
 * bell if not. UNIT sets the speed: UNIT=0.06 sh hello_dot-da.sh
 *
 * The message is data, not code: one line of Morse, MSG='.... ..',
 * which the player checks (dots, dashes, spaces, slashes, nothing
 * else) and decodes as it plays, like a receiver. Everything else is
 * the player, the same in every script: no network, no files, no
 * sudo, and it says so at the top. A file that's been passed around
 * can be read in a minute.
 *
 *   MSG='.... .. / - .... . .-. .'     ← all that changes
 *   ---- the player ----               ← the same every time
 */
export function scriptName(words) {
  const slug = plainText(words).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return `${slug || "message"}_dot-da.sh`;
}

const quote = s => `'${s.replace(/'/g, "'\\''")}'`;   // for sh: nothing inside single quotes is special

/* the table the player decodes with: every code, by length, then marks */
const TABLE = Object.entries(DECODE)
  .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1))
  .map(([code, ch]) => `    ${quote(code).padEnd(12)}) c=${quote(ch)} ;;`);

export function scriptFile(words, unitMs) {
  const unit = (unitMs / 1000).toFixed(3);
  const name = scriptName(words);
  const link = encodeURI(linkTo(words));
  const lines = [
    "#!/bin/sh",
    `# ${plainText(words)}`,
    "# in Morse code, from dot-da.sh",
    "#",
    "# This script only prints and beeps: no network, no files, no sudo.",
    "# Read it before you run it. The message is the one line MSG= below,",
    "# dots, dashes, spaces and slashes, checked before anything plays;",
    "# the rest is the player, the same in every script from dot-da.sh.",
    "#",
    `# run it:   sh ${name}`,
    `# faster:   UNIT=0.06 sh ${name}   (seconds per unit; keyed at ${unit})`,
    `# plain:    NO_COLOR=1 sh ${name}   (no lamp)`,
    "",
    `MSG=${quote(words.map(w => w.join(" ")).join(" / "))}`,   // plain . and -, spaced, / between words
    `LINK=${quote(link)}`,
    "",
    "# ---- the player ----",
    "",
    "set -f   # no file names: a mark is a mark",
    "fail() { printf 'dot-da.sh: %s\\n' \"$1\" >&2; exit 1; }",
    "case $MSG in *[!.\\ /-]*) fail \"that isn't Morse; stopping\" ;; esac",
    "case $LINK in https://*[!A-Za-z0-9:/?.%_-]* | http://*[!A-Za-z0-9:/?.%_-]*) LINK= ;; https://* | http://*) ;; *) LINK= ;; esac",
    `UNIT=\${UNIT:-${unit}}`,
    "case $UNIT in '' | . | *[!0-9.]* | *.*.*) fail 'UNIT is seconds, a number like 0.06' ;; esac",
    "t() { awk -v u=\"$UNIT\" -v n=\"$1\" 'BEGIN { print u * n }'; }",
    "U1=$(t 1); U2=$(t 2); U3=$(t 3); U4=$(t 4)",
    "",
    "# the lamp: a mark lit while it sounds (on a terminal, without NO_COLOR)",
    "if [ -t 1 ] && [ -z \"${NO_COLOR-}\" ]; then LIT='\\033[7;33m'; OFF='\\033[0m'; else LIT=; OFF=; fi",
    "trap 'printf \"%b\\n\" \"$OFF\"; exit 130' INT",
    "if command -v play >/dev/null 2>&1; then",
    "  tone() { play -qn synth \"$1\" sine 600 2>/dev/null; }",
    "else",
    "  tone() { printf '\\a'; sleep \"$1\"; }",
    "fi",
    "mark() {   # the mark, lit; it sounds; then plain, and a unit's quiet",
    "  printf '%b%s%b' \"$LIT\" \"$1\" \"$OFF\"",
    "  tone \"$2\"",
    "  [ -n \"$LIT\" ] && printf '\\b%s' \"$1\"",
    "  sleep \"$U1\"",
    "}",
    "letter() {",
    "  case $1 in",
    ...TABLE,
    "    *) c='?' ;;",
    "  esac",
    "  printf '  %s\\n' \"$c\"",
    "}",
    "",
    "for code in $MSG; do",
    "  if [ \"$code\" = / ]; then printf '/\\n'; sleep \"$U4\"; continue; fi   # 7 units after a word",
    "  rest=$code",
    "  while [ -n \"$rest\" ]; do",
    "    m=${rest%\"${rest#?}\"}; rest=${rest#?}",
    "    if [ \"$m\" = . ]; then mark . \"$U1\"; else mark - \"$U3\"; fi",
    "  done",
    "  letter \"$code\"; sleep \"$U2\"   # 3 units after a letter",
    "done",
    "[ -n \"$LINK\" ] && printf '\\nthe same message, at the station:\\n%s\\n' \"$LINK\"",
    ""
  ];
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

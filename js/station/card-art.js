/*
 * The media card's pictures, in the app (apps/mobile, MediaPlugin):
 * the character being sent, large, with its Morse above, as the
 * pop-out shows it (js/shared/pip.js). One picture per character,
 * made here before the message plays; the app swaps them on its own
 * clock as it plays, so the card follows the message with the page
 * out of sight. (A card takes a still picture, not a .gif: this is
 * the .gif, a frame at a time.)
 *
 *        .--.             .-
 *         P                A
 *
 * Each comes up the moment the one before has finished, so a
 * character is on the card for the whole of its Morse, and through
 * the gap before it:
 *
 *   P ▁█▁███▁███▁█▁▁▁ A ▁█▁███▁▁▁ R …
 *   ├─────── P ────────┤├──── A ────┤├── R …
 *
 *   cardFrames(line, names, { dot, dash }) → [{ at, png }]
 *     line       the timeline (its letters: start, end, code)
 *     names      each letter as it's read (namesFor, flat)
 *     dot, dash  the marks' colours with colour on (else paper)
 *     at         ms into the message; png a data: URL
 *
 * Always the dark look, whatever the station's theme: the card is
 * drawn dark over it. The card lays its own title, buttons and bar
 * over the picture and dims it there; the character sits in the
 * middle as the pop-out's does.
 */

const W = 800, H = 360;          // about the card's shape (20:9), small enough to hand to Android at each swap
const MOST = 120;                // frames at most: a long message steps a few characters at a time
const FONT = '"dot-dash mono", ui-monospace, Menlo, Consolas, monospace';

/* the pop-out's colours (pip.js PIP_CSS), dark */
const DARK = { bakelite: "#1c1916", paper: "#e9e3d5" };

export function cardFrames(line, names, { dot, dash } = {}) {
  if (!line?.letters?.length || typeof document === "undefined") return [];
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const step = Math.ceil(line.letters.length / MOST);
  const frames = [];
  for (let i = 0; i < line.letters.length; i += step) {
    const l = line.letters[i];
    ctx.fillStyle = DARK.bakelite;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    /* the Morse, each run of dots or dashes in its colour, centred */
    ctx.font = `700 64px ${FONT}`;
    const gap = 4;                                        // the pop-out's letter-spacing, at this size
    const glyphs = [...(l.code ?? "")];
    const wide = glyphs.reduce((w, g) => w + ctx.measureText(g).width + gap, -gap);
    let x = (W - wide) / 2;
    for (const g of glyphs) {
      ctx.fillStyle = g === "." ? dot ?? DARK.paper : dash ?? DARK.paper;
      ctx.fillText(g, x, H * 0.34);
      x += ctx.measureText(g).width + gap;
    }

    /* the character, large */
    const name = names?.[i] ?? "";
    ctx.fillStyle = DARK.paper;
    ctx.textAlign = "center";
    ctx.font = `700 ${name.length > 2 ? 110 : 170}px ${FONT}`;   // a prosign's <SK> smaller, to fit
    ctx.fillText(name, W / 2, H * 0.8);

    /* up as soon as the one before is done */
    const at = i === 0 ? 0 : line.letters[i - 1].end;
    frames.push({ at: Math.round(at), png: canvas.toDataURL("image/png") });
  }
  return frames;
}

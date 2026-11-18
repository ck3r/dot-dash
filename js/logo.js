/*
 * The logo, in one place: the switch, a ring and a lever, the way a
 * circuit diagram draws a key. Every icon is drawn from these numbers:
 *
 *   site/switch.svg, the favicon as a page loads     ┐
 *   the favicon while the tab keys (js/keyer.js)     │  a disc
 *   extension/icons/icon.svg and icon-*.png          │
 *   the extension's toolbar while it plays           ┘
 *   site/icons/*.png, the app on a phone or desktop     a square
 *
 * The files are made by `npm run icons` (tools/icons.cjs), which also
 * copies this file into the extension (it can't load from outside its
 * folder); tests/icons.cjs fails while any of them is behind. Change
 * the logo here, then run it.
 *
 *     open (at rest)            closed (a mark)
 *
 *       ███████                   ░░░░░░░
 *     ███████/███               ░░░░░░░░░░░
 *     ███ ◯/█████       →       ░░ ●━━━━━░░
 *       ███████                   ░░░░░░░
 *
 *     paper on bakelite,        the colours flip,
 *     the lever up 30°          the lever down flat
 *
 * In a 128 box. The switch's own drawing is about 62 wide; `fill`
 * scales it about its middle: a disc fills more than a square, and
 * a maskable icon keeps inside the circle a phone may crop it to.
 */

export const BAKELITE = "#1c1916";
export const PAPER = "#e9e3d5";

/* The lever turns on the ring's centre, and the middle of its stem
   runs through that centre, up or down:

          ╱            the stem's middle line, through the ring's
        ╱              centre at any angle: it starts `from` along
     ◯╱                that line (inside the ring's stroke, so they
                       join) and runs `length` on from there      */
export const RING = { cx: 13.6603, cy: 52.8063, r: 7, width: 6 };
export const LEVER = { from: 4.84, length: 56, thick: 7 };
const MIDDLE = [35.1, 39.4];
export const ANGLE = { open: -30, closed: 0 };

export const FILL = { disc: 1.42, square: 1.1, maskable: 0.94 };

function parts({ closed = false, shape = "disc", fill } = {}) {
  return {
    back: closed ? PAPER : BAKELITE,
    ink: closed ? BAKELITE : PAPER,
    angle: closed ? ANGLE.closed : ANGLE.open,
    round: shape === "disc",
    fill: fill ?? FILL[shape]
  };
}

/* the icon as SVG text; the id says which way the switch is */
export function logoSVG(options) {
  const { back, ink, angle, round, fill } = parts(options);
  const ground = round ? `<circle cx="64" cy="64" r="64" fill="${back}"/>` : `<rect width="128" height="128" fill="${back}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${angle === ANGLE.open ? "open" : "closed"}" viewBox="0 0 128 128">
  ${ground}
  <g transform="translate(64 64) scale(${fill}) translate(${-MIDDLE[0]} ${-MIDDLE[1]})">
    <circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" stroke="${ink}" stroke-width="${RING.width}" fill="none"/>
    <rect x="${RING.cx + LEVER.from}" y="${RING.cy - LEVER.thick / 2}" width="${LEVER.length}" height="${LEVER.thick}" rx="${LEVER.thick / 2}" transform="rotate(${angle} ${RING.cx} ${RING.cy})" fill="${ink}"/>
  </g>
</svg>
`;
}

/* the same, on a canvas `size` px square (the extension's service
   worker can't decode an SVG) */
export function drawLogo(g, size, options) {
  const { back, ink, angle, round, fill } = parts(options);
  g.save();
  g.scale(size / 128, size / 128);
  g.fillStyle = back;
  if (round) { g.beginPath(); g.arc(64, 64, 64, 0, 2 * Math.PI); g.fill(); }
  else g.fillRect(0, 0, 128, 128);
  g.translate(64, 64); g.scale(fill, fill); g.translate(-MIDDLE[0], -MIDDLE[1]);
  g.strokeStyle = g.fillStyle = ink;
  g.lineWidth = RING.width;
  g.beginPath(); g.arc(RING.cx, RING.cy, RING.r, 0, 2 * Math.PI); g.stroke();
  g.translate(RING.cx, RING.cy); g.rotate(angle * Math.PI / 180);
  g.beginPath(); g.roundRect(LEVER.from, -LEVER.thick / 2, LEVER.length, LEVER.thick, LEVER.thick / 2); g.fill();
  g.restore();
}

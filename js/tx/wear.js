/*
 * Wear on the keys: where your finger lands on each key, like the
 * polish a thumb wears into a real key's brass. Kept on this device
 * with the other counts (js/tx/stats.js), drawn in the profile.
 *
 *   createWear() → {
 *     read()           { dit: { n, bins }, … }, and favourite: the
 *                      most-pressed key
 *     clear()
 *     draw(canvas, key, colour)   the key's outline, worn where pressed
 *   }
 *
 * Every key you key with: the pad's (dit, dah, and the side keys)
 * and the switch, a straight key. Not the text keyboard: that's
 * typing. Touch and pen only: a mouse lands on the same pixel every
 * time and wears nothing.
 *
 * Each press is kept as a cell of a 12 × 12 grid laid over that key,
 * so the record is small and says only where on the key, never where
 * on the screen:
 *
 *   ┌────────────┐
 *   │            │
 *   │    ░▒▒░    │      a thumb's spot, a little low and to the
 *   │   ░▓██▓░   │      right, as most right thumbs press
 *   │    ░▒▒░    │
 *   └────────────┘
 */

const KEY = "dot-dash:wear";
const GRID = 12;
const BOX = 72;           // px: the drawing's longer side, in the profile

/* data-act → the name it's kept and shown under */
export const KEYS = { ".": "dit", "-": "dah", letter: "˽", word: "/", undo: "⌫", send: "↵", switch: "switch" };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved && typeof saved === "object" ? saved : {};
  } catch { return {}; }
}

export function createWear() {
  let wear = load();
  let saving = null;

  /* not on every press: a burst of keying is one write, a moment later */
  const save = () => {
    clearTimeout(saving);
    saving = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(wear)); } catch { /* storage blocked */ }
    }, 1000);
  };

  /* capture, before the keys' own handlers, and passive: it only
     looks, so keying feels the same */
  document.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    const key = event.target.closest?.("#pad .key, .station .switch");
    if (!key) return;
    const name = key.matches(".switch") ? "switch" : KEYS[key.dataset.act];
    if (!name) return;
    const r = key.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const col = Math.min(GRID - 1, Math.max(0, Math.floor((event.clientX - r.left) / r.width * GRID)));
    const row = Math.min(GRID - 1, Math.max(0, Math.floor((event.clientY - r.top) / r.height * GRID)));
    const w = wear[name] ??= { n: 0, bins: Array(GRID * GRID).fill(0), aspect: 1 };
    w.n++;
    w.bins[row * GRID + col]++;
    w.aspect = Math.round(r.width / r.height * 100) / 100;     // the key's shape, to draw it by
    save();
  }, { capture: true, passive: true });

  function read() {
    const favourite = Object.entries(wear).sort((a, b) => b[1].n - a[1].n)[0]?.[0] ?? null;
    return { keys: wear, favourite };
  }

  function clear() {
    clearTimeout(saving);
    wear = {};
    try { localStorage.removeItem(KEY); } catch { }
  }

  /*
   * The key, outlined, and its wear: each cell a soft spot of brass
   * as bright as its share of the busiest cell, blurred together (the
   * canvas's own filter) so the grid doesn't show.
   */
  function draw(canvas, name, { brass, wire }) {
    const w = wear[name];
    /* the key's shape, in a box BOX px on its longer side */
    const aspect = Math.max(0.4, Math.min(2.5, w?.aspect || 1));
    const dpr = devicePixelRatio || 1;
    const cssW = Math.round(aspect >= 1 ? BOX : BOX * aspect), cssH = Math.round(aspect >= 1 ? BOX / aspect : BOX);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, cssW, cssH);
    if (w) {
      const most = Math.max(...w.bins);
      const cw = cssW / GRID, ch = cssH / GRID;
      g.filter = `blur(${Math.max(cw, ch) * 0.6}px)`;
      g.fillStyle = brass;
      w.bins.forEach((n, i) => {
        if (!n) return;
        g.globalAlpha = Math.pow(n / most, 0.6);
        g.beginPath();
        g.ellipse((i % GRID + 0.5) * cw, (Math.floor(i / GRID) + 0.5) * ch, cw * 0.9, ch * 0.9, 0, 0, 2 * Math.PI);
        g.fill();
      });
      g.filter = "none";
      g.globalAlpha = 1;
    }
    g.strokeStyle = wire;
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(0.5, 0.5, cssW - 1, cssH - 1, 6);
    g.stroke();
  }

  return { read, clear, draw };
}

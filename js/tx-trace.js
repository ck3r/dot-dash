/*
 * ============================================================
 * TX TRACE: the message's signal, drawn on the scrub bar
 * ============================================================
 *
 * Like the waveform on an audio app's seek bar: key down is a
 * raised block, key up is the thin line, across the whole
 * message. What's played is paper; what's to come is grey.
 *
 *   ▷ 6.4s  ▁█▁███▁▁▁███▁▁█▁█▁▁▁▁▁█▁█▁┃▁▁▁███▁▁▁▁   ⟲
 *
 * When the marks would be too thin to read (a long message at
 * speed), each letter becomes one block instead, so words still
 * show as clusters.
 *
 * With the sounder (no tone, just a click as the key closes and
 * another as it opens), each mark is drawn as its two clicks.
 *
 * Held (dragging the playhead): a pop-out above it shows the
 * signal around that point, magnified, with each letter under
 * its marks: the scrub bar's "preview frame".
 *
 * While you key (the timed keys), the mark you're holding grows
 * on the end, live.
 *
 *   createTrace({ canvas, pop, popCanvas, thumb })
 *     line(timeline)       the message (marks, letters, duration)
 *     at(ms)               the playhead
 *     live(down)           a timed key closed / opened
 *     zoom(on)             show / hide the pop-out
 */

const MIN_MARK = 1.6;     // px: thinner than this, draw letters as blocks
const POP_UNITS = 40;     // the pop-out's window, in units (two or three letters)

export function createTrace({ canvas, pop, popCanvas, thumb, colors, unit }) {
  let line = { marks: [], letters: [], duration: 0 };
  let position = 0;
  let held = null;         // live: { since, gap } while a timed key is down
  let lastUp = 0;          // when the key last opened (for the gap before the next)
  let raf = 0;
  let zoomed = false;

  const ctx = canvas.getContext("2d");
  const pctx = popCanvas.getContext("2d");

  /* the canvas at the screen's pixel density */
  function fit(c) {
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w: r.width, h: r.height, dpr };
  }

  /* the message as drawn: with the live mark on the end, if any */
  function shown() {
    if (!held) return line;
    const now = performance.now();
    const gap = Math.min(held.gap, 14 * unit());       // a long pause is capped, as in playback
    const start = line.duration + (line.marks.length ? gap : 0);
    const mark = { start, end: start + (now - held.since), live: true };
    return { marks: [...line.marks, mark], letters: line.letters, duration: mark.end };
  }

  function draw() {
    const { w, h, dpr } = fit(canvas);
    const c = colors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const m = shown();
    const inset = thumb / 2;                       // the range thumb's centre travels inset … w - inset
    const span = w - thumb;
    const mid = Math.round(h / 2) + 0.5;
    const x = t => inset + (m.duration ? (t / m.duration) * span : 0);
    const playX = x(Math.min(position, m.duration));

    /* the line itself */
    ctx.fillStyle = c.wire;
    ctx.fillRect(inset, mid - 0.5, span, 1);
    if (!m.marks.length) return;
    ctx.fillStyle = c.played;
    ctx.fillRect(inset, mid - 0.5, playX - inset, 1);

    /* marks, or letters as blocks when marks get too thin */
    const pxPerUnit = span / m.duration * unit();
    const blocks = pxPerUnit < MIN_MARK && !held;
    const items = blocks ? m.letters.map(l => ({ start: l.start, end: l.end })) : m.marks;
    const tall = blocks ? Math.round(h * 0.42) : Math.round(h * 0.62);
    const top = mid - tall / 2;
    const clicks = c.sounder && !blocks;
    const fill = (from, to, color, a, b) => {
      if (to <= from) return;
      ctx.fillStyle = color;
      if (!clicks) return ctx.fillRect(from, top, to - from, tall);
      /* the sounder: a click as the key closes, another as it opens */
      if (from === a) ctx.fillRect(a, top - 1, 1.5, tall + 2);
      if (to === b) ctx.fillRect(b - 1.5, top - 1, 1.5, tall + 2);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(from, mid - 1, to - from, 2);
      ctx.globalAlpha = 1;
    };
    for (const it of items) {
      const a = x(it.start), b = Math.max(x(it.end), a + 1);
      if (it.live) fill(a, b, c.brass, a, b);
      else {
        fill(a, Math.min(b, playX), c.played, a, b);          // split by the playhead
        fill(Math.max(a, playX), b, c.toCome, a, b);
      }
    }
    if (zoomed) drawPop(m, playX);
  }

  /*
   * The pop-out: a window of the signal around the playhead,
   * magnified, with the letters under their marks.
   */
  function drawPop(m, playX) {
    const { w, h, dpr } = fit(popCanvas);
    const c = colors();
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    const windowMs = POP_UNITS * unit();
    const from = position - windowMs / 2;
    const x = t => ((t - from) / windowMs) * w;
    const mid = Math.round(h * 0.36) + 0.5;
    const tall = Math.round(h * 0.3);

    pctx.fillStyle = c.wire;
    pctx.fillRect(Math.max(0, x(0)), mid - 0.5, Math.min(w, x(m.duration)) - Math.max(0, x(0)), 1);
    for (const mk of m.marks) {
      if (mk.end < from || mk.start > from + windowMs) continue;
      const a = x(mk.start), b = Math.max(x(mk.end), a + 2);
      pctx.fillStyle = c.markColor(mk);
      pctx.fillRect(a, mid - tall / 2, b - a, tall);
    }
    /* the letters, centred under their marks */
    pctx.font = `700 ${Math.round(h * 0.3)}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
    pctx.textAlign = "center";
    pctx.textBaseline = "alphabetic";
    for (const l of m.letters) {
      if (l.end < from || l.start > from + windowMs) continue;
      const cx = x((l.start + l.end) / 2);
      const here = position >= l.start && position <= l.end + unit();
      pctx.fillStyle = here ? c.paper : c.toCome;
      pctx.fillText(l.label ?? "", cx, h - Math.round(h * 0.1));
    }
    /* the playhead */
    pctx.fillStyle = c.brass;
    pctx.fillRect(Math.round(w / 2) - 1, 2, 2, h - 4);

    /* follow the playhead along the bar, kept inside the row */
    const row = pop.offsetParent?.getBoundingClientRect();
    const bar = canvas.getBoundingClientRect();
    if (row) {
      const left = bar.left - row.left + playX - pop.offsetWidth / 2;
      pop.style.left = Math.max(0, Math.min(row.width - pop.offsetWidth, left)) + "px";
    }
  }

  function loop() {
    draw();
    raf = held ? requestAnimationFrame(loop) : 0;
  }

  return {
    line(next) { line = next; draw(); },
    at(ms) { position = ms; draw(); },
    redraw: draw,
    live(down) {
      const now = performance.now();
      if (down) {
        held = { since: now, gap: lastUp ? now - lastUp : 0 };
        if (!raf) loop();
      } else {
        held = null;
        lastUp = now;
        draw();
      }
    },
    /* a new message (sent, cleared): no gap carried over */
    rest() { held = null; lastUp = 0; draw(); },
    zoom(on) {
      zoomed = on;
      pop.hidden = !on;
      draw();
    }
  };
}

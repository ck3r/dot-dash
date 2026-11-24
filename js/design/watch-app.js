/*
 * The Garmin app, drawn first in the browser (docs/garmin.md, "The
 * app"): a watch with its five buttons and a round screen, and the
 * app's screens, each working. A press is a press however it comes:
 * a drawn button, the keyboard (arrows UP and DOWN, Enter START,
 * Escape BACK, L LIGHT) or, on a touch watch, the screen.
 *
 *   createApp({ watch, screen, options, toggle })
 *     options(): { touch, straight, wpm, sound, buzz, flash }
 *     toggle(output): turns sound, buzz or flash on or off
 *
 *   menu
 *   ├── station    key a message (or pick, presets, the time), send it
 *   ├── ref        the grid tree; the chart; the characters
 *   ├── practice   send (shown, key it) · copy (heard, pick of three);
 *   │              what's learned round the edge
 *   └── game       dot dash: hurdles jumped, beams ducked
 *
 * Every screen is { render(el), press(button, down), tap?(event, down) }:
 * render draws it into the screen, press takes a button going down
 * or up (true if it was the screen's to take), tap a touch.
 */
import { DECODE, ENCODE } from "/js/core/morse.js";
import { timeline } from "/js/shared/playback.js";
import { STROKES, createLetter } from "/js/core/strokes.js";
import { STRESS, spokenOf, syllablesOf, layStair } from "/js/core/stair.js";
import { createStrikes } from "/js/game/strikes.js";
import { drawGrid } from "../shared/grid-tree.js";

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const CHARS = [...LETTERS, ..."1234567890"];
const NS = "http://www.w3.org/2000/svg";
const html = (tag, attrs = {}, text) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
};
const marksOf = code => [...code].map(m => `<i class="${m === "." ? "dot" : "dash"}"></i>`).join("");
const wordsOf = text => text.trim().split(/\s+/).map(w => [...w].map(ch => ENCODE[ch]).filter(Boolean));

export function createApp({ watch, screen, options, toggle = () => { } }) {
  const unit = () => 1200 / options().wpm;

  /* ---------- the outputs: sound, the buzz, the screen lit ---------- */
  let ctx = null, gain = null, onOut = null;
  function out(down) {
    const o = options();
    onOut?.(down);
    if (o.sound || gain) {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        gain = ctx.createGain();
        osc.frequency.value = 600;
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
      }
      ctx.resume?.();
      gain.gain.setTargetAtTime(down && o.sound ? 0.18 : 0, ctx.currentTime, 0.004);
    }
    watch.classList.toggle("buzz", down && o.buzz);
    screen.classList.toggle("lit", down && o.flash);
  }

  /* a message sent: each mark keyed at its time; onMark as each starts */
  let sending = [];
  function stop() { sending.forEach(clearTimeout); sending = []; out(false); }
  function send(words, { onMark, onEnd } = {}) {
    stop();
    const u = unit();
    const { marks, duration } = timeline(words, { unit: u, letter: 3 * u, word: 7 * u });
    marks.forEach((m, i) => sending.push(
      setTimeout(() => { out(true); onMark?.(m, i); }, m.start),
      setTimeout(() => out(false), m.end)));
    sending.push(setTimeout(() => onEnd?.(), duration + 10));
    return { marks, duration };
  }

  /* ---------- the key: paddles (iambic) or straight ---------- */
  function createKeyer({ onMark, onLetter, onWord }) {
    const held = new Set();
    let busy = false, last = null, code = "", gaps = [], downAt = 0, timer = null;
    const clearGaps = () => { gaps.forEach(clearTimeout); gaps = []; };
    /* after a mark's space: two units more is a letter's gap, six a word's */
    const waitGaps = (letter, word) => {
      clearGaps();
      gaps.push(setTimeout(() => { if (code) { onLetter(code); code = ""; } }, letter),
        setTimeout(() => onWord(), word));
    };
    function element(lane) {
      busy = true; clearGaps();
      const u = unit();
      last = lane; code += lane;
      out(true); onMark(code);
      timer = setTimeout(() => { out(false); timer = setTimeout(next, u); }, lane === "." ? u : 3 * u);
    }
    /* squeezed, they take turns; one held, it repeats; none, the gap */
    function next() {
      busy = false;
      if (held.size === 2) return element(last === "." ? "-" : ".");
      if (held.size === 1) return element([...held][0]);
      const u = unit();
      waitGaps(2 * u, 6 * u);
    }
    return {
      paddle(lane, down) {
        if (down) { held.add(lane); if (!busy) element(lane); }
        else held.delete(lane);
      },
      straight(down) {
        const u = unit();
        if (down) { clearGaps(); downAt = performance.now(); out(true); return; }
        out(false);
        code += performance.now() - downAt < 2 * u ? "." : "-";
        onMark(code);
        waitGaps(3 * u, 7 * u);
      },
      reset() { held.clear(); clearGaps(); clearTimeout(timer); busy = false; code = ""; out(false); },
    };
  }

  /* keying from the buttons or the screen, as the options say:
     paddles UP and DOWN (or the screen's halves), straight START (or
     the whole screen) */
  function keyPress(keyer, button, down) {
    const { straight } = options();
    if (!straight && (button === "up" || button === "down")) { keyer.paddle(button === "up" ? "." : "-", down); return true; }
    if (straight && button === "start") { keyer.straight(down); return true; }
    return false;
  }
  /* the half a finger went down on is the paddle it lets go of, even
     if it slides across */
  let lane = ".";
  function keyTap(keyer, event, down) {
    if (!options().touch) return;
    if (options().straight) return keyer.straight(down);
    if (down) { const r = screen.getBoundingClientRect(); lane = event.clientX < r.left + r.width / 2 ? "." : "-"; }
    keyer.paddle(lane, down);
  }

  /* The keys beside their buttons, on a screen that keys: the dit by
     UP, the dah by DOWN, at the screen's edge where the buttons are;
     or, a straight key, the key by START. Lit while held

        LIGHT ┐          ┌ START  (○ the straight key)
           ▪  UP
           ▬  DOWN                                          */
  const EDGE = { up: -90, down: -120, start: 60 };
  function edgeKeys(el) {
    const keys = options().straight ? [["start", "key"]] : [["up", "dot"], ["down", "dash"]];
    for (const [button, k] of keys) {
      const a = EDGE[button] * Math.PI / 180, r = 106;
      const g = html("i", { class: `edge ${k}`, "data-b": button });
      g.style.left = `${120 + r * Math.sin(a)}px`;
      g.style.top = `${120 - r * Math.cos(a)}px`;
      el.append(g);
    }
  }

  /* The outputs, as the station's tray has them: sound, the lamp, the
     buzz, each lit while on. At the station's foot; a tap there (on a
     touch watch) turns one on or off, as the station's menu does

            ♪   ☼   ≋                                          */
  const OUTPUTS = [["sound", "♪"], ["flash", "☼"], ["buzz", "≋"]];
  function tray(el) {
    const t = html("div", { class: "tray" });
    for (const [name, glyph] of OUTPUTS) t.append(html("span", { class: options()[name] ? "on" : "", "data-o": name }, glyph));
    el.append(t);
  }

  /* What's been learned, round the edge as the border face lays its
     cells: a cell to a letter in the learning order, from twelve,
     clockwise; faint until first got right, graphite on the way, paper
     once got right three times, the one being practised brass. Both
     practices count into it

          ━━ ━━ ━━ ── ── ··          E T I learned, A on its way */
  const known = {};
  const learned = ch => known[ch] = (known[ch] ?? 0) + 1;
  function progressRing(now) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 240 240");
    svg.setAttribute("class", "ring");
    const n = ORDER.length, r = 114, step = 2 * Math.PI / n, gap = 0.035;
    const at = a => `${(120 + r * Math.sin(a)).toFixed(2)} ${(120 - r * Math.cos(a)).toFixed(2)}`;
    svg.innerHTML = ORDER.map((ch, i) => {
      const k = known[ch] ?? 0, state = ch === now ? "now" : k >= 3 ? "known" : k ? "seen" : "";
      return `<path class="${state}" data-ch="${ch}" d="M${at(i * step + gap)} A${r} ${r} 0 0 1 ${at((i + 1) * step - gap)}"/>`;
    }).join("");
    return svg;
  }

  /* ---------- the screens ---------- */
  const stack = [];
  const top = () => stack.at(-1);
  const open = s => { stop(); stack.push(s); s.enter?.(); draw(); };
  const leave = () => { stop(); top().leave?.(); if (stack.length > 1) stack.pop(); draw(); };
  function draw() {
    screen.replaceChildren();
    screen.dataset.screen = top().name;
    top().render(screen);
  }

  /* a list, as Garmin's are: the chosen one large in the middle, its
     neighbours smaller above and below, wrapping round (the last above
     the first), up to two each side */
  function listScreen({ name, title, items, choose, detail }) {
    let at = 0;
    return {
      name,
      render(el) {
        el.append(html("div", { class: "title" }, title));
        const list = html("ol", { class: "list" });
        const n = items.length, shown = Math.min(n, 5), first = -Math.floor((shown - 1) / 2);
        for (let d = first; d < first + shown; d++) {
          const k = (at + d + n) % n, item = items[k];
          const li = html("li", { class: k === at ? "chosen" : "", "data-i": k });
          if (item.group) li.append(html("span", { class: "group" }, item.group));
          li.append(html("span", {}, item.label));
          list.append(li);
        }
        el.append(list);
        if (detail) el.append(detail(items[at]));
      },
      press(button, down) {
        if (!down) return button === "up" || button === "down" || button === "start";
        if (button === "up") at = (at + items.length - 1) % items.length;
        else if (button === "down") at = (at + 1) % items.length;
        else if (button === "start") return choose(items[at]), true;
        else return false;
        draw();
        return true;
      },
      tap(event, down) {
        const li = event.target.closest("li[data-i]");
        if (!down || !li) return;
        const k = +li.dataset.i;
        if (k === at) choose(items[at]);
        else { at = k; draw(); }
      },
    };
  }

  /* Tree: the grid tree of the letters. UP steps a dot, DOWN a dash,
     START sounds where you are, BACK steps back up (at the root, it
     leaves); a tap on a letter goes there and sounds it */
  function treeScreen() {
    let path = "";
    const codes = LETTERS.map(ch => ENCODE[ch]);
    const labels = Object.fromEntries(LETTERS.map(ch => [ENCODE[ch], ch]));
    const sound = () => { if (path) send([[path]]); };
    return {
      name: "tree",
      render(el) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 240 240");
        svg.setAttribute("class", "grid");
        el.append(svg);
        /* the root low enough that H, out at the end of the top row,
           stays on the round */
        drawGrid(svg, { codes, labels, path, top: 70, sy: 21 });
        const big = html("div", { class: "walked" }, path ? DECODE[path] ?? "" : "");
        const m = html("div", { class: "marks walked-marks" });
        m.innerHTML = marksOf(path);
        el.append(big, m);
        edgeKeys(el);
      },
      press(button, down) {
        if (!down) return ["up", "down", "start", "back"].includes(button);
        if (button === "up" || button === "down") {
          const next = path + (button === "up" ? "." : "-");
          if (codes.some(c => c.startsWith(next))) { path = next; sound(); draw(); }
          return true;
        }
        if (button === "start") { sound(); return true; }
        if (button === "back" && path) { path = path.slice(0, -1); draw(); return true; }
        return false;
      },
      tap(event, down) {
        const place = event.target.closest("[data-code]");
        if (!down || !place) return;
        path = place.dataset.code;
        sound();
        draw();
      },
    };
  }

  /* Reference: a character to a screen. Its marks, the character drawn
     by its strokes as they sound, its name as a stair; UP and DOWN
     through them, START plays it again */
  function referenceScreen(start = 0) {
    let at = start, letter = null, frame = 0;
    function play() {
      cancelAnimationFrame(frame);
      const ch = CHARS[at], code = ENCODE[ch];
      const { duration } = send([[code]], {
        onMark: (m, i) => screen.querySelectorAll(".marks i").forEach((e, j) => e.classList.toggle("now", j === i)),
        onEnd: () => screen.querySelectorAll(".marks i").forEach(e => e.classList.remove("now")),
      });
      const t0 = performance.now();
      const step = () => {
        const t = performance.now() - t0;
        letter?.at(Math.min(t, duration));
        if (t < duration) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
    return {
      name: "reference",
      enter: () => setTimeout(play, 300),
      leave: () => cancelAnimationFrame(frame),
      render(el) {
        const ch = CHARS[at], code = ENCODE[ch], u = unit();
        el.append(html("div", { class: "title" }, "reference"));
        const marks = html("div", { class: "marks" });
        marks.innerHTML = marksOf(code);
        el.append(marks);
        const row = html("div", { class: "card" });
        const { marks: timed } = timeline([[code]], { unit: u, letter: 3 * u, word: 7 * u });
        letter = STROKES[ch] ? createLetter(STROKES[ch], timed) : null;
        const pic = html("div", { class: "pic" });
        if (letter) { pic.append(letter.el); letter.at(timeline([[code]], { unit: u, letter: 3 * u, word: 7 * u }).duration); }
        else pic.append(html("span", { class: "char" }, ch));
        const stair = html("div", { class: "stair" });
        const spoken = spokenOf(ch);
        if (spoken) layStair(stair, syllablesOf(ch, spoken), STRESS[ch]);
        row.append(pic, stair);
        el.append(row);
        el.append(html("div", { class: "name" }, `${ch} · ${spoken ?? ""}`));
      },
      press(button, down) {
        if (!down) return ["up", "down", "start"].includes(button);
        if (button === "up" || button === "down") {
          at = (at + (button === "up" ? CHARS.length - 1 : 1)) % CHARS.length;
          draw(); play();
          return true;
        }
        if (button === "start") { play(); return true; }
        return false;
      },
    };
  }

  /* Learn: a character shown, keyed back, judged at the letter's gap:
     right, the next; wrong, its marks shown and sounded, and again */
  const ORDER = [..."ETIANMSURWDKGOHVFLPJBXCYZQ"];
  function learnScreen() {
    let at = 0, marks = "", verdict = "", streak = 0;
    const keyer = createKeyer({
      onMark: code => { marks = code; verdict = ""; draw(); },
      onLetter: code => {
        const want = ENCODE[ORDER[at]];
        if (code === want) { learned(ORDER[at]); verdict = "right"; streak++; at = (at + 1) % ORDER.length; setTimeout(() => { verdict = ""; marks = ""; draw(); }, 700); }
        else { verdict = "wrong"; streak = 0; setTimeout(() => send([[want]]), 300); }
        draw();
      },
      onWord: () => { },
    });
    return {
      name: "learn",
      leave: () => keyer.reset(),
      render(el) {
        const ch = ORDER[at];
        el.append(html("div", { class: "title" }, `send · ${streak} in a row`));
        el.append(html("div", { class: "target" }, ch));
        const stair = html("div", { class: "stair small" });
        layStair(stair, syllablesOf(ch, spokenOf(ch)), STRESS[ch]);
        el.append(stair);
        const m = html("div", { class: `marks big ${verdict}` });
        m.innerHTML = verdict === "wrong" ? marksOf(ENCODE[ch]) : marksOf(marks);
        el.append(m);
        el.append(html("div", { class: "hint" }, verdict === "right" ? "right" : verdict === "wrong" ? `it's ${ch}: again` : "key it"));
        el.append(progressRing(ch));
        edgeKeys(el);
      },
      press(button, down) {
        if (button === "light" && down) { send([[ENCODE[ORDER[at]]]]); return true; }
        return keyPress(keyer, button, down);
      },
      tap(event, down) { keyTap(keyer, event, down); },
    };
  }

  /* ================= station: write, then send ================= */

  /*
   * One screen that keys, after the rectangle face: the message in a
   * box in the top half, a row a line, each letter with its marks over
   * it, the key set into the box's bottom edge at the middle of the
   * screen. Under it, the letter being keyed, large, with its marks and
   * its name as a stair. The keys sit beside their buttons.
   *
   *        ┌──────────────────┐
   *        │ ▪▬▪ ▪ ▪▪▪ ▪▪ ▬▪▪ │
   *        │  R  E  S  I  D   │      the message, the last three rows
   *        └───────(o/────────┘
   *    ▪        A   AL
   *    ▬      ▪ ▬     FA             the letter being keyed
   *
   * START opens the station's menu (send, presets, pick, the time, take
   * one off, clear); LIGHT takes the last letter off. With a straight
   * key START is the key, so LIGHT opens the menu. Sending, the box's
   * edge fills from the key, clockwise, as the face's does with the
   * minute, the letter going out lit, the switch keying each mark.
   */
  let draft = "";
  const draftLine = () => html("div", { class: "draft" }, draft.slice(-14) || "nothing yet");
  const add = text => { draft = (draft && !draft.endsWith(" ") ? draft + " " : draft) + text; };
  const BOX = { x1: 40, y1: 40, x2: 200, y2: 120 }, CELL = 15, PER = 10;

  /* the message in rows of up to ten cells, a word kept whole, a space
     a cell; each letter with its index among the letters sent */
  function rowsOf(text) {
    const rows = [[]];
    let l = 0;
    for (const word of text.split(" ")) {
      const cells = [...word].map(ch => ({ ch, l: l++ }));
      const row = rows.at(-1);
      if (row.length && row.length + 1 + cells.length > PER) rows.push([...cells]);
      else row.push(...(row.length ? [{ ch: " " }] : []), ...cells);
    }
    return rows;
  }

  function stationScreen() {
    let marks = "", now = -1, lit = 0, down = false;
    const keyer = createKeyer({
      onMark: code => { marks = code; draw(); },
      onLetter: code => { draft += DECODE[code] ?? "?"; marks = ""; draw(); },
      onWord: () => { if (draft && !draft.endsWith(" ")) { draft += " "; draw(); } },
    });
    function play() {
      const text = draft.trim();
      if (!text) return;
      const { duration } = send(wordsOf(text), {
        onMark: m => { now = m.letter; lit = m.start / duration * 60; draw(); },
        onEnd: () => { now = -1; lit = 0; draw(); },
      });
    }
    const self = {
      name: "station",
      enter: () => { onOut = d => { down = d; self.lever?.(d); }; },
      leave: () => { keyer.reset(); onOut = null; },
      render(el) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 240 240");
        svg.setAttribute("class", "station");
        const { x1, y1, x2, y2 } = BOX, gap = 14;
        const edge = `M${120 - gap} ${y2} H${x1} V${y1} H${x2} V${y2} H${120 + gap}`;
        let body = `<path class="box" d="${edge}"/><path class="box lit" d="${edge}" pathLength="60" stroke-dasharray="${lit} 60"/>`;
        /* the last three rows, from the box's top down, as written */
        const rows = rowsOf(draft).slice(-3);
        rows.forEach((row, r) => {
          const y = y1 + 30 + r * 26;
          row.forEach((cell, c) => {
            if (cell.ch === " ") return;
            const x = x1 + 13 + c * CELL, code = ENCODE[cell.ch] ?? "";
            const w = [...code].reduce((s, m) => s + (m === "." ? 3 : 7) + 1.3, -1.3);
            let mx = x - w / 2;
            for (const m of code) {
              const mw = m === "." ? 3 : 7;
              body += `<rect class="m ${m === "." ? "dot" : "dash"}" x="${mx}" y="${y - 15}" width="${mw}" height="3"/>`;
              mx += mw + 1.3;
            }
            body += `<text class="ch${cell.l === now ? " now" : ""}" x="${x}" y="${y}">${cell.ch}</text>`;
          });
        });
        if (!draft) body += `<text class="ch empty" x="120" y="${y1 + 44}">key a message</text>`;
        /* the switch in the edge: the ring, the lever up, shut flat as it keys */
        body += `<g class="switch${down ? " down" : ""}"><circle cx="${120 - 9}" cy="${y2}" r="3.2"/><rect class="lever" x="${120 - 6}" y="${y2 - 1.6}" width="20" height="3.2" rx="1.6" transform="rotate(${down ? 0 : -30} ${120 - 9} ${y2})"/></g>`;
        /* the letter being keyed, as the tree reads it so far */
        const ch = marks ? DECODE[marks] ?? "?" : "";
        body += `<text class="keying" x="${ch ? 100 : 120}" y="172">${ch}</text>`;
        svg.innerHTML = body;
        el.append(svg);
        self.lever = d => {
          const g = svg.querySelector(".switch");
          g.classList.toggle("down", d);
          g.querySelector(".lever").setAttribute("transform", `rotate(${d ? 0 : -30} ${120 - 9} ${y2})`);
        };
        const m = html("div", { class: "marks keyed" });
        m.innerHTML = marksOf(marks);
        el.append(m);
        if (ch && spokenOf(ch)) {
          const stair = html("div", { class: "stair keyed" });
          layStair(stair, syllablesOf(ch, spokenOf(ch)), STRESS[ch]);
          el.append(stair);
        }
        if (!marks) el.append(html("div", { class: "hint foot" }, options().straight ? "LIGHT menu" : "START menu · LIGHT ⌫"));
        tray(el);
        edgeKeys(el);
      },
      press(button, down) {
        const { straight } = options();
        if (button === (straight ? "light" : "start")) { if (down) open(stationMenu(self)); return true; }
        if (button === "light" && !straight) { if (down) { draft = draft.slice(0, -1); draw(); } return true; }
        return keyPress(keyer, button, down);
      },
      tap(event, down) {
        const out = event.target.closest?.("[data-o]");
        if (out) { if (down) { toggle(out.dataset.o); draw(); } return; }
        keyTap(keyer, event, down);
      },
      play,
    };
    return self;
  }

  /* the station's menu: what to do with the message */
  function stationMenu(station) {
    const time = () => { const d = new Date(); return [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, "0")).join(" "); };
    const back = () => leave();
    return listScreen({
      name: "station-menu", title: "station",
      items: [
        { label: "send", go: () => { back(); setTimeout(station.play, 250); } },
        { label: "presets", go: () => open(presetsScreen()) },
        { label: "pick", go: () => open(lettersScreen()) },
        { label: "the time", go: () => { add(time()); back(); } },
        { label: "outputs", go: () => open(outputsScreen()) },
        { label: "take one off", go: () => { draft = draft.slice(0, -1); draw(); } },
        { label: "clear", go: () => { draft = ""; back(); } },
      ],
      choose: item => item.go(),
      detail: draftLine,
    });
  }

  /* Outputs: each on or off with START, as the tray shows them */
  function outputsScreen() {
    const labelOf = (name, glyph) => `${glyph} ${name === "flash" ? "lamp" : name} · ${options()[name] ? "on" : "off"}`;
    const items = OUTPUTS.map(([name, glyph]) => ({ name, glyph, label: labelOf(name, glyph) }));
    return listScreen({
      name: "outputs", title: "outputs", items,
      choose: item => { toggle(item.name); item.label = labelOf(item.name, item.glyph); draw(); },
    });
  }

  /* Pick: UP and DOWN through the characters (a space first), START
     puts one on, each sounding as it comes up: for anyone who can't
     key it yet */
  const PICK = [" ", ...CHARS];
  function lettersScreen() {
    let at = 1;
    return {
      name: "letters",
      render(el) {
        el.append(html("div", { class: "title" }, "pick"));
        el.append(draftLine());
        const ch = PICK[at];
        el.append(html("div", { class: "target" }, ch === " " ? "␣" : ch));
        const m = html("div", { class: "marks big" });
        m.innerHTML = ch === " " ? "" : marksOf(ENCODE[ch]);
        el.append(m);
        el.append(html("div", { class: "hint" }, "START puts it on · LIGHT takes one off"));
      },
      press(button, down) {
        if (!down) return ["up", "down", "start", "light"].includes(button);
        if (button === "up" || button === "down") {
          at = (at + (button === "up" ? PICK.length - 1 : 1)) % PICK.length;
          if (PICK[at] !== " ") send([[ENCODE[PICK[at]]]]);
        } else if (button === "start") draft += PICK[at];
        else if (button === "light") draft = draft.slice(0, -1);
        else return false;
        draw();
        return true;
      },
    };
  }

  /* Presets: in groups; START puts the chosen one on, and it's back to
     the station */
  const PRESETS = [
    ["ham", ["CQ", "QSL", "CUL", "73", "OK", "YES", "NO"]],
    ["distress", ["SOS", "MAYDAY"]],
    ["survival", ["HELP", "INJURED", "WATER", "HERE", "FOLLOW"]],
  ].flatMap(([group, list]) => list.map((label, i) => ({ label, group: i ? "" : group })));
  function presetsScreen() {
    return listScreen({
      name: "presets", title: "presets", items: PRESETS,
      choose: item => { add(item.label); leave(); leave(); },
      detail: item => {
        const m = html("div", { class: "marks" });
        m.innerHTML = wordsOf(item.label).map(w => w.map(marksOf).join("<b></b>")).join("<b class=w></b>");
        return m;
      },
    });
  }

  /* ================= ref: the tree, the chart, the characters ================= */

  function refScreen() {
    return listScreen({
      name: "ref", title: "ref",
      items: [{ label: "tree", go: () => open(treeScreen()) }, { label: "chart", go: () => open(chartScreen()) }, { label: "characters", go: () => open(referenceScreen()) }],
      choose: item => item.go(),
    });
  }

  /* Chart: the letters as a coin has them, in rows, each with its marks
     over it (read the marks, then what they make). UP and DOWN go
     through them, each sounding; START sounds the one lit again; a tap
     sounds the one tapped */
  const CHART = ["ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWX", "YZ"];
  function chartScreen() {
    let at = 0;
    const sound = () => send([[ENCODE[LETTERS[at]]]]);
    return {
      name: "chart",
      render(el) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 240 240");
        svg.setAttribute("class", "chart");
        let body = "";
        CHART.forEach((row, r) => {
          const y = 52 + r * 29;
          [...row].forEach((ch, c) => {
            const x = 120 + (c - (row.length - 1) / 2) * 36, code = ENCODE[ch];
            const on = LETTERS[at] === ch;
            body += `<g class="cell${on ? " on" : ""}" data-ch="${ch}"><rect class="hit" x="${x - 17}" y="${y - 13}" width="34" height="27"/><text x="${x}" y="${y + 7}">${ch}</text>`;
            const w = [...code].reduce((s, m) => s + (m === "." ? 3 : 8) + 1.5, -1.5);
            let mx = x - w / 2;
            for (const m of code) {
              const mw = m === "." ? 3 : 8;
              body += `<rect class="m ${m === "." ? "dot" : "dash"}" x="${mx}" y="${y - 9}" width="${mw}" height="3"/>`;   // over the letter
              mx += mw + 1.5;
            }
            body += "</g>";
          });
        });
        svg.innerHTML = body;
        el.append(svg);
      },
      press(button, down) {
        if (!down) return ["up", "down", "start"].includes(button);
        if (button === "up" || button === "down") { at = (at + (button === "up" ? 25 : 1)) % 26; sound(); draw(); return true; }
        if (button === "start") { sound(); return true; }
        return false;
      },
      tap(event, down) {
        const cell = event.target.closest("[data-ch]");
        if (down && cell) { at = LETTERS.indexOf(cell.dataset.ch); sound(); draw(); }
      },
    };
  }

  /* ================= practice: send, and copy by ear ================= */

  /* Copy: a character sounded (or buzzed), and three to choose from;
     right, the next; wrong, the right one shown, and it again. LIGHT
     plays it again. From the first letters of the order, more as you
     go on */
  function copyScreen() {
    let pool = 6, ch = null, choices = [], at = 0, verdict = "", streak = 0;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    function next() {
      const known = ORDER.slice(0, pool);
      ch = pick(known);
      const others = known.filter(c => c !== ch).sort(() => Math.random() - 0.5).slice(0, 2);
      choices = [ch, ...others].sort(() => Math.random() - 0.5);
      at = 1; verdict = "";
      draw();
      setTimeout(() => send([[ENCODE[ch]]]), 400);
    }
    function answer(k) {
      if (choices[k] === ch) {
        learned(ch); verdict = "right"; streak++;
        if (streak % 5 === 0) pool = Math.min(ORDER.length, pool + 1);
        draw();
        setTimeout(next, 700);
      } else {
        verdict = "wrong"; streak = 0;
        draw();
        setTimeout(() => send([[ENCODE[ch]]]), 300);
      }
    }
    return {
      name: "copy",
      enter: next,
      render(el) {
        el.append(html("div", { class: "title" }, `copy · ${streak} in a row`));
        el.append(html("div", { class: "hint" }, verdict === "wrong" ? `it was ${ch}` : verdict === "right" ? "right" : "which was it?"));
        const list = html("ol", { class: "choices" });
        choices.forEach((c, k) => list.append(html("li", { class: `${k === at ? "chosen" : ""}${verdict === "wrong" && c === ch ? " answer" : ""}`, "data-i": k }, c)));
        el.append(list);
        if (verdict === "wrong") { const m = html("div", { class: "marks" }); m.innerHTML = marksOf(ENCODE[ch]); el.append(m); }
        el.append(html("div", { class: "hint" }, "LIGHT plays it again"));
        el.append(progressRing(verdict ? null : ch));
      },
      press(button, down) {
        if (!down) return ["up", "down", "start", "light"].includes(button);
        if (button === "up") at = (at + 2) % 3;
        else if (button === "down") at = (at + 1) % 3;
        else if (button === "start") { if (!verdict || verdict === "wrong") answer(at); return true; }
        else if (button === "light") { send([[ENCODE[ch]]]); return true; }
        else return false;
        draw();
        return true;
      },
      tap(event, down) {
        const li = event.target.closest("li[data-i]");
        if (down && li) { at = +li.dataset.i; answer(at); }
      },
    };
  }

  function practiceScreen() {
    return listScreen({
      name: "practice", title: "practice",
      items: [{ label: "send", go: () => open(learnScreen()) }, { label: "copy", go: () => open(copyScreen()) }],
      detail: () => progressRing(null),
      choose: item => item.go(),
    });
  }

  /* ================= game: dot dash ================= */

  /*
   * Dot dash (docs/games.md): a runner, and the letters coming at it as
   * obstacles, a mark each. A dot is a hurdle, jumped (UP, the dit
   * paddle); a dash is a beam overhead as long as a dash, ducked under
   * (DOWN held, the dah paddle). The obstacles carry the code and stay
   * as they are, so the letter is learned by its shape coming at you:
   *
   *            R                 the letter coming, large
   *     (o)   ▮   ▔▔▔▔▔   ▮       . - .   hurdle, beam, hurdle
   *   ━━━━━━━━━━━━━━━━━━━━━━━
   *
   * Each cleared mark sounds; a hit is a strike, three and it's over.
   * It speeds up as it goes. On a touch watch, the screen's left half
   * jumps and its right half ducks, as the paddles' halves key.
   */
  function gameScreen() {
    const U = 34, GROUND = 150, RUNNER = 64;   // the ground clear of the dah key by DOWN
    let svg, runner, letterEl, scoreEl, obstacles = [], frame = 0, last = 0;
    let x = 0, speed = 95, jumpAt = -1, ducking = false, struck = 0, strikes = null, score = 0, over = false;
    const words = ["SOS", "CQ", "TEST", "MORSE", "KEY", "EAT", "TIN", "RAIN", "DASH", "DOT"];
    /* lay the next word's marks out ahead, a unit apart inside a
       letter, three between letters, seven between words */
    function lay(from) {
      const word = words[Math.floor(Math.random() * words.length)];
      const { marks, duration } = timeline([[...word].map(ch => ENCODE[ch])], { unit: 1, letter: 3, word: 7 });
      for (const m of marks) {
        const o = { x: from + m.start * U, w: (m.end - m.start) * U, mark: m.mark, ch: word[m.letter], letter: `${from}:${m.letter}`, last: m.index === ENCODE[word[m.letter]].length - 1, done: false, hit: false };
        o.el = document.createElementNS(NS, "rect");
        o.el.setAttribute("class", `ob ${m.mark === "." ? "dot" : "dash"}`);
        if (m.mark === ".") { o.el.setAttribute("width", 8); o.el.setAttribute("height", 16); o.el.setAttribute("y", GROUND - 16); }
        else { o.el.setAttribute("width", o.w); o.el.setAttribute("height", 8); o.el.setAttribute("y", GROUND - 24); }   // at head height: ducked, it clears
        svg.querySelector(".obs").append(o.el);
        obstacles.push(o);
      }
      return from + (duration + 7) * U;
    }
    let laidTo = 0;
    function start() {
      cancelAnimationFrame(frame);
      obstacles.forEach(o => o.el.remove());
      obstacles = []; x = 0; speed = 95; struck = 0; strikes?.reset(); score = 0; over = false; jumpAt = -1; ducking = false;
      laidTo = 260;
      while (laidTo < 900) laidTo = lay(laidTo);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
    const JUMP = 420;   // ms in the air
    function tick(now) {
      const dt = Math.min(50, now - last); last = now;
      x += speed * dt / 1000;
      speed += dt / 1000 * 1.5;
      while (laidTo - x < 900) laidTo = lay(laidTo);
      /* the runner: up in an arc while jumping, flat while ducking */
      const air = jumpAt >= 0 && now - jumpAt < JUMP ? Math.sin((now - jumpAt) / JUMP * Math.PI) * 30 : 0;
      if (air === 0) jumpAt = -1;
      runner.setAttribute("transform", `translate(${RUNNER} ${GROUND - air}) scale(1 ${ducking ? 0.5 : 1})`);
      let coming = null;
      for (const o of obstacles) {
        const sx = o.x - x;
        o.el.setAttribute("x", sx);
        const width = o.mark === "." ? 8 : o.w;
        /* over the runner: a hurdle wants it up, a beam wants it down */
        if (!o.done && sx < RUNNER + 9 && sx + width > RUNNER - 9) {
          const clear = o.mark === "." ? air > 14 : ducking;
          if (!clear && !o.hit) {
            o.hit = true; o.el.classList.add("hit");
            struck += 3;
            if (strikes?.add(3)) over = true;
          }
        }
        if (!o.done && sx + width < RUNNER - 9) {
          o.done = true;
          if (!o.hit) { score++; out(true); setTimeout(() => out(false), o.mark === "." ? unit() : 3 * unit()); }
          /* a letter cleared with no hit in it heals a third */
          if (o.last && !o.hit && !obstacles.some(p => p.letter === o.letter && p.hit) && struck > 0) { struck--; strikes?.heal(1); }
        }
        if (!coming && !o.done) coming = o;
      }
      obstacles = obstacles.filter(o => { if (o.x - x < -150) { o.el.remove(); return false; } return true; });
      letterEl.textContent = coming?.ch ?? "";
      scoreEl.textContent = String(score);
      if (over) { draw(); return; }
      frame = requestAnimationFrame(tick);
    }
    const jump = () => { if (!over && jumpAt < 0) jumpAt = performance.now(); };
    return {
      name: "game",
      enter: () => setTimeout(start, 50),
      leave: () => cancelAnimationFrame(frame),
      render(el) {
        if (over) {
          el.append(html("div", { class: "title" }, "dot dash"));
          el.append(html("div", { class: "target" }, String(score)));
          el.append(html("div", { class: "hint" }, "marks cleared · START again"));
          return;
        }
        svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 240 240");
        svg.setAttribute("class", "game");
        svg.innerHTML = `<text class="coming" x="120" y="86" text-anchor="middle">?</text>
          <text class="score" x="120" y="186" text-anchor="middle"></text>
          <line class="ground" x1="0" y1="${GROUND}" x2="240" y2="${GROUND}"/>
          <g class="obs"></g>
          <g class="runner"><circle cx="0" cy="-10" r="10"/></g>`;
        el.append(svg);
        /* the strikes, as /hero's: three boxes filling by thirds */
        const boxes = html("div", { class: "strikes" });
        boxes.innerHTML = "<i></i><i></i><i></i>";
        el.append(boxes);
        strikes = createStrikes({ element: boxes });
        if (struck) strikes.add(struck);
        edgeKeys(el);
        runner = svg.querySelector(".runner");
        letterEl = svg.querySelector(".coming");
        scoreEl = svg.querySelector(".score");
        /* a redraw mid-run (an option changed) keeps the run going */
        for (const o of obstacles) svg.querySelector(".obs").append(o.el);
      },
      press(button, down) {
        if (over) { if (button === "start" && down) { over = false; draw(); start(); } return button === "start"; }
        if (button === "up") { if (down) jump(); return true; }
        if (button === "down") { ducking = down; return true; }
        return false;
      },
      tap(event, down) {
        if (!options().touch) return;
        if (over) { if (down) { over = false; draw(); start(); } return; }
        const r = screen.getBoundingClientRect();
        if (event.clientX < r.left + r.width / 2) { if (down) jump(); }
        else ducking = down;
      },
    };
  }

  const SCREENS = { station: stationScreen, ref: refScreen, practice: practiceScreen, game: gameScreen,
    letters: lettersScreen, presets: presetsScreen, outputs: outputsScreen,
    tree: treeScreen, chart: chartScreen, characters: referenceScreen, learn: learnScreen, copy: copyScreen };
  const menu = listScreen({
    name: "menu", title: "dot-da.sh",
    items: ["station", "ref", "practice", "game"].map(label => ({ label })),
    choose: item => open(SCREENS[item.label]()),
  });

  /* ---------- presses, from wherever ---------- */
  function press(button, down) {
    watch.querySelector(`[data-button="${button}"]`)?.classList.toggle("down", down);
    screen.querySelector(`.edge[data-b="${button}"]`)?.classList.toggle("down", down);
    if (top().press?.(button, down)) return;
    if (button === "back" && down && stack.length > 1) leave();
  }
  for (const b of watch.querySelectorAll("[data-button]")) {
    b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(b.dataset.button, true); });
    for (const type of ["pointerup", "pointercancel"]) b.addEventListener(type, () => press(b.dataset.button, false));
  }
  const KEYS = { ArrowUp: "up", ArrowDown: "down", Digit1: "up", Digit3: "down", Numpad1: "up", Numpad3: "down", Enter: "start", Escape: "back", Backspace: "back", KeyL: "light" };
  addEventListener("keydown", e => {
    const b = KEYS[e.code];
    if (!b || e.repeat || e.target.closest?.("select, input")) return;
    e.preventDefault();
    press(b, true);
  });
  addEventListener("keyup", e => { const b = KEYS[e.code]; if (b) press(b, false); });
  /* the screen: a list's tap, or a key on a touch watch */
  screen.addEventListener("pointerdown", e => {
    if (!options().touch) return;
    e.preventDefault();
    screen.setPointerCapture?.(e.pointerId);
    top().tap?.(e, true);
  });
  for (const type of ["pointerup", "pointercancel"]) screen.addEventListener(type, e => { if (options().touch) top().tap?.(e, false); });

  open(menu);
  return {
    home() { while (stack.length > 1) leave(); },
    open: name => open(SCREENS[name]()),
    redraw: draw,
    press,
  };
}

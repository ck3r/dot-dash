/*
 * The Garmin app, drawn first in the browser (docs/garmin.md, "The
 * app"): a watch with its five buttons and a round screen, and the
 * app's screens, each working. A press is a press however it comes:
 * a drawn button, the keyboard (arrows UP and DOWN, Enter START,
 * Escape BACK, L LIGHT) or, on a touch watch, the screen.
 *
 *   createApp({ watch, screen, options })
 *     options(): { touch, straight, wpm, sound, buzz, flash }
 *
 * Every screen is { render(el), press(button, down), tap?(event, down) }:
 * render draws it into the screen, press takes a button going down
 * or up (true if it was the screen's to take), tap a touch.
 */
import { DECODE, ENCODE, codeOf } from "/js/morse.js";
import { timeline } from "/js/tx-player.js";
import { STROKES, createLetter } from "/js/strokes.js";
import { STRESS, spokenOf, syllablesOf, layStair } from "/js/stair.js";
import { drawGrid } from "./grid.js";

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

export function createApp({ watch, screen, options }) {
  const unit = () => 1200 / options().wpm;

  /* ---------- the outputs: sound, the buzz, the screen lit ---------- */
  let ctx = null, gain = null;
  function out(down) {
    const o = options();
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
     neighbours smaller above and below */
  function listScreen({ name, title, items, choose, detail }) {
    let at = 0;
    return {
      name,
      render(el) {
        el.append(html("div", { class: "title" }, title));
        const list = html("ol", { class: "list" });
        for (let k = at - 2; k <= at + 2; k++) {
          const item = items[k];
          if (!item) { list.append(html("li", { class: "blank" })); continue; }
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

  /* Key: what's sent, decoded across the top, the marks being keyed
     under them */
  function keyScreen() {
    let text = "", marks = "";
    const keyer = createKeyer({
      onMark: code => { marks = code; draw(); },
      onLetter: code => { text += DECODE[code] ?? "?"; marks = ""; draw(); },
      onWord: () => { if (text && !text.endsWith(" ")) { text += " "; draw(); } },
    });
    return {
      name: "key",
      leave: () => keyer.reset(),
      render(el) {
        el.append(html("div", { class: "title" }, "key"));
        el.append(html("div", { class: "sent" }, text.slice(-14) || "…"));
        const m = html("div", { class: "marks big" });
        m.innerHTML = marksOf(marks);
        el.append(m);
        const { touch, straight } = options();
        el.append(html("div", { class: "hint" }, straight
          ? (touch ? "hold the screen, or START" : "START is the key")
          : (touch ? "left half ▪ · right half ▬" : "UP ▪ · DOWN ▬")));
        if (touch && !straight) el.append(html("div", { class: "halves" }));
      },
      press(button, down) {
        if (button === "light" && down) { text = ""; marks = ""; draw(); return true; }
        return keyPress(keyer, button, down);
      },
      tap(event, down) { keyTap(keyer, event, down); },
    };
  }

  /* Messages: in groups; START sends the chosen one */
  const MESSAGES = [
    ["ham", ["CQ", "QSL", "CUL", "73", "OK", "YES", "NO"]],
    ["distress", ["SOS", "MAYDAY"]],
    ["survival", ["HELP", "INJURED", "WATER", "HERE", "FOLLOW"]],
  ].flatMap(([group, list]) => list.map((label, i) => ({ label, group: i ? "" : group })));
  function messagesScreen() {
    const list = listScreen({
      name: "messages", title: "messages", items: MESSAGES,
      choose: item => {
        const words = wordsOf(item.label);
        send(words, {
          onMark: (m, i) => { screen.querySelectorAll(".marks i").forEach((e, j) => e.classList.toggle("now", j === i)); },
          onEnd: () => screen.querySelectorAll(".marks i").forEach(e => e.classList.remove("now")),
        });
      },
      detail: item => {
        const m = html("div", { class: "marks" });
        m.innerHTML = wordsOf(item.label).map(w => w.map(marksOf).join("<b></b>")).join("<b class=w></b>");
        return m;
      },
    });
    return list;
  }

  /* Time: HH / MM, sent once as it opens; START again */
  function timeScreen() {
    const now = () => { const d = new Date(); return [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, "0")); };
    const play = () => { const [h, m] = now(); send([[...h].map(ch => codeOf(ch)), [...m].map(ch => codeOf(ch))]); };
    return {
      name: "time",
      enter: () => setTimeout(play, 300),
      render(el) {
        const [h, m] = now();
        el.append(html("div", { class: "title" }, "time"));
        el.append(html("div", { class: "clock" }, `${h}:${m}`));
        const marks = html("div", { class: "marks" });
        marks.innerHTML = [h, m].map(p => [...p].map(ch => marksOf(codeOf(ch))).join("<b></b>")).join("<b class=w></b>");
        el.append(marks);
        el.append(html("div", { class: "hint" }, "START sends it again"));
      },
      press(button, down) { if (button === "start" && down) { play(); return true; } return button === "start"; },
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
        drawGrid(svg, { codes, labels, path });
        el.append(html("div", { class: "where" }, path ? `${DECODE[path] ?? "·"}  ${path.replaceAll(".", "▪").replaceAll("-", "▬")}` : "UP ▪ · DOWN ▬"));
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
        if (code === want) { verdict = "right"; streak++; at = (at + 1) % ORDER.length; setTimeout(() => { verdict = ""; marks = ""; draw(); }, 700); }
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
        el.append(html("div", { class: "title" }, `learn · ${streak} in a row`));
        el.append(html("div", { class: "target" }, ch));
        const stair = html("div", { class: "stair small" });
        layStair(stair, syllablesOf(ch, spokenOf(ch)), STRESS[ch]);
        el.append(stair);
        const m = html("div", { class: `marks big ${verdict}` });
        m.innerHTML = verdict === "wrong" ? marksOf(ENCODE[ch]) : marksOf(marks);
        el.append(m);
        el.append(html("div", { class: "hint" }, verdict === "right" ? "right" : verdict === "wrong" ? `it's ${ch}: again` : "key it"));
      },
      press(button, down) {
        if (button === "light" && down) { send([[ENCODE[ORDER[at]]]]); return true; }
        return keyPress(keyer, button, down);
      },
      tap(event, down) { keyTap(keyer, event, down); },
    };
  }

  const SCREENS = { key: keyScreen, messages: messagesScreen, time: timeScreen, tree: treeScreen, reference: referenceScreen, learn: learnScreen };
  const menu = listScreen({
    name: "menu", title: "dot-da.sh",
    items: Object.keys(SCREENS).map(label => ({ label })),
    choose: item => open(SCREENS[item.label]()),
  });

  /* ---------- presses, from wherever ---------- */
  function press(button, down) {
    watch.querySelector(`[data-button="${button}"]`)?.classList.toggle("down", down);
    if (top().press?.(button, down)) return;
    if (button === "back" && down && stack.length > 1) leave();
  }
  for (const b of watch.querySelectorAll("[data-button]")) {
    b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(b.dataset.button, true); });
    for (const type of ["pointerup", "pointercancel"]) b.addEventListener(type, () => press(b.dataset.button, false));
  }
  const KEYS = { ArrowUp: "up", ArrowDown: "down", Enter: "start", Escape: "back", Backspace: "back", KeyL: "light" };
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

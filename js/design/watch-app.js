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
 *   menu
 *   ├── station    write (key it, pick, presets, the time), then send
 *   ├── ref        the grid tree; the characters (marks, strokes, stair)
 *   ├── practice   send (shown, key it) · copy (heard, pick of three)
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
import { drawGrid } from "./watch-grid.js";

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
        el.append(html("div", { class: "title" }, `send · ${streak} in a row`));
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

  /* ================= station: write, then send ================= */

  /* the draft: what's been written, kept while the app is open */
  let draft = "";
  const draftLine = () => html("div", { class: "draft" }, draft.slice(-14) || "nothing yet");

  /* Write by keying: each letter keyed goes on the draft */
  function writeScreen() {
    let marks = "";
    const keyer = createKeyer({
      onMark: code => { marks = code; draw(); },
      onLetter: code => { draft += DECODE[code] ?? "?"; marks = ""; draw(); },
      onWord: () => { if (draft && !draft.endsWith(" ")) { draft += " "; draw(); } },
    });
    return {
      name: "write",
      leave: () => keyer.reset(),
      render(el) {
        el.append(html("div", { class: "title" }, "write · key it"));
        el.append(html("div", { class: "sent" }, draft.slice(-14) || "…"));
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
        /* LIGHT takes the last letter off */
        if (button === "light" && down) { draft = draft.slice(0, -1); draw(); return true; }
        return keyPress(keyer, button, down);
      },
      tap(event, down) { keyTap(keyer, event, down); },
    };
  }

  /* Write by picking: UP and DOWN through the characters (a space
     first), START puts one on, each sounding as it comes up: for
     anyone who can't key it yet */
  const PICK = [" ", ...CHARS];
  function lettersScreen() {
    let at = 1;
    return {
      name: "letters",
      render(el) {
        el.append(html("div", { class: "title" }, "write · pick"));
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

  /* Presets: in groups; START puts the chosen one on the draft */
  const PRESETS = [
    ["ham", ["CQ", "QSL", "CUL", "73", "OK", "YES", "NO"]],
    ["distress", ["SOS", "MAYDAY"]],
    ["survival", ["HELP", "INJURED", "WATER", "HERE", "FOLLOW"]],
  ].flatMap(([group, list]) => list.map((label, i) => ({ label, group: i ? "" : group })));
  const add = text => { draft = (draft && !draft.endsWith(" ") ? draft + " " : draft) + text; };
  function presetsScreen() {
    return listScreen({
      name: "presets", title: "write · presets", items: PRESETS,
      choose: item => { add(item.label); leave(); },
      detail: item => {
        const m = html("div", { class: "marks" });
        m.innerHTML = wordsOf(item.label).map(w => w.map(marksOf).join("<b></b>")).join("<b class=w></b>");
        return m;
      },
    });
  }

  /* Send: the draft on the outputs, the letter going out lit; START
     sends it again */
  function sendScreen() {
    const text = draft.trim() || "?";
    const play = () => {
      send(wordsOf(text), {
        onMark: m => screen.querySelectorAll(".tx span[data-l]").forEach(s => s.classList.toggle("now", +s.dataset.l === m.letter)),
        onEnd: () => screen.querySelectorAll(".tx span").forEach(s => s.classList.remove("now")),
      });
    };
    return {
      name: "send",
      enter: () => setTimeout(play, 300),
      render(el) {
        el.append(html("div", { class: "title" }, "send"));
        const tx = html("div", { class: "tx" });
        let l = 0;
        for (const ch of text) tx.append(ch === " " ? html("span", {}, " ") : html("span", { "data-l": l++ }, ch));
        el.append(tx);
        el.append(html("div", { class: "hint" }, "START sends it again"));
      },
      press(button, down) { if (button === "start" && down) { play(); return true; } return button === "start"; },
    };
  }

  function stationScreen() {
    const time = () => { const d = new Date(); return [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, "0")).join(" "); };
    const items = [
      { label: "key it", go: () => open(writeScreen()) },
      { label: "pick", go: () => open(lettersScreen()) },
      { label: "presets", go: () => open(presetsScreen()) },
      { label: "the time", go: () => { add(time()); draw(); } },
      { label: "send", go: () => open(sendScreen()) },
      { label: "clear", go: () => { draft = ""; draw(); } },
    ];
    const list = listScreen({ name: "station", title: "station", items, choose: item => item.go(), detail: draftLine });
    return list;
  }

  /* ================= ref: the tree, and the characters ================= */

  function refScreen() {
    return listScreen({
      name: "ref", title: "ref",
      items: [{ label: "tree", go: () => open(treeScreen()) }, { label: "characters", go: () => open(referenceScreen()) }],
      choose: item => item.go(),
    });
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
        verdict = "right"; streak++;
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
    const U = 34, GROUND = 168, RUNNER = 64;
    let svg, runner, letterEl, scoreEl, obstacles = [], frame = 0, last = 0;
    let x = 0, speed = 95, jumpAt = -1, ducking = false, strikes = 0, score = 0, over = false, queue = [];
    const words = ["SOS", "CQ", "TEST", "MORSE", "KEY", "EAT", "TIN", "RAIN", "DASH", "DOT"];
    /* lay the next word's marks out ahead, a unit apart inside a
       letter, three between letters, seven between words */
    function lay(from) {
      const word = words[Math.floor(Math.random() * words.length)];
      const { marks, duration } = timeline([[...word].map(ch => ENCODE[ch])], { unit: 1, letter: 3, word: 7 });
      for (const m of marks) {
        const o = { x: from + m.start * U, w: (m.end - m.start) * U, mark: m.mark, ch: word[m.letter], done: false, hit: false };
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
      obstacles = []; x = 0; speed = 95; strikes = 0; score = 0; over = false; jumpAt = -1; ducking = false;
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
          if (!clear && !o.hit) { o.hit = true; o.el.classList.add("hit"); strikes++; out(true); setTimeout(() => out(false), 60); }
        }
        if (!o.done && sx + width < RUNNER - 9) {
          o.done = true;
          if (!o.hit) { score++; out(true); setTimeout(() => out(false), o.mark === "." ? unit() : 3 * unit()); }
        }
        if (!coming && !o.done) coming = o;
      }
      obstacles = obstacles.filter(o => { if (o.x - x < -150) { o.el.remove(); return false; } return true; });
      letterEl.textContent = coming?.ch ?? "";
      scoreEl.textContent = `${score} · ${"✕".repeat(strikes)}${"·".repeat(Math.max(0, 3 - strikes))}`;
      if (strikes >= 3) { over = true; draw(); return; }
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
        svg.innerHTML = `<text class="coming" x="120" y="92" text-anchor="middle">?</text>
          <text class="score" x="120" y="44" text-anchor="middle"></text>
          <line class="ground" x1="0" y1="${GROUND}" x2="240" y2="${GROUND}"/>
          <g class="obs"></g>
          <g class="runner"><circle cx="0" cy="-10" r="10"/></g>`;
        el.append(svg);
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
    write: writeScreen, letters: lettersScreen, presets: presetsScreen, send: sendScreen,
    tree: treeScreen, characters: referenceScreen, learn: learnScreen, copy: copyScreen };
  const menu = listScreen({
    name: "menu", title: "dot-da.sh",
    items: ["station", "ref", "practice", "game"].map(label => ({ label })),
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

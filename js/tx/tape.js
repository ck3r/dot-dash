/*
 * The tape: the line being written (letters under their marks, the
 * caret, the > and the eye beside it), the history above it, and
 * the counts under it.
 *
 *   createTape({ state, update, setTyped, resetKeyer, forgetUndo }) → {
 *     drawTape(), drawStats()
 *     settleTape()       the current line at the top, the caret in view
 *     fadeTape()         the top edge fades while there's history above
 *     hiding()           what the eye hides: "letters", "morse" or null
 *     redact(element)    make a part hidden: a bar, out of reach
 *     clearCurrent()     the message on the board: gone
 *   }
 */
import { parse, namesOf, namesFor, READING } from "../morse.js";
import { morseOf, recOfEntry, readingOf, typedOf, structure, wordsOf, tokensOf, tookFor, plainText } from "./state.js";
import { $, el, icon, toast, flash } from "./dom.js";
import * as share from "../tx-share.js";

export function createTape({ state, update, setTyped, resetKeyer, forgetUndo }) {
  /*
   * ============================================================
   * THE TAPE: the message being written, and the history above it
   * ============================================================
   */


  /* one letter: its code over its character (under the 2nd mark),
     named as its word's reading reads it */
  function letter(code, name, partial = false) {
    const c = el("span", partial ? "c partial" : "c");
    const m = el("span", "m");
    for (const s of code) m.append(el("span", s === "." ? "dot" : "dash", s));
    name ??= partial ? "?" : "�";
    const under = Math.min(1, code.length - 1);
    const p = el("span", "p", " ".repeat(under));   // only the name is underlined
    p.append(el("span", "n", name));
    c.append(m, p);
    return c;
  }

  /* a line: words of letters with slashes between; optionally the
     letter being keyed, a trailing slash and the caret. Each word
     knows its place (key: which line), to stay shown if tapped. The
     reading: the tray's now, or the one a sent message went with */
  /* the plain text's own layout (collapsed, typing: tx.css): after a
     word ending in <AA> (new line) the next starts a line; after one
     ending in <BT> (new paragraph), a line set in. The prosign stays,
     at the end of what it closes:

       THE POLLS SAY <BT>
         DEMOCRATS WIN <AA>
       WATCHED RACES                                           */
  const BREAK = { "<AA>": "br", "<BT>": "para" };

  function line(words, { path = "", slash = false, caret = false, key = "", reading = READING } = {}) {
    const box = el("span", "line");
    const read = namesFor(words, reading);
    const space = brk => el("span", brk ? `slash ${brk}` : "slash", "/");
    let brk = null;   // the break after the word before
    words.forEach((word, w) => {
      if (w) box.append(space(brk));
      const wEl = el("span", "w");
      wEl.dataset.word = `${key}:${w}`;
      if (shownWords.has(wEl.dataset.word)) wEl.classList.add("shown");
      const keying = w === words.length - 1 && path;
      const names = keying ? namesOf([...word, path], reading) : read[w];
      word.forEach((code, i) => wEl.append(letter(code, names[i])));
      if (keying) wEl.append(letter(path, names.at(-1), true));
      box.append(wEl);
      brk = BREAK[names.at(-1)] ?? null;
    });
    if (path && !words.length) {
      const wEl = el("span", "w");
      wEl.dataset.word = `${key}:0`;
      if (shownWords.has(wEl.dataset.word)) wEl.classList.add("shown");
      wEl.append(letter(path, namesOf([path], reading)[0], true));
      box.append(wEl);
    }
    if (slash) box.append(space(brk));
    if (caret) {
      /* the caret rides on the last letter, so it can never wrap onto
         a line of its own; after a word break it stands alone */
      const last = slash ? null : [...box.querySelectorAll(".c")].at(-1);
      if (last) last.append(el("span", "caret tail"));
      else box.append(el("span", "caret"));
    }
    return box;
  }

  /*
   * Words shown through the bars (a tap on a word's bar: that word
   * only). No memory: anything but bars (the eye tapped, held, the
   * other mode) and a new message on the tape forget them all.
   */
  const shownWords = new Set();
  let shownFor = null;

  function drawTape() {
    const tape = $("#tape");
    tape.textContent = "";
    const now = state.hidden && !state.collapsed ? `${state.mode} ${state.history.length}` : null;
    if (now !== shownFor) { shownWords.clear(); shownFor = now; }

    /* the top of the history: clear it (tap twice) */
    if (state.history.length) {
      const head = el("li", "tape-head");
      const b = el("button", clearArmed ? "armed" : "", clearArmed ? "tap again to clear all history" : "clear history");
      b.type = "button";
      b.addEventListener("click", clearHistory);
      head.append(b);
      tape.append(head);
    }

    state.history.forEach((saved, i) => {
      const li = el("li", "entry past");
      li.dataset.i = String(i);       // (a long-press copies it: js/tx/share.js)
      li.append(el("span", "marker", ""));
      const l = line(parse(morseOf(saved)), { key: i, reading: readingOf(saved) });
      l.title = "tap to key it again";
      l.addEventListener("click", () => recall(i));
      li.append(l);
      const x = el("button", "x");
      x.innerHTML = icon("x");
      x.type = "button";
      x.setAttribute("aria-label", "remove from history");
      x.addEventListener("click", () => {
        state.history.splice(i, 1);
        state.saveHistory();
        update();
      });
      li.append(x);
      tape.append(li);
    });

    /* hide the row you're not entering, on every line, if asked: as
       bars, or collapsed (taking no room) */
    tapeLook(!state.hidden ? "shown" : state.collapsed ? "collapsed" : "bars");

    /* the current line */
    const { done, word, path, slash } = structure(state.tokens);
    const li = el("li", "entry current");
    li.append(markerColumn());
    if (!state.tokens.length) {
      const hint = el("span", "line empty-line");
      hint.append(el("span", "caret first"), el("span", "", state.mode === "type" ? "type a message" : "tap dit or dah"));
      li.append(hint);
    } else {
      const words = word.length || path ? [...done, word] : done;
      li.append(line(words, { path, slash, caret: true, key: "now" }));
      const x = el("button", "x");
      x.innerHTML = icon("x");
      x.type = "button";
      x.setAttribute("aria-label", "clear this message");
      x.addEventListener("click", () => { clearCurrent(); update(); });
      li.append(x);
    }
    tape.append(li);
    $("#tape-eye").replaceChildren(eyeButton());
    steadyCaret();
    settleTape();
  }

  /*
   * Back in the history, the line being written (and its eye) is out
   * of view below: one eye floats at the bottom left of the tape for
   * the whole history, as a message's × stays at the top right.
   *
   *   │ DEMOCRATS WIN        × │
   *   │ ABOUT THE HOUSE        │
   *   │👁 WATCHED RACES     ↵ │
   *
   * Either eye, tapped: the tape stays where you are, held by the
   * bottom of the view. What's at the bottom stays there as the rows
   * above it close or open: a message from the history by its last
   * line, the line being written by its caret.
   *
   *   │ ...                │        │ ...                │
   *   │ .-- .. -.          │  hold  │ WIN                │
   *   │  W  I  N           │   →    │ ...                │
   *   │──── bottom ────────│        │──── bottom ────────│
   */
  function bottomPin() {
    const tape = $("#tape");
    const bottom = tape.getBoundingClientRect().bottom;
    const e = [...tape.querySelectorAll(".entry")].findLast(e => e.getBoundingClientRect().top < bottom);
    if (!e) return null;
    const at = e.classList.contains("current") ? e.querySelector(".caret") ?? e : e;
    const edge = at === e && e.classList.contains("current") ? "top" : "bottom";
    return { i: e.dataset.i ?? "now", edge, dy: bottom - at.getBoundingClientRect()[edge] };
  }
  function pinBack(pin) {
    if (!pin) return;
    const tape = $("#tape");
    const e = pin.i === "now" ? tape.querySelector(".current") : tape.querySelector(`.entry[data-i="${pin.i}"]`);
    const at = pin.i === "now" ? e?.querySelector(".caret") ?? e : e;
    if (!at) return;
    tape.scrollTop += at.getBoundingClientRect()[pin.edge] - (tape.getBoundingClientRect().bottom - pin.dy);
    fadeTape();
    floatEye();
  }

  /* up only while the line's own eye is out of view */
  function floatEye() {
    const tape = $("#tape"), box = $("#tape-eye");
    const own = tape.querySelector(".current .marker .eye");
    if (!own) { box.hidden = true; return; }
    const t = tape.getBoundingClientRect(), r = own.getBoundingClientRect();
    box.hidden = r.top >= t.top - 1 && r.bottom <= t.bottom + 1;
    if (box.hidden) return;
    const pad = parseFloat(getComputedStyle(tape).paddingLeft) || 0;
    box.style.left = (tape.offsetLeft + pad) + "px";
    box.style.top = (tape.offsetTop + tape.clientHeight - box.offsetHeight - 8) + "px";
  }

  /*
   * Like a text editor: the caret blinks when it's ready and
   * waiting, and holds steady while you're keying.
   */
  let caretTimer = null;
  const STEADY_MS = 700;

  function steadyCaret() {
    const caret = $("#tape .current .caret");
    if (!caret) return;
    const since = performance.now() - state.lastInput;
    if (since >= STEADY_MS) return;
    caret.classList.add("steady");
    clearTimeout(caretTimer);
    caretTimer = setTimeout(() => $("#tape .current .caret")?.classList.remove("steady"), STEADY_MS - since);
  }

  /*
   * The current line's marker column has a slot per row:
   *
   *   keying            typing
   *   > .- -...         👁 .- -...      > marks the row you're entering;
   *   👁 A   B          >  A   B        the eye shows / hides the other
   *
   * Hidden, each word (between the slashes) becomes a solid bar the
   * width of the word, on that row, for every line on the tape:
   * how many words and roughly how long, but not what they say.
   */
  /* what the eye is hiding right now: "letters" (keying), "morse"
     (typing), or null. The tree and the about column hide it too,
     and a hidden part can't be tapped either (no copying, no links).
     Collapsed isn't hiding: the row is only put away for room, so
     the about column and the counts stay as they are */
  const hiding = () => (state.hidden && !state.collapsed ? (state.mode === "type" ? "morse" : "letters") : null);

  /* make a part hidden: a bar, out of reach of taps and the keyboard */
  function redact(e) {
    e.classList.add("redact");
    e.setAttribute("aria-hidden", "true");
    e.tabIndex = -1;
    if (e.tagName === "BUTTON") e.disabled = true;
    if (e.tagName === "A") e.removeAttribute("href");
    e.removeAttribute("title");
    return e;
  }

  const EYE_OPEN = `<svg class="ico eye-ico" viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 8C5.5 2.5 18.5 2.5 22.5 8C18.5 13.5 5.5 13.5 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="8" r="2.8" fill="currentColor"/></svg>`;
  const EYE_SHUT = `<svg class="ico eye-ico" viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 6C5.5 11.5 18.5 11.5 22.5 6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 9.8 5 12.6M12 11.1v3.1M17.5 9.8 19 12.6" stroke="currentColor" stroke-width="1.4"/></svg>`;
  /* collapsed: the shut eye pressed flat to a line */
  const EYE_FLAT = `<svg class="ico eye-ico" viewBox="0 0 24 16" aria-hidden="true"><path d="M1.5 8.5H22.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 10.5 5 13.3M12 10.5v3.1M17.5 10.5 19 13.3" stroke="currentColor" stroke-width="1.4"/></svg>`;

  /*
   * The eye changing between shown and bars: the line being written
   * goes over from the caret back, one letter at a time, so you can
   * follow it (tx.css, "The eye"). Each letter wears the old look
   * until its turn, and the rest of the tape (the history) changes
   * when it's done. Nothing moves, only the bars come and go:
   *
   *   shown ⇄ bars       each code (typing) or letter (keying) a bar
   *
   * Collapsing and opening up again happen at once: the rows move
   * as they close and open, and letter by letter that jerked.
   *
   * Quick: 60 ms a letter, 0.6 s at most. A redraw (a key) ends it.
   */
  /* the whole tape's look: shown, bars or collapsed, on the row the
     mode isn't entering */
  function tapeLook(look) {
    const tape = $("#tape"), typing = state.mode === "type";
    tape.classList.toggle("hide-p", !typing && look === "bars");
    tape.classList.toggle("hide-m", typing && look === "bars");
    tape.classList.toggle("collapse-p", !typing && look === "collapsed");
    tape.classList.toggle("collapse-m", typing && look === "collapsed");
  }

  const BAR = { type: "bar-m", key: "bar-p" };
  let eyeTimer = null;
  function eyeChange(from, to) {
    clearInterval(eyeTimer);
    if (from === "collapsed" || to === "collapsed") return;
    const entry = $("#tape .current");
    const line = entry?.querySelector(".line:not(.empty-line)");
    if (!line) return;
    const bar = BAR[state.mode === "type" ? "type" : "key"];
    const letters = [...line.querySelectorAll(".c")];
    const wear = (c, look) => c.classList.toggle(bar, look === "bars");
    for (const c of letters) wear(c, from);
    entry.classList.add("anim");
    tapeLook(from);   // the rest of the tape follows once the line has gone over
    const step = Math.min(60, 600 / Math.max(1, letters.length));
    let i = letters.length;
    eyeTimer = setInterval(() => {
      if (!line.isConnected || i <= 0) {
        clearInterval(eyeTimer);
        if (line.isConnected) {
          for (const c of letters) c.classList.remove(bar);
          entry.classList.remove("anim");
          tapeLook(to);
        }
        return;
      }
      wear(letters[--i], to);
    }, step);
  }

  const EYE_HOLD = 450;   // ms: a hold, not a tap
  let eyeHeld = false;

  function eyeButton() {
    const what = state.mode === "type" ? "Morse" : "letters";
    /*
     * A tap goes between shown and bars; holding it collapses (the
     * hidden row takes no room); a tap from collapsed opens it again.
     *
     *   tap:   shown ⇄ bars        hold: → collapsed      tap: → shown
     */
    const now = !state.hidden ? "shown" : state.collapsed ? "collapsed" : "bars";
    const tap = now === "shown" ? "bars" : "shown";
    const eye = el("button", "eye");
    eye.type = "button";
    eye.innerHTML = { shown: EYE_OPEN, bars: EYE_SHUT, collapsed: EYE_FLAT }[now];
    eye.title = (tap === "bars" ? "hide " : "show ") + what + (now === "collapsed" ? "" : " (hold: collapse)");
    eye.setAttribute("aria-label", eye.title);
    eye.setAttribute("aria-pressed", String(now !== "shown"));
    const go = next => {
      if (next === now) return;
      state.hidden = next !== "shown";
      state.collapsed = next === "collapsed";
      try { localStorage.setItem("dot-dash:tx-hide", JSON.stringify(state.collapsed ? "collapsed" : state.hidden)); } catch { }
      const pin = bottomPin();
      update();
      pinBack(pin);
      eyeChange(now, next);
      toast(`${what} ${{ shown: "shown", bars: "hidden", collapsed: "collapsed" }[next]}`);
    };
    /* held long enough, it's armed: brass, and a toast says what letting
       go will do; the release collapses. Sliding off lets it go */
    let holdTimer = null, armed = false;
    const disarm = () => { clearTimeout(holdTimer); armed = false; eye.classList.remove("armed"); };
    eye.addEventListener("pointerdown", () => {
      eyeHeld = false;   // a new press (a hold's release lands on the eye it replaced)
      disarm();
      if (now !== "collapsed") holdTimer = setTimeout(() => {
        armed = true;
        eye.classList.add("armed");
        toast(`release to collapse ${what}`);
      }, EYE_HOLD);
    });
    eye.addEventListener("pointerup", () => {
      const go_ = armed;
      disarm();
      if (go_) { eyeHeld = true; go("collapsed"); }
    });
    for (const t of ["pointercancel", "pointerleave"]) eye.addEventListener(t, disarm);
    eye.addEventListener("contextmenu", event => event.preventDefault());
    eye.addEventListener("click", () => {
      if (eyeHeld) { eyeHeld = false; return; }   // the release after a hold isn't also a tap
      go(tap);
    });
    return eye;
  }

  function markerColumn() {
    const col = el("span", "marker two");
    const active = el("span", "m-active", ">");
    const eye = eyeButton();
    /* keying: > on the Morse row; typing: > on the letters row */
    if (state.mode === "type") col.append(eye, active);
    else col.append(active, eye);
    return col;
  }

  /*
   * The current line sits at the TOP of the field, with the
   * bottom of the previous message peeking above it (and a fade
   * while there's history up there), like a calculator display:
   *
   *   ┌───────────────────────────┐
   *   │   H   E   L   L   O       │  ← previous, cut off: scroll up
   *   ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
   *   │ > .-- --- .-.             │  ← current, room to grow below
   *   │    W   O   R              │
   */
  const PEEK = 26;   // px of the previous message left showing

  /* the line can re-wrap with no keystroke (the field narrowing or
     widening beside it): the marker follows on any change of size */
  const markerWatch = new ResizeObserver(() => {
    const cur = $("#tape .current");
    if (cur) placeMarker(cur);
  });

  function settleTape() {
    const tape = $("#tape");
    const cur = tape.querySelector(".current");
    placeMarker(cur);
    markerWatch.disconnect();
    markerWatch.observe(tape);
    const line = cur.querySelector(".line");
    if (line) markerWatch.observe(line);
    const prev = cur.previousElementSibling;
    const peek = prev ? Math.min(PEEK, prev.offsetHeight) : 0;
    tape.style.setProperty("--peek", peek + "px");
    const padBottom = parseFloat(getComputedStyle(tape).paddingBottom) || 0;

    /* (read mode, keys away, too: the message being written in full
       view from its top, not the history pulled down above it) */

    cur.style.minHeight = Math.max(0, tape.clientHeight - peek - padBottom) + "px";
    tape.scrollTop = cur.offsetTop - peek;

    /* a long message: follow the caret down instead, keeping its
       whole line in view (both rows, with the > and the eye) */
    const caret = cur.querySelector(".caret");
    if (caret) {
      const marker = cur.querySelector(".marker");
      const top = tape.getBoundingClientRect().top - tape.scrollTop;
      const lowest = Math.max(caret.getBoundingClientRect().bottom, marker?.getBoundingClientRect().bottom ?? 0);
      const bottom = lowest - top + 8;
      if (bottom > tape.scrollTop + tape.clientHeight) tape.scrollTop = bottom - tape.clientHeight;
    }
    fadeTape();
    floatEye();
  }

  /*
   * The > and the eye ride beside the caret: a message that wraps
   * onto more lines takes them down with it, so they never scroll
   * out of view while you write.
   *
   *     .-- --- .-. .-.. -..        (earlier lines)
   *      W   O   R   L   D
   *   >  .-. ▌                      ← the line the caret is on
   *   👁  R
   */
  function placeMarker(cur) {
    const marker = cur.querySelector(".marker");
    const line = cur.querySelector(".line");
    const caret = cur.querySelector(".caret");
    if (!marker) return;
    let shift = 0;
    /* nothing written yet: the hint already lines up with the marker */
    if (line && caret && !line.classList.contains("empty-line")) {
      /* the top of the caret's row pair (in typing mode the caret
         sits one row down, on the letters) */
      const holder = caret.classList.contains("tail") ? caret.parentElement : null;   // riding on a letter
      const slot = holder ? holder.getBoundingClientRect().top
        : caret.getBoundingClientRect().top - (parseFloat(getComputedStyle(caret).marginTop) || 0);
      shift = Math.max(0, Math.round(slot - line.getBoundingClientRect().top));
    }
    marker.style.transform = shift ? `translateY(${shift}px)` : "";
  }

  /* fade the top edge only while there's history above the view */
  function fadeTape() {
    const tape = $("#tape");
    const first = tape.firstElementChild;
    const above = first && !first.classList.contains("current") && tape.scrollTop > 2;
    tape.classList.toggle("more-above", !!above);
  }

  $("#tape").addEventListener("scroll", () => { fadeTape(); floatEye(); }, { passive: true });

  /*
   * Quick scroll: a phone's scrollbar only shows where you are. On a
   * tape more than two screens long, a thumb on its right edge comes
   * up when you scroll it yourself (not when the station scrolls it
   * for you, keying), and dragging it runs through the whole history.
   * It fades a moment after you stop. With a mouse, the browser's
   * own scrollbar is there to grab already: no second one.
   *
   *   │ ... --- ...   │
   *   │  S   O   S   ▐│ ← the thumb: where you are, and a handle
   *   │ .... ..       │
   */
  const thumb = $("#tape-thumb");
  const THUMB_REST = 1200;   // ms after the last scroll
  let yours = -Infinity;     // when you last touched the tape (wheel, finger, pointer)
  let restTimer = null;
  let grab = null;           // { dy } while dragging

  const mouse = matchMedia("(pointer: fine)");
  const long = tape => tape.scrollHeight > tape.clientHeight * 2;
  function placeThumb() {
    const tape = $("#tape");
    const range = tape.scrollHeight - tape.clientHeight;
    const travel = tape.clientHeight - thumb.offsetHeight;
    thumb.style.top = (tape.offsetTop + (range > 0 ? tape.scrollTop / range : 0) * travel) + "px";
  }
  function showThumb() {
    const tape = $("#tape");
    if (mouse.matches || !long(tape)) { thumb.hidden = true; return; }
    thumb.hidden = false;
    thumb.classList.add("up");
    placeThumb();
    clearTimeout(restTimer);
    if (!grab) restTimer = setTimeout(() => thumb.classList.remove("up"), THUMB_REST);
  }
  for (const t of ["wheel", "touchstart", "pointerdown"]) $("#tape").addEventListener(t, () => { yours = performance.now(); }, { passive: true });
  $("#tape").addEventListener("scroll", () => {
    if (grab || performance.now() - yours < 1500) showThumb();
    else if (!thumb.hidden) placeThumb();
  }, { passive: true });

  thumb.addEventListener("pointerdown", event => {
    event.preventDefault();
    thumb.setPointerCapture?.(event.pointerId);
    grab = { dy: event.clientY - thumb.getBoundingClientRect().top };
    thumb.classList.add("held", "up");
    clearTimeout(restTimer);
  });
  thumb.addEventListener("pointermove", event => {
    if (!grab) return;
    const tape = $("#tape"), box = tape.getBoundingClientRect();
    const travel = tape.clientHeight - thumb.offsetHeight;
    const at = Math.max(0, Math.min(travel, event.clientY - grab.dy - box.top));
    tape.scrollTop = (travel > 0 ? at / travel : 0) * (tape.scrollHeight - tape.clientHeight);
  });
  const letGo = () => {
    if (!grab) return;
    grab = null;
    thumb.classList.remove("held");
    showThumb();
  };
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) thumb.addEventListener(t, letGo);

  /* tap a past message: it comes back as the current line */
  function recall(i) {
    resetKeyer();
    state.tokens = tokensOf(parse(morseOf(state.history[i])));
    state.took = tookFor(state.tokens, recOfEntry(state.history[i]));
    READING.typed = typedOf(state.history[i]);
    setTyped(plainText(wordsOf(state.tokens)) ?? "");
    update();
  }



  /*
   * stats:  chars                 dits
   *         words                 dahs
   * (how long it takes is the player's: its readout, by the play button)
   */
  function drawStats() {
    const words = wordsOf(state.tokens);
    const codes = words.flat();
    const left = $("#stats-text"), right = $("#stats-morse");
    if (!codes.length) { left.textContent = right.textContent = ""; return; }
    const dits = codes.join("").split("").filter(s => s === ".").length;
    const dahs = codes.join("").length - dits;
    /* the counts, numbers apart: the eye hides the numbers for what it
       hides (letters: chars and words; Morse: dits and dahs) */
    const h = hiding();
    /* a number and its word per row, on one axis (tx.css .stats) */
    const fill = (box, rows, secret) => {
      box.textContent = "";
      for (const [n, w] of rows) {
        const num = el("span", "n", String(n));
        if (secret) num.classList.add("redact");
        box.append(num, el("span", "w", `${w}${n === 1 ? "" : "s"}`));
      }
    };
    fill(left, [[codes.length, "char"], [words.length, "word"]], h === "letters");
    fill(right, [[dits, "dit"], [dahs, "dah"]], h === "morse");
    /* what the eye hides can't be copied: no brass to the pointer (tx.css) */
    left.classList.toggle("secret", h === "letters");
    right.classList.toggle("secret", h === "morse");
    left.title = h === "letters" ? "" : "copy the text";
    right.title = h === "morse" ? "" : "copy the Morse";
  }

  /*
   * Tap the counts to copy: the letters' (chars, words) the text,
   * the marks' (dits, dahs) the Morse; the share menu's copies, one
   * tap away. Not what the eye hides: a hidden part can't be copied.
   */
  async function copyCounts(box, what) {
    const words = wordsOf(state.tokens);
    if (!words.length) return;
    if (hiding() === (what === "text" ? "letters" : "morse")) return flash(box, "hidden");   // says why (the eye's word), copies nothing
    try {
      await navigator.clipboard.writeText(what === "text" ? share.plainText(words) : share.morseText(words));
      flash(box, "copied");
    } catch {
      flash(box, "can't copy");
    }
  }
  /* a tap on a word's bar shows that word (or hides it again); first
     in line, so the tap doesn't also key the message again or open
     the board. Only the bar's row, and only as bars */
  $("#tape").addEventListener("click", event => {
    const tape = event.currentTarget;
    const row = tape.classList.contains("hide-p") ? ".p" : tape.classList.contains("hide-m") ? ".m" : null;
    const c = row && event.target.closest(".entry:not(.anim) .w .c");
    if (!c) return;
    const r = c.querySelector(row).getBoundingClientRect();
    if (event.clientY < r.top || event.clientY > r.bottom) return;
    event.stopPropagation();
    event.preventDefault();
    const w = c.closest(".w");
    const shown = w.classList.toggle("shown");
    if (shown) shownWords.add(w.dataset.word); else shownWords.delete(w.dataset.word);
  }, { capture: true });

  $("#stats-text").addEventListener("click", () => copyCounts($("#stats-text"), "text"));
  $("#stats-morse").addEventListener("click", () => copyCounts($("#stats-morse"), "morse"));

  /* the message on the board (not yet sent): gone */
  function clearCurrent() {
    state.tokens = [];
    state.took = [];
    resetKeyer();
    setTyped("");
    state.record("clear");
  }

  /* clear history: tap twice (no pop-up dialogs) */
  let clearArmed = null;

  function eraseHistory() {
    state.history = [];
    state.saveHistory();
    clearCurrent();              // the unsent message goes too: a clean board
    forgetUndo();                // (and it stays clean)
    update();
  }

  function clearHistory() {
    if (clearArmed) {
      clearTimeout(clearArmed);
      clearArmed = null;
      eraseHistory();
      return;
    }
    clearArmed = setTimeout(() => {
      clearArmed = null;
      const b = $("#tape .tape-head button");
      if (b) { b.textContent = "clear history"; b.classList.remove("armed"); }
    }, 3000);
    const b = $("#tape .tape-head button");
    b.textContent = "tap again to clear all history";
    b.classList.add("armed");
  }

  /*
   * Or pull it away: at the top of the history (or scrolling up to
   * it, in the same stroke), pull down and hold.
   * A note says what's coming, a brass line runs along the top of the
   * message while you hold, and at its end the history goes. Letting
   * go or pushing back up before then keeps it; a slide sideways
   * calls it off, with a note.
   *
   *   ════════════════════──────      the line, filling
   *   clear history
   *   > HELLO  ↓ (finger, held)
   */
  const PULL = 36;          // px down before it counts as a pull
  const SIDEWAYS = 40;      // px across that calls it off
  const PULL_HOLD = 1500;   // ms held, the line's run
  {
    const tape = $("#tape");
    const field = tape.closest(".field");
    let one = false, from = null, timer = null, off = false;
    const atTop = () => tape.scrollTop <= 0 && state.history.length;
    const stop = () => {
      clearTimeout(timer);
      timer = null;
      field.classList.remove("pulling");
    };
    tape.addEventListener("touchstart", e => {
      stop();
      off = false;
      one = e.touches.length === 1;
      from = one && atTop() ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    tape.addEventListener("touchmove", e => {
      const t = e.touches[0];
      /* scrolled up to the top in the same stroke: the pull counts from there */
      if (!from && one && !off && atTop()) from = { x: t.clientX, y: t.clientY };
      if (!from || off) return;
      const dx = t.clientX - from.x, dy = t.clientY - from.y;
      if (timer && Math.abs(dx) > SIDEWAYS) {
        off = true;
        stop();
        toast("history kept");
        return;
      }
      if (timer && (dy < PULL || tape.scrollTop > 0)) { stop(); return; }   // pushed back up
      if (!timer && dy > PULL && Math.abs(dx) < SIDEWAYS && tape.scrollTop <= 0) {
        toast("scroll and hold to delete history");
        field.classList.add("pulling");
        timer = setTimeout(() => {
          stop();
          off = true;
          eraseHistory();
          state.record("pull-clear");
          toast("history deleted");
        }, PULL_HOLD);
      }
    }, { passive: true });
    for (const type of ["touchend", "touchcancel"]) tape.addEventListener(type, () => { stop(); from = null; });
  }

  return { drawTape, drawStats, settleTape, fadeTape, hiding, redact, clearCurrent };
}

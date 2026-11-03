/*
 * The popup layer: the privacy (i), the misheard ~, cut numbers, the
 * about card, the timing train's note, the notes on the tray's
 * checkboxes, an output's list (long-press), the profile (its own
 * module opens it: js/tx/profile.js);
 * a tap outside a popup, which only closes it; and Escape, which
 * closes whatever is on top.
 *
 *   createLayer({ state, about, menu, ... }) → {
 *     openPrivacy(open), openHeard(open), openCut(code), openWord({ term, codes })
 *   }
 *
 * (The player's own active state is in js/tx/player.js.)
 */
import { DECODE, ENCODE, CUT, NAME_CODE, format } from "../morse.js";
import { PROSIGNS_BY_CODE, TERMS, isQ } from "../characters.js";
import { aboutHref, termOf } from "./about.js";
import { $, el, nearest, flash } from "./dom.js";
import { say } from "./voice.js";
import { timingNow } from "./keys.js";

/* what each checkbox does, a tap on its word ("suggest" has its own
   note, with the speed set now: #suggest-pop) */
const FLAG_NOTES = {
  ctrl: ["Ctrl keys as paddles", "The left Ctrl key is dit, the right one dah, for a VBand USB paddle adapter.", "Off, Ctrl stays free for shortcuts, like Ctrl+Z."],
  pro: ["prosigns", "Prosigns, not symbols: <AR> <BT> <KN> <AS> read as themselves, not + = ( &.", "Keyed as one letter, a prosign does its job: AR, BT, SK, BK and CL return (↵), and HH erases a word."],
  cut: ["cut numbers", "Keying, in a word with a digit, T A U V E B D N read 0 1 2 3 5 7 8 9, so 5NN is 599.", "Typing, the 123 keys send their digits cut, and letters stay letters.", "A link only carries the marks, so its cut digits read as letters."],
  pretty: ["pretty play", "Plays back in textbook timing, every gap even.", "Off, it plays as you keyed it, every long dah and rushed gap."],
  color: ["color", "Dits in red, dahs in blue. Off, they're one colour. It goes for the reference page too."],
  invert: ["invert", "The light theme: dark on paper. It goes for the reference page too."]
};

export function createLayer({
  state, about, update, clearCurrent, putKeysAway, isChord, openHold, menu, openShare, hideBubble,
  cancelLamp, closeLamp, stopPlayback, isPlayerActive, setPlayerActive, playerBusy, openProfile
}) {
  /* the privacy (i): a small popup with the details */
  function openPrivacy(open) {
    $("#privacy-pop").hidden = !open;
    for (const b of document.querySelectorAll(".privacy-open")) b.setAttribute("aria-expanded", String(open));
    if (open) {
      resetPopupClear();
      $("#privacy-pop .close").focus({ preventScroll: true });
    }
  }

  /* ~ misheard: why the same marks can be other letters */
  function openHeard(open) {
    $("#heard-pop").hidden = !open;
    if (open) $("#heard-pop .close").focus({ preventScroll: true });
  }
  $("#heard-pop .close").addEventListener("click", () => openHeard(false));

  /*
   * Cut numbers: each digit with the marks its cut keeps lit and the
   * dahs it drops greyed (1–5 keep the start, 6–0 the end), the row
   * for the character showing picked out:
   *
   *   1  .----  A        6  -....   (not cut)
   *   2  ..---  U        7  --...  B
   */
  function drawCut(code) {
    const chart = $("#cut-chart");
    chart.textContent = "";
    for (const digit of "1234567890") {
      const full = ENCODE[digit];
      const cut = Object.keys(CUT).find(k => CUT[k] === digit && k !== full);
      const row = document.createElement("span");
      row.className = "cut-row" + (code && (code === full || code === cut) ? " here" : "");
      row.append(digit + "  ");
      const keep = !cut ? full.length : cut.length;
      [...full].forEach((m, i) => {
        const kept = Number(digit) >= 1 && Number(digit) <= 5 ? i < keep : i >= full.length - keep;
        const s = document.createElement("span");
        s.className = (m === "." ? "dot" : "dash") + (kept ? "" : " gone");
        s.textContent = m;   /* . and -: a dot low, a dash high, as everywhere */
        row.append(s);
      });
      row.append("  " + (cut ? DECODE[cut] : "(not cut)"), "\n");
      chart.append(row);
    }
  }
  function openCut(code) {
    const pop = $("#cut-pop");
    if (code === null) { pop.hidden = true; return; }
    drawCut(code);
    $("#cut-full").href = code ? `/ref/?/_${code}_#cut` : "/ref/#cut";
    pop.hidden = false;
    $("#cut-pop .close").focus({ preventScroll: true });
  }
  $("#cut-pop .close").addEventListener("click", () => openCut(null));

  /*
   * Long-press an output, and its list opens on its own, above it,
   * without the settings: ♪ the sound, ☼ the light, the Morse input
   * (.-) which keyer. Choosing one sets the list in the tray as if
   * chosen there; the press itself doesn't toggle the output.
   *
   *        ┌───────────────┐
   *        │ off  tone  …  │      the current one lit
   *        └──────┬────────┘
   *              [♪]
   *
   * As the keyboard's fan: still holding, slide along the list and
   * let go on one to choose it. Let go without sliding and the list
   * stays open for a tap.
   */
  const LONG_PRESS = 450;   // ms
  const LISTS = [['[data-out="sound"]', "#opt-sound"], ['[data-out="light"]', "#opt-light"],
                 ['.input-mode .side[data-mode="key"]', "#opt-key"]];
  let list = null;          // the open list, or null

  function closeList() {
    list?.remove();
    list = null;
  }

  function openList(button, select) {
    closeList();
    list = document.createElement("div");
    list.className = "quick-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", select.closest("label")?.firstChild?.textContent.trim() ?? "choose");
    for (const o of select.options) {
      if (o.disabled || o.hidden) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.textContent = o.textContent;
      const on = o.value === select.value;
      b.setAttribute("aria-selected", String(on));
      if (on) b.classList.add("on");
      b.addEventListener("click", () => {
        closeList();
        if (select.value === o.value) return;
        select.value = o.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));   // as if chosen in the tray
      });
      list.append(b);
    }
    document.body.append(list);
    const r = button.getBoundingClientRect(), w = list.offsetWidth;
    list.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + "px";
    list.style.top = Math.max(6, r.top - list.offsetHeight - 6) + "px";
    (list.querySelector(".on") ?? list.firstChild)?.focus({ preventScroll: true });
  }

  const SLIDE = 8;          // px: a finger moved this far is sliding, not resting
  for (const [sel, listSel] of LISTS) {
    const button = $(sel), select = $(listSel);
    if (!button || !select) continue;
    let timer = null, held = false, from = null, slid = false, pick = null;
    button.addEventListener("pointerdown", event => {
      held = false; slid = false; pick = null;
      from = { x: event.clientX, y: event.clientY };
      button.setPointerCapture?.(event.pointerId);   // the slide stays ours, off the button too
      clearTimeout(timer);
      timer = setTimeout(() => { held = true; from = null; openList(button, select); }, LONG_PRESS);
    });
    button.addEventListener("pointermove", event => {
      if (!held) {
        /* moved off before the list opened: a drag, not a hold */
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLIDE * 1.5) clearTimeout(timer);
        return;
      }
      if (!list) return;
      from ??= { x: event.clientX, y: event.clientY };
      if (!slid && Math.hypot(event.clientX - from.x, event.clientY - from.y) < SLIDE) return;
      slid = true;
      pick = nearest([...list.querySelectorAll("button")], event.clientX, event.clientY);
      for (const b of list.querySelectorAll("button")) b.classList.toggle("on", b === pick);
    });
    button.addEventListener("pointerup", () => {
      clearTimeout(timer);
      if (held && slid && pick && list) pick.click();   // let go on one: chosen
    });
    for (const t of ["pointercancel", "lostpointercapture"]) button.addEventListener(t, () => clearTimeout(timer));
    /* the release after a long-press isn't also a tap (the toggle) */
    button.addEventListener("click", event => {
      if (!held) return;
      held = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    button.addEventListener("contextmenu", event => { if (held || timer) event.preventDefault(); });
  }

  /* the timing train, tapped: what it shows */
  function openTrain(open) {
    $("#train-pop").hidden = !open;
    if (open) $("#train-pop .close").focus({ preventScroll: true });
  }
  $("#train").addEventListener("click", () => openTrain(true));
  $("#train-pop .close").addEventListener("click", () => openTrain(false));

  /* "suggest" in the tray, tapped: the chips, and how long a timed
     keyer's words stay (until the word space, at the speed set now) */
  function openSuggest(open) {
    $("#suggest-pop").hidden = !open;
    $("#suggest-info").setAttribute("aria-expanded", String(open));
    if (!open) return;
    const wpm = $("#opt-wpm").value, fwpm = $("#opt-fwpm").value;
    const s = (timingNow().wordAt / 1000).toFixed(1);
    $("#suggest-now").textContent = `Now, at ${wpm} wpm${fwpm !== wpm ? `, farns. ${fwpm}` : ""}: about ${s} s after your last mark.`;
    $("#suggest-pop .close").focus({ preventScroll: true });
  }
  $("#suggest-info").addEventListener("click", () => openSuggest(true));
  $("#suggest-pop .close").addEventListener("click", () => openSuggest(false));

  /*
   * A prosign or an operators' word in the about column, tapped: what
   * it means, under its marks. A Q code says both ways, as on /ref:
   *
   *   QTH   --.- - ....
   *   a Q code: three letters for a sentence
   *   QTH   my location is …
   *   QTH?  what is your location?
   */
  function openWord(word) {
    const pop = $("#word-pop");
    if (!word) { pop.hidden = true; return; }
    const { term, codes } = word;
    $("#word-title").textContent = term;
    const marks = $("#word-marks");
    marks.textContent = "";
    codes.forEach((code, i) => {
      if (i) marks.append(" ");
      for (const m of code) marks.append(el("span", m === "." ? "dot" : "dash", m));
    });
    $("#word-means").replaceChildren(...meaningOf(term));
    $("#word-full").href = `/ref/?/${format([codes])}`;
    pop.hidden = false;
    $("#word-pop .close").focus({ preventScroll: true });
  }

  /* what a prosign, Q code or abbreviation is, and what it means */
  function meaningOf(term) {
    const line = (t, means) => {
      const p = el("p", "word-line");
      p.append(el("b", "", t), " ", means);
      return p;
    };
    const sign = term.startsWith("<") && Object.values(PROSIGNS_BY_CODE).find(([s]) => `<${s}>` === term);
    if (term.startsWith("<")) {
      const kind = el("p", "word-kind", `a prosign: ${sign ? sign[1] : term.slice(1, -1).split("").join(" ")}, run together as one letter, no gap`);
      return sign ? [kind, line(term, sign[2])] : [kind];
    }
    if (isQ(term)) {
      const q = term.replace("?", "");
      return [el("p", "word-kind", "a Q code: three letters for a sentence; sent with ? it asks"), line(q, TERMS[q]), line(q + "?", TERMS[q + "?"])];
    }
    return [el("p", "word-kind", "an abbreviation: what operators send to save time"), line(term, TERMS[term])];
  }
  $("#word-pop .close").addEventListener("click", () => openWord(null));

  /* "about" in the tray, tapped: what the column shows, each part a switch */
  function openAboutSet(open) {
    $("#about-set-pop").hidden = !open;
    $("#about-set-info").setAttribute("aria-expanded", String(open));
    if (open) $("#about-set-pop .close").focus({ preventScroll: true });
  }
  $("#about-set-info").addEventListener("click", () => openAboutSet(true));
  $("#about-set-pop .close").addEventListener("click", () => openAboutSet(false));

  /* a checkbox's word, tapped: what it does */
  function openFlag(name) {
    $("#flag-pop").hidden = !name;
    if (!name) return;
    const [title, ...note] = FLAG_NOTES[name];
    $("#flag-title").textContent = title;
    $("#flag-note").replaceChildren(...note.map(t => el("p", "", t)));
    $("#flag-pop .close").focus({ preventScroll: true });
  }
  for (const b of document.querySelectorAll(".flag-word[data-note]")) b.addEventListener("click", () => openFlag(b.dataset.note));
  $("#flag-pop .close").addEventListener("click", () => openFlag(null));

  /* (i) in the tree column: the character's card, here; the full page
     is a link in it. The card's code (js/overview.js) loads the first
     time it's opened */
  let card = null;
  async function openAbout(code) {
    const pop = $("#about-pop");
    if (!code) { pop.hidden = true; return; }
    let renderCard;
    try { ({ renderCard } = await (card ??= import("../overview.js"))); } catch { card = null; return; }
    /* its parts do what the column's do; cut and ~ open their
       popups over it (closing them comes back here) */
    renderCard($("#about-card"), code, {
      say: (ch, part) => say(ch, Number($("#opt-vol").value) / 100).catch(() => flash(part, "can't say it here")),
      openCut, openHeard: () => openHeard(true), flash
    });
    /* the word it ends, if that's one of the operators' (QTH, 73): what
       it means, under the card (the column keeps to the letter) */
    const term = termOf(about.word());
    const box = $("#about-term");
    box.hidden = !term;
    if (term) box.replaceChildren(el("p", "about-term-title", term), ...meaningOf(term));
    $("#about-title").textContent = `about ${code === NAME_CODE ? "dot-da.sh" : DECODE[code] ?? code}`;
    $("#about-full").href = aboutHref(code);
    $("#about-card").scrollTop = $("#about-card").scrollLeft = 0;
    pop.hidden = false;
    $("#about-pop .close").focus({ preventScroll: true });
  }
  $("#tree-info").addEventListener("click", event => {
    /* a plain tap opens the card; a middle click or ⌘/Ctrl-click still opens the page */
    if (!about.current() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    openAbout(about.current());
  });
  $("#about-pop .close").addEventListener("click", () => openAbout(null));
  /* a character in the card: its own card */
  $("#about-card").addEventListener("click", event => {
    const a = event.target.closest("a[data-code]");
    if (!a) return;
    event.preventDefault();
    openAbout(a.dataset.code);
  });

  /* clear history from here too: tap twice, like at the top of the history */
  let popupArmed = null;

  function resetPopupClear() {
    clearTimeout(popupArmed);
    popupArmed = null;
    const b = $("#privacy-clear");
    const n = state.history.length;
    b.classList.remove("armed");
    b.disabled = !n && !state.tokens.length;
    b.textContent = n ? `clear history (${n} message${n === 1 ? "" : "s"})`
      : state.tokens.length ? "clear history (unsent message)" : "no history to clear";
  }

  $("#privacy-clear").addEventListener("click", () => {
    const b = $("#privacy-clear");
    if (popupArmed) {
      clearTimeout(popupArmed);
      popupArmed = null;
      state.history = [];
      state.saveHistory();
      clearCurrent();
      update();
      b.classList.remove("armed");
      b.disabled = true;
      b.textContent = "history cleared";
      return;
    }
    b.classList.add("armed");
    b.textContent = "tap again to clear all history";
    popupArmed = setTimeout(resetPopupClear, 3000);
  });

  for (const b of document.querySelectorAll(".privacy-open")) {
    b.addEventListener("click", () => openPrivacy($("#privacy-pop").hidden));
  }
  $("#privacy-pop .close").addEventListener("click", () => openPrivacy(false));

  /*
   * A tap outside a popup (share, privacy) only closes it: nothing
   * underneath keys, plays or opens. Caught on the way down, before
   * anything else sees it, and the release and click that follow
   * are swallowed too. The privacy popup sits over the share menu,
   * so a tap on the menu closes just the privacy popup.
   */
  {
    let eating = null;
    const eat = event => { event.preventDefault(); event.stopPropagation(); };
    const REST = ["pointerup", "click", "mouseup", "touchend"];
    const stopEating = () => {
      clearTimeout(eating);
      for (const t of REST) window.removeEventListener(t, eat, { capture: true });
    };
    const eatRest = () => {
      for (const t of REST) window.addEventListener(t, eat, { capture: true, once: true });
      /* a drag, or a key that holds back its click, gives no click: stop waiting */
      eating = setTimeout(stopEating, 700);
    };
    window.addEventListener("pointerdown", event => {
      stopEating();              // a new tap: whatever the last one left behind goes
      const privacy = $("#privacy-pop"), heard = $("#heard-pop"), hold = $("#hold-pop"), about = $("#about-pop"), train = $("#train-pop"), suggest = $("#suggest-pop"), flag = $("#flag-pop"), cut = $("#cut-pop"), report = $("#report-pop");
      const word = $("#word-pop"), aboutSet = $("#about-set-pop"), profile = $("#profile-pop");
      let closed = false;
      const farns = $("#farns-pop");
      if (!report.hidden) { if (!report.contains(event.target)) { $("#report-cancel").click(); closed = true; } }
      else if (!farns.hidden) { if (!farns.contains(event.target)) { $("#farns-ok").click(); closed = true; } }
      /* ~ and cut can open over the about card: they go first */
      else if (!heard.hidden) { if (!heard.contains(event.target)) { openHeard(false); closed = true; } }
      else if (!cut.hidden) { if (!cut.contains(event.target)) { openCut(null); closed = true; } }
      else if (!about.hidden) { if (!about.contains(event.target)) { openAbout(null); closed = true; } }
      else if (!hold.hidden) { if (!hold.contains(event.target)) { openHold(false); closed = true; } }
      else if (!train.hidden) { if (!train.contains(event.target)) { openTrain(false); closed = true; } }
      else if (!suggest.hidden) { if (!suggest.contains(event.target)) { openSuggest(false); closed = true; } }
      else if (!flag.hidden) { if (!flag.contains(event.target)) { openFlag(null); closed = true; } }
      else if (!word.hidden) { if (!word.contains(event.target)) { openWord(null); closed = true; } }
      else if (!aboutSet.hidden) { if (!aboutSet.contains(event.target)) { openAboutSet(false); closed = true; } }
      else if (!profile.hidden) { if (!profile.contains(event.target)) { openProfile(false); closed = true; } }
      else if (list) { if (!list.contains(event.target)) { closeList(); closed = true; } }
      else if (!privacy.hidden && !privacy.contains(event.target)) { openPrivacy(false); closed = true; }
      else if (privacy.hidden && !menu.hidden && !menu.contains(event.target)) { openShare(false); closed = true; }
      if (!closed) return;
      eat(event);
      eatRest();
    }, true);
  }

  /* (the note over the keys on arrival: see ARRIVAL, at the top of js/tx.js) */


  /*
   * ============================================================
   * ESCAPE
   * ============================================================
   *
   * One press, one thing: it closes whatever's on top (the lamp's
   * warning, the lamp, the privacy popup, the share menu, the paste
   * bubble, the note on arrival); then cancels a message playing or
   * paused part-way (stopped, unlit, rewound); then lets go of an
   * active player; with nothing else, it shows or hides the keys,
   * like the chevron.
   */
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.repeat || isChord(event)) return;
    const open = sel => !$(sel).hidden;
    if (open("#notice")) return;                                    // its own handler dismisses it
    if (open("#lamp-warn")) cancelLamp();
    else if (open("#report-pop")) $("#report-cancel").click();
    else if (open("#farns-pop")) $("#farns-ok").click();
    else if (open("#lamp")) { stopPlayback(); closeLamp(); }
    else if (open("#privacy-pop")) openPrivacy(false);
    else if (open("#heard-pop")) openHeard(false);
    else if (open("#train-pop")) openTrain(false);
    else if (open("#suggest-pop")) openSuggest(false);
    else if (open("#flag-pop")) openFlag(null);
    else if (open("#cut-pop")) openCut(null);
    else if (open("#word-pop")) openWord(null);
    else if (open("#about-set-pop")) openAboutSet(false);
    else if (open("#profile-pop")) openProfile(false);
    else if (list) closeList();
    else if (open("#hold-pop")) openHold(false);
    else if (open("#about-pop")) openAbout(null);
    else if (open("#share")) openShare(false);
    else if (open("#paste-bubble") || open("#copy-bubble")) hideBubble();
    else if (playerBusy()) stopPlayback();                                // playing, or paused part-way: cancel it
    else if (isPlayerActive()) setPlayerActive(false);                   // let go of the player first
    else {
      putKeysAway(!state.inputAway);
      if (state.inputAway) document.activeElement?.blur?.();             // the typing field lets go too
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return { openPrivacy, openHeard, openCut, openWord };
}

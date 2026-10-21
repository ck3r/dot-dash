/*
 * The popup layer: the privacy (i), the misheard ~, cut numbers, the
 * about card, the timing train's note, an output's list (long-press);
 * a tap outside a popup, which only closes it; and Escape, which
 * closes whatever is on top.
 *
 *   createLayer({ state, about, menu, ... }) → {
 *     openPrivacy(open), openHeard(open), openCut(code)
 *   }
 *
 * (The player's own active state is in js/tx/player.js.)
 */
import { DECODE, ENCODE, CUT, NAME_CODE } from "../morse.js";
import { aboutHref } from "./about.js";
import { $ } from "./dom.js";

export function createLayer({
  state, about, update, clearCurrent, putKeysAway, isChord, openHold, menu, openShare, hideBubble,
  cancelLamp, closeLamp, stopPlayback, isPlayerActive, setPlayerActive, playerBusy
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

  for (const [sel, listSel] of LISTS) {
    const button = $(sel), select = $(listSel);
    if (!button || !select) continue;
    let timer = null, held = false;
    button.addEventListener("pointerdown", () => {
      held = false;
      clearTimeout(timer);
      timer = setTimeout(() => { held = true; openList(button, select); }, LONG_PRESS);
    });
    for (const t of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(t, () => clearTimeout(timer));
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

  /* (i) in the tree column: the character's card, here; the full page
     is a link in it. The card's code (js/overview.js) loads the first
     time it's opened */
  let card = null;
  async function openAbout(code) {
    const pop = $("#about-pop");
    if (!code) { pop.hidden = true; return; }
    let renderCard;
    try { ({ renderCard } = await (card ??= import("../overview.js"))); } catch { card = null; return; }
    renderCard($("#about-card"), code);
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
      const privacy = $("#privacy-pop"), heard = $("#heard-pop"), hold = $("#hold-pop"), about = $("#about-pop"), train = $("#train-pop"), cut = $("#cut-pop"), report = $("#report-pop");
      let closed = false;
      if (!report.hidden) { if (!report.contains(event.target)) { $("#report-cancel").click(); closed = true; } }
      else if (!about.hidden) { if (!about.contains(event.target)) { openAbout(null); closed = true; } }
      else if (!hold.hidden) { if (!hold.contains(event.target)) { openHold(false); closed = true; } }
      else if (!heard.hidden) { if (!heard.contains(event.target)) { openHeard(false); closed = true; } }
      else if (!train.hidden) { if (!train.contains(event.target)) { openTrain(false); closed = true; } }
      else if (!cut.hidden) { if (!cut.contains(event.target)) { openCut(null); closed = true; } }
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
    else if (open("#lamp")) { stopPlayback(); closeLamp(); }
    else if (open("#privacy-pop")) openPrivacy(false);
    else if (open("#heard-pop")) openHeard(false);
    else if (open("#train-pop")) openTrain(false);
    else if (open("#cut-pop")) openCut(null);
    else if (list) closeList();
    else if (open("#hold-pop")) openHold(false);
    else if (open("#about-pop")) openAbout(null);
    else if (open("#share")) openShare(false);
    else if (open("#paste-bubble")) hideBubble();
    else if (playerBusy()) stopPlayback();                                // playing, or paused part-way: cancel it
    else if (isPlayerActive()) setPlayerActive(false);                   // let go of the player first
    else {
      putKeysAway(!state.inputAway);
      if (state.inputAway) document.activeElement?.blur?.();             // the typing field lets go too
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return { openPrivacy, openHeard, openCut };
}

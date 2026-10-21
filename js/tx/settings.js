/*
 * The settings tray (lists, sliders, checkboxes, and where the lists
 * sit over their sliders), the output toggles (♪ ☼ ≋), and the
 * light: the lamp, the flashlight, the signal lamp and its warning.
 *
 *   createSettings({ state, sound, logo, ... }) → {
 *     outputs            light and vibration (js/tx-outputs.js)
 *     setSignal(down)    the logo, the light and the vibration follow
 *     openTray(open), trayJustClosed()
 *     wantsLamp(), lampOk(rate), askLamp(rate, go), openLamp(words),
 *     closeLamp(), cancelLamp()
 *     torchOn()          the flashlight is the light
 *     start()            load the saved settings and apply them
 *   }
 *   choice(select)       a list's real choice, even while it shows "off"
 */
import * as share from "../tx-share.js";
import { createOutputs } from "../tx-outputs.js";
import { $, toast } from "./dom.js";

export function choice(select) {
  if (typeof select === "string") select = $(select);
  if (select.value !== "off") return select.value;
  const last = select.dataset.last;
  const real = [...select.options].filter(o => o.value !== "off" && !o.disabled);
  if (real.some(o => o.value === last)) return last;
  return (real.find(o => o.defaultSelected) ?? real[0]).value;   // the list's default
}

export function createSettings({ state, sound, logo, ctrlPaddle, timingNow, showInput, drawStats, stopPlayback, redrawTrace }) {
  function openTray(open) {
    $("#tray").hidden = !open;
    $("#tray-toggle").setAttribute("aria-expanded", String(open));
    showInput();
    if (open) placeSwitches();
  }

  /*
   * The lists over their sliders: key centred over speed, sound over
   * vol, wave over pitch, light from the light column. Where two would
   * touch, both give way a little (keeping a gap), the rest stay put.
   * Narrow phones (two to a row, tx.css) skip this.
   */
  const SWITCH_GAP = 8;
  const narrowTray = matchMedia("(max-width: 384px)");

  function placeSwitches() {
    const row = $(".switches");
    const all = ["#opt-key", "#opt-ctrl", "#opt-sound", "#opt-wave", "#opt-light"].map(id => $(id).closest("label"))
      .filter(l => l.closest(".switches"));        // ctrl may be in the checkbox column
    if (narrowTray.matches) {
      row.classList.remove("placed");
      row.style.height = "";
      for (const l of all) l.style.left = "";
      return;
    }
    if ($("#tray").hidden) return;
    row.classList.add("placed");
    const base = row.getBoundingClientRect().left;
    const mid = id => { const b = $(id).getBoundingClientRect(); return b.left + b.width / 2 - base; };
    /* key from the left edge, ctrl (when shown) right beside it */
    const labels = all.filter(l => getComputedStyle(l).display !== "none");
    const w = labels.map(l => l.offsetWidth);
    const ideal = {
      "opt-key": () => 0,
      "opt-ctrl": () => 0,                       // pushed along by key below
      "opt-sound": l => mid("#opt-vol") - l.offsetWidth / 2,
      "opt-wave": l => mid("#opt-hz") - l.offsetWidth / 2,
      "opt-light": () => $("#opt-glow").closest(".group").getBoundingClientRect().left - base
    };
    const x = labels.map(l => ideal[l.querySelector("select, input").id](l));
    /* the far edge: the tray's (light may run over the empty top of
       the color / invert column) */
    const end = $("#tray").getBoundingClientRect().right - base;
    /* settle: two too close share the nudge, half each, so every
       list stays as near its slider as it can; and all stay in the row */
    for (let round = 0; round < 24; round++) {
      let moved = false;
      for (let i = 0; i < x.length - 1; i++) {
        const over = x[i] + w[i] + SWITCH_GAP - x[i + 1];
        if (over > 0.5) {
          /* key holds the left edge: the next one gives way alone */
          if (i === 0) x[1] += over;
          else { x[i] -= over / 2; x[i + 1] += over / 2; }
          moved = true;
        }
      }
      x[0] = Math.max(0, x[0]);
      const z = x.length - 1;
      x[z] = Math.min(x[z], end - w[z]);
      if (!moved) break;
    }
    labels.forEach((l, i) => { l.style.left = Math.round(Math.max(0, x[i])) + "px"; });
    row.style.height = Math.max(...labels.map(l => l.offsetHeight)) + "px";
  }

  /* (ctrl, keys as paddles, sits beside key on every screen: tx.css) */

  new ResizeObserver(() => placeSwitches()).observe($("#tray"));
  narrowTray.addEventListener("change", placeSwitches);
  document.fonts?.ready.then(placeSwitches);

  $("#tray-toggle").addEventListener("click", () => openTray($("#tray").hidden));

  /* a tap anywhere above the player closes the settings; the player
     (play, scrub, repeat) and the sound / light / vibration toggles
     stay usable, so changes can be tried out with the settings still open */
  let trayClosedAt = -Infinity;
  document.addEventListener("pointerdown", event => {
    if ($("#tray").hidden) return;
    if (event.target.closest("#tray, #tray-toggle, .player, .outputs, #report-pop")) return;
    openTray(false);
    trayClosedAt = performance.now();
  });

  const outputFor = input => document.querySelector(`output[for="${input.id}"]`);

  /* settings are remembered on this device */
  const SETTINGS_KEY = "dot-dash:tx-settings";
  const settingInputs = () => document.querySelectorAll("#tray input[type=range], #tray select");

  function saveSettings() {
    const saved = {};
    for (const input of settingInputs()) saved[input.id] = input.id === "opt-key" ? state.keyMode : input.tagName === "SELECT" ? choice(input) : input.value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch { }
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch { }
    for (const input of settingInputs()) {
      if (saved[input.id] === undefined) continue;
      if (input.tagName === "SELECT" && ![...input.options].some(o => o.value === saved[input.id])) continue;
      input.value = saved[input.id];
      const out = outputFor(input);
      if (out) out.value = input.value;
    }
  }

  $("#tray").addEventListener("change", saveSettings);

  /* the farnsworth track above wpm: out of reach, greyed (tx.css .cap) */
  function markFarnsCap() {
    const wpm = $("#opt-wpm"), f = $("#opt-fwpm");
    const out = (Number(f.max) - Number(wpm.value)) / (Number(f.max) - Number(f.min));
    f.closest(".track").style.setProperty("--f", String(Math.max(0, Math.min(1, out))));
  }
  $("#opt-wpm").addEventListener("input", markFarnsCap);

  /*
   * Farnsworth (the overall speed) follows wpm while the two are
   * equal: speed up the letters and the spacing comes along. Set
   * lower, it stays where it was put, and is never faster than wpm.
   *
   *   wpm 10 → 15, farns 10 → 15      (they were equal)
   *   wpm 15 → 20, farns  8 →  8      (it was set lower)
   *   wpm 20 →  6, farns  8 →  6      (never faster)
   */
  let wpmWas = null;   // wpm before this move (set at start)
  for (const input of document.querySelectorAll("#tray input[type=range]")) {
    input.addEventListener("input", () => {
      const wpm = $("#opt-wpm"), fwpm = $("#opt-fwpm");
      const was = fwpm.value;
      if (input === wpm && Number(fwpm.value) === wpmWas) fwpm.value = wpm.value;
      if (Number(fwpm.value) > Number(wpm.value)) fwpm.value = wpm.value;
      outputFor(input).value = input.value;
      wpmWas = Number(wpm.value);
      drawStats();
      /* moved along: as if slid, so what follows it (the timing train,
         the player) catches up */
      if (fwpm.value !== was) fwpm.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  /*
   * A report for support, copied: the version (the offline cache's
   * name), this device, the settings, the last few errors, and the
   * kinds of the last events. Never a message: not the line, not the
   * history, not what an event carried (a "send" says no more).
   */
  async function report() {
    let version = "unknown";
    try { version = (await caches.keys()).filter(k => k.startsWith("dot-dash")).join(", ") || version; } catch { }
    const kept = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("dot-dash:") && !/history|line|noticed/.test(k)) kept[k.slice(9)] = localStorage.getItem(k);
      }
    } catch { }
    const errors = state.events.filter(e => e.type === "error").slice(-5);
    const recent = state.events.filter(e => e.type !== "error").slice(-30).map(e => e.type);
    return [
      "dot-da.sh report",
      `version   ${version}`,
      `time      ${new Date().toISOString()}`,
      `page      ${location.pathname}`,
      `device    ${navigator.userAgent}`,
      `screen    ${screen.width}×${screen.height}, window ${innerWidth}×${innerHeight}, ×${devicePixelRatio}`,
      `input     ${navigator.maxTouchPoints ? "touch" : "no touch"}${matchMedia("(hover: hover)").matches ? ", hover" : ""}`,
      `app       ${matchMedia("(display-mode: standalone)").matches ? "installed" : "in a browser tab"}`,
      `language  ${navigator.languages?.join(", ") ?? navigator.language}`,
      `mode      ${state.mode}, key ${state.keyMode}${state.inputAway ? ", keys away" : ""}`,
      "settings",
      ...Object.entries(kept).sort().map(([k, v]) => `  ${k}: ${v}`),
      `errors    ${errors.length ? "" : "none"}`,
      ...errors.map(e => `  ${new Date(performance.timeOrigin + e.at).toISOString()}  ${e.message}${e.where ? "  (" + e.where + ")" : ""}`),
      `recent    ${recent.join(" ") || "nothing yet"}`
    ].join("\n");
  }
  /* shown in full first: nothing unseen goes onto the clipboard */
  function openReport(open) {
    $("#report-pop").hidden = !open;
    $("#report").setAttribute("aria-expanded", String(open));
    if (open) $("#report-copy").focus({ preventScroll: true });
  }
  $("#report").addEventListener("click", async () => {
    $("#report-text").textContent = await report();
    openReport(true);
  });
  $("#report-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#report-text").textContent);
      toast("report copied: paste it into a message to support");
      openReport(false);
    } catch {
      toast("couldn't reach the clipboard: select the text and copy it");
    }
  });
  for (const b of ["#report-cancel", "#report-pop .close"]) $(b).addEventListener("click", () => openReport(false));

  /* only offer what this phone can do */
  $("#vibe-set").hidden = !("vibrate" in navigator);
  document.querySelector('[data-out="vibrate"]').hidden = !("vibrate" in navigator);
  /* the flashlight: Chrome on Android exposes the torch through the camera */
  if (!/Android/i.test(navigator.userAgent) || !navigator.mediaDevices?.getUserMedia) $("#torch-choice").remove();

  /*
   * ============================================================
   * LIGHT & VIBRATION
   * ============================================================
   *
   * One signal for everything that keys: the logo, the light and
   * the vibration all follow it (sound is scheduled on its own,
   * to the same timing).
   */
  const outputOn = name => document.querySelector(`[data-out="${name}"]`).getAttribute("aria-pressed") === "true";

  const outputs = createOutputs({
    settings: () => ({
      light: outputOn("light"),
      lightMode: choice("#opt-light"),
      vibrate: outputOn("vibrate"),
      strength: Number($("#opt-vibe").value)
    }),
    lampTarget: $(".station"),
    overlay: {
      isOpen: () => !$("#lamp").hidden,
      flash: on => $("#lamp").classList.toggle("on", on)
    }
  });

  function setSignal(down) {
    logo.classList.toggle("down", down);
    outputs.signal(down);
  }

  /* the flashlight needs the camera: ask when it's chosen (a tap) */
  async function wantTorch() {
    if (choice("#opt-light") !== "torch" || !outputOn("light")) return;
    if (!(await outputs.torchReady())) {
      toast("no flashlight available here");
      $("#opt-light").value = "signal";
      $("#opt-light").dataset.last = "signal";
      setOutput("light", false);
      saveSettings();
    }
  }
  let lightBefore = null;
  $("#opt-light").addEventListener("change", () => {
    outputs.quiet();
    if (choice("#opt-light") !== "torch") outputs.releaseTorch();
    wantTorch();
    /* invert flips the whole screen as you key: ask first, as the
       signal lamp does (twice if your speed means more than 3 a second) */
    const was = lightBefore;
    lightBefore = choice("#opt-light");
    if ($("#opt-light").value === "invert" && was !== "invert") {
      const rate = 1000 / (2 * timingNow().unit);    // dits: one flash every two units
      askLamp(rate, () => { }, {
        invert: true,
        cancel: () => {
          $("#opt-light").value = was ?? "off";
          $("#opt-light").dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
  });


  /*
   * Signal lamp: with the light on and "signal lamp" chosen, play
   * goes full screen. It asks first; if the message would flash
   * more than 3 times a second (the photosensitivity guideline),
   * it asks again, explicitly.
   */
  const SAFE_RATE = 3;
  let lampAgreed = false;    // this visit: the warning's been read
  let lampPending = null;

  function wantsLamp() {
    return outputOn("light") && choice("#opt-light") === "signal";
  }

  function askLamp(rate, go, { invert = false, cancel = null } = {}) {
    lampPending = { go, cancel, fast: rate > SAFE_RATE, confirmedFast: false };
    $("#lamp-title").textContent = invert ? "invert" : "signal lamp";
    $("#lamp-warn .what").textContent = invert
      ? "Invert flips the whole screen, light for dark, every time the key is down."
      : "The signal lamp flashes the whole screen with your message.";
    const fast = $("#lamp-warn .fast");
    fast.hidden = true;
    $("#lamp-go").textContent = invert ? "use it" : "start";
    $("#lamp-warn").hidden = false;
    $("#lamp-go").focus({ preventScroll: true });
    lampPending.rate = rate;
  }

  $("#lamp-go").addEventListener("click", () => {
    if (!lampPending) return;
    if (lampPending.fast && !lampPending.confirmedFast) {
      /* the second, explicit confirmation */
      lampPending.confirmedFast = true;
      const fast = $("#lamp-warn .fast");
      fast.textContent = `At this speed it flashes about ${lampPending.rate.toFixed(1)} times a second, faster than the 3-per-second safety guideline. Slow it down in settings, or start anyway.`;
      fast.hidden = false;
      $("#lamp-go").textContent = "start anyway";
      return;
    }
    lampAgreed = true;
    $("#lamp-warn").hidden = true;
    const go = lampPending.go;
    lampPending = null;
    go();
  });

  function cancelLamp() {
    $("#lamp-warn").hidden = true;
    const cancel = lampPending?.cancel;
    lampPending = null;
    cancel?.();
  }
  $("#lamp-cancel").addEventListener("click", cancelLamp);
  $("#lamp-warn .close").addEventListener("click", cancelLamp);

  function openLamp(words) {
    /* the ghost respects the eye: a hidden row stays hidden */
    $("#lamp .ghost-morse").textContent = state.hidden && state.mode === "type" ? "" : share.morseText(words);
    $("#lamp .ghost-text").textContent = state.hidden && state.mode === "key" ? "" : share.plainText(words);
    $("#lamp").classList.remove("on");
    $("#lamp").hidden = false;
  }

  function closeLamp() {
    if ($("#lamp").hidden) return;
    $("#lamp").hidden = true;
    $("#lamp").classList.remove("on");
  }

  /* tap or Escape (see ESCAPE): stop and leave */
  $("#lamp").addEventListener("click", () => { stopPlayback(); closeLamp(); });


  /* output toggles (♪ ☼ ≋), remembered on this device */
  const OUTPUTS_KEY = "dot-dash:tx-outputs";

  function applyOutputs() {
    sound.setEnabled(outputOn("sound"));
    outputs.quiet();             // a switched-off light / vibration lets go at once
    wantTorch();
    linkSettings();
  }

  /*
   * Settings follow their output: with ♪ off, the sound settings
   * grey out (☼: light, ≋: vibrate). Touching a greyed one switches
   * its output back on, and the touch carries on as normal (the
   * slider slides, the list opens).
   */
  function linkSettings() {
    for (const set of document.querySelectorAll("#tray [data-needs]")) {
      const on = outputOn(set.dataset.needs);
      set.classList.toggle("idle", !on);
      const select = set.querySelector("select");
      if (!select) continue;
      if (!on && select.value !== "off") {
        select.dataset.last = select.value;
        select.value = "off";
      } else if (on && select.value === "off") {
        select.value = choice(select);
      }
    }
  }

  function wake(event) {
    const set = event.target.closest?.("#tray [data-needs].idle");
    if (set) document.querySelector(`[data-out="${set.dataset.needs}"]`)?.click();
  }
  $("#tray").addEventListener("pointerdown", wake, true);
  $("#tray").addEventListener("focusin", wake, true);

  /* dot red / dash blue: one choice for this page and the reference
     (the same remembered setting) */
  {
    const box = $("#opt-color");
    try {
      const saved = localStorage.getItem("dot-dash:signal");
      if (saved !== null) box.checked = saved === "1";
    } catch { }
    const apply = () => {
      document.body.classList.toggle("signal", box.checked);
      try { localStorage.setItem("dot-dash:signal", box.checked ? "1" : "0"); } catch { }
    };
    box.addEventListener("change", apply);
    apply();
  }

  /* ctrl keys (the VBand adapter's paddles): remembered, off by default */
  {
    const box = $("#opt-ctrl");
    try { box.checked = localStorage.getItem("dot-dash:tx-ctrl-keys") === "1"; } catch { }
    box.addEventListener("change", () => {
      ctrlPaddle.down = false;
      try { localStorage.setItem("dot-dash:tx-ctrl-keys", box.checked ? "1" : "0"); } catch { }
    });
  }

  /* prosigns act (AR returns, HH erases …): remembered, on by default */
  {
    const box = $("#opt-prosigns");
    try { box.checked = localStorage.getItem("dot-dash:tx-prosigns") !== "0"; } catch { }
    box.addEventListener("change", () => {
      try { localStorage.setItem("dot-dash:tx-prosigns", box.checked ? "1" : "0"); } catch { }
    });
  }

  /* pretty play: remembered; switching it starts playback afresh */
  {
    const box = $("#opt-pretty");
    try { box.checked = localStorage.getItem("dot-dash:tx-pretty") === "1"; } catch { }
    box.addEventListener("change", () => {
      try { localStorage.setItem("dot-dash:tx-pretty", box.checked ? "1" : "0"); } catch { }
      stopPlayback();
    });
  }

  /* invert: the light theme (the same instrument printed on paper);
     shared with the reference page */
  {
    const box = $("#opt-theme");
    box.checked = document.documentElement.classList.contains("light");
    const apply = () => {
      document.documentElement.classList.toggle("light", box.checked);
      try { localStorage.setItem("dot-dash:theme", box.checked ? "light" : "dark"); } catch { }
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", box.checked ? "#ebe5d7" : "#1c1916");
      redrawTrace();
    };
    box.addEventListener("change", apply);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", box.checked ? "#ebe5d7" : "#1c1916");
  }

  /* light level: dims the lamp's glow and the signal lamp (a web
     page can't dim the flashlight: it's on or off) */
  function applyGlow() {
    document.documentElement.style.setProperty("--glow", Number($("#opt-glow").value) / 100);   // (the invert filter lives on the page root)
    /* the level dims the lamp (always on), the lit keys and the screen
       lights; a web page can't dim the flashlight itself */
    const torch = choice("#opt-light") === "torch" && outputOn("light");
    $("#opt-glow").closest(".fader").title = torch ? "the flashlight itself can only be on or off" : "";
  }
  $("#opt-glow").addEventListener("input", applyGlow);
  $("#opt-vibe").addEventListener("change", () => { if (outputOn("vibrate")) outputs.testBuzz(); });   // feel the new strength
  $("#opt-light").addEventListener("change", applyGlow);

  try {
    const saved = JSON.parse(localStorage.getItem(OUTPUTS_KEY)) ?? {};
    for (const [name, on] of Object.entries(saved)) {
      document.querySelector(`[data-out="${name}"]`)?.setAttribute("aria-pressed", String(on));
    }
    /* "lamp" used to be a light choice; it's always on now, so a saved
       lamp means: no extra light */
    if (JSON.parse(localStorage.getItem(SETTINGS_KEY))?.["opt-light"] === "lamp") {
      document.querySelector('[data-out="light"]').setAttribute("aria-pressed", "false");
    }
  } catch { }

  function setOutput(name, on) {
    const b = document.querySelector(`[data-out="${name}"]`);
    if (!b || outputOn(name) === on) return;
    b.setAttribute("aria-pressed", String(on));
    const saved = {};
    for (const o of document.querySelectorAll(".outputs button")) saved[o.dataset.out] = o.getAttribute("aria-pressed") === "true";
    try { localStorage.setItem(OUTPUTS_KEY, JSON.stringify(saved)); } catch { }
    applyOutputs();
  }

  for (const b of document.querySelectorAll(".outputs button")) {
    b.addEventListener("click", () => {
      setOutput(b.dataset.out, !outputOn(b.dataset.out));
      if (b.dataset.out === "sound" && sound.enabled) preview();
      /* vibration on: a short buzz now (inside the tap, which phones require) */
      if (b.dataset.out === "vibrate" && outputOn("vibrate") && outputs.testBuzz() === false) {
        toast("this browser won't vibrate");
      }
    });
  }

  /*
   * Sound, wave and light also have "off" in their lists: the same
   * switch as ♪ / ☼. Picking off turns the output off; picking
   * anything else turns it back on. While it's off the list shows
   * "off" and keeps the last real choice for when it comes back.
   */
  for (const select of document.querySelectorAll("#opt-sound, #opt-wave, #opt-light")) {
    select.addEventListener("change", () => {
      const name = select.closest("[data-needs]").dataset.needs;
      if (select.value === "off") return setOutput(name, false);
      select.dataset.last = select.value;
      setOutput(name, true);
    });
  }

  /* sound settings: live while sliding, a short sample on release */
  function applySound() {
    sound.setPitch(Number($("#opt-hz").value));
    sound.setVolume(Number($("#opt-vol").value) / 100);
    sound.setKind(choice("#opt-sound"));
    sound.setWave(choice("#opt-wave"));
    $("#opt-wave").disabled = choice("#opt-sound") === "sounder";   // the sounder has no wave
  }

  function preview() {
    sound.unlock();
    const t = timingNow();
    sound.mark(0, Math.max(t.unit, 120) / 1000);
  }

  $("#opt-hz").addEventListener("input", applySound);
  $("#opt-vol").addEventListener("input", applySound);
  $("#opt-sound").addEventListener("change", () => { applySound(); preview(); });
  $("#opt-wave").addEventListener("change", () => { applySound(); preview(); });
  $("#opt-hz").addEventListener("change", preview);
  $("#opt-vol").addEventListener("change", preview);


  /* at startup: the saved settings, applied */
  function start() {
    loadSettings();
    wpmWas = Number($("#opt-wpm").value);
    markFarnsCap();
    applySound();
    applyOutputs();
    applyGlow();
    lightBefore = choice("#opt-light");
  }

  return {
    outputs, setSignal, openTray, start,
    trayJustClosed: () => performance.now() - trayClosedAt < 600,
    wantsLamp, lampOk: rate => lampAgreed && rate <= SAFE_RATE, askLamp, openLamp, closeLamp, cancelLamp,
    torchOn: () => choice("#opt-light") === "torch" && outputOn("light")
  };
}

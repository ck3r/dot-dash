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
 *     start(hash)        load the saved settings and apply them, then
 *                        a link's, for the visit (true if it had some)
 *     linkedSettings()   how this sounds, for after a link's "#"
 *   }
 *   choice(select)       a list's real choice, even while it shows "off"
 */
import * as share from "../tx-share.js";
import { READING } from "../morse.js";
import { spokenWords } from "./voice.js";
import { createOutputs } from "../tx-outputs.js";
import { $, toast, flash } from "./dom.js";

/* the sound list: a tone's wave, the sounder, or the marks spoken
   (Di-Dah, Dot Dash: playback says them, keying keeps the tone) */
const WAVES = ["sine", "triangle", "square", "sawtooth"];
const CODE_SOUNDS = ["didah", "dotdash"];

/* a list whose "off" is a choice of its own (voice: no voice), not
   its output's switch, is just its value */
export function choice(select) {
  if (typeof select === "string") select = $(select);
  if (select.value !== "off" || select.dataset.off === "own") return select.value;
  const last = select.dataset.last;
  const real = [...select.options].filter(o => o.value !== "off" && !o.disabled);
  if (real.some(o => o.value === last)) return last;
  return (real.find(o => o.defaultSelected) ?? real[0]).value;   // the list's default
}

export function createSettings({ state, sound, logo, ctrlPaddle, timingNow, showInput, drawStats, stopPlayback, redrawTrace, reread }) {
  function openTray(open) {
    $("#tray").hidden = !open;
    $("#tray-toggle").setAttribute("aria-expanded", String(open));
    showInput();
    if (open) placeSwitches();
  }

  /*
   * The lists over their sliders: key across speed, sound over
   * vol, voice over pitch, light at the far end. Where two would
   * touch, both give way a little (keeping a gap), the rest stay put.
   * Phones (all four in one even row, tx.css) skip this.
   */
  const SWITCH_GAP = 8;
  const narrowTray = matchMedia("(max-width: 480px)");

  function placeSwitches() {
    const row = $(".switches");
    const all = ["#opt-key", "#opt-sound", "#opt-voice", "#opt-light"].map(id => $(id).closest("label"));
    if (narrowTray.matches) {
      row.classList.remove("placed");
      row.style.height = "";
      for (const l of all) l.style.left = "";
      $("#opt-key").style.width = "";
      return;
    }
    if ($("#tray").hidden) return;
    row.classList.add("placed");
    const base = row.getBoundingClientRect().left;
    /* key: across speed, over both its sliders, as far as the others
       leave room (they keep their own width; a narrow tablet, short) */
    const speed = $("#opt-wpm").closest(".group").getBoundingClientRect();
    const key = $("#opt-key");
    key.style.width = "";
    const short = all[0].offsetWidth;
    const room = row.getBoundingClientRect().width - all.slice(1).reduce((sum, l) => sum + l.offsetWidth, 0) - 3 * SWITCH_GAP;
    key.style.width = Math.round(Math.max(short, Math.min(speed.width, room))) + "px";
    const mid = id => { const b = $(id).getBoundingClientRect(); return b.left + b.width / 2 - base; };
    const labels = all;
    const w = labels.map(l => l.offsetWidth);
    /* the far edge: the row's own, the checkbox column runs the
       tray's whole height beside it */
    const end = row.getBoundingClientRect().width;
    const ideal = {
      "opt-key": () => 0,
      "opt-sound": l => mid("#opt-vol") - l.offsetWidth / 2,
      "opt-voice": l => mid("#opt-hz") - l.offsetWidth / 2,
      "opt-light": l => end - l.offsetWidth          // over no slider of its own: at the far end
    };
    const x = labels.map(l => ideal[l.querySelector("select, input").id](l));
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
    if (event.target.closest("#tray, #tray-toggle, .player, .outputs, #report-pop, #farns-pop, #suggest-pop, #flag-pop")) return;
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
    for (const id in visiting ?? {}) if (id in saved) saved[id] = visiting[id];   // a link's, not kept
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch { }
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; } catch { }
    saved = { ...saved, ...fromOldSound(saved["opt-sound"], saved["opt-wave"], saved["opt-voice"]) };
    for (const input of settingInputs()) {
      if (saved[input.id] === undefined) continue;
      if (input.tagName === "SELECT" && ![...input.options].some(o => o.value === saved[input.id])) continue;
      input.value = saved[input.id];
      const out = outputFor(input);
      if (out) out.value = input.value;
    }
  }

  $("#tray").addEventListener("change", saveSettings);


  /*
   * ============================================================
   * SETTINGS IN A LINK
   * ============================================================
   *
   * How a message sounds can travel with it, after "#" (which never
   * reaches a server, so the link's preview stays the same): only
   * what differs from the defaults, in words.
   *
   *   dot-da.sh/?/_...._.._/#wpm20.farns12.hz700.square.pretty
   *
   * Farnsworth is said only when it's slower than wpm: left out, it's
   * the same (#wpm20 is 20 straight through).
   *
   * Opened, they're used for that visit only, and a toast offers to
   * keep them; a setting changed by hand is yours again. What's about
   * this device (volume, the light, vibration, the key, the theme)
   * stays out. Later, the same few words can live on a profile.
   */
  /*
   * Sound used to be tone, sounder or a voice, with the wave a list of
   * its own; now sound is the wave or the sounder, and the voice has
   * its list. What was saved, or a link made then, reads the new way:
   *
   *   tone + square   →  sound square
   *   voice           →  sound (the wave), voice ALFA
   *
   * Then the code voices moved from voice to sound: they say the
   * marks, not the letters, so they're how the code sounds
   *
   *   voice Di-Dah    →  sound Di-Dah, voice off
   */
  const OLD_VOICES = { voice: "phonetic", letters: "letters" };
  function fromOldSound(sound, wave, voice) {
    if (CODE_SOUNDS.includes(voice)) return { "opt-sound": voice, "opt-voice": "off" };
    if (sound === "tone") return { "opt-sound": wave ?? "sine" };
    if (sound in OLD_VOICES) return { "opt-sound": wave ?? "sine", "opt-voice": OLD_VOICES[sound] };
    return {};
  }

  const LINKED = [
    { id: "opt-wpm", name: "wpm", say: v => `${v} wpm` },     // a number after its name
    { id: "opt-fwpm", name: "farns", say: v => `farns. ${v}` },
    { id: "opt-hz", name: "hz", say: v => `${v} Hz` },
    { id: "opt-sound" },                                       // the choice's own word (not "off")
    { id: "opt-voice" },
    { id: "opt-pretty", name: "pretty", key: "dot-dash:tx-pretty", say: on => on ? "pretty play" : "as keyed" },   // there, or no-pretty
    { id: "opt-prosigns", name: "prosigns", key: "dot-dash:tx-prosigns", say: on => on ? "prosigns" : "no prosigns", apply: on => { READING.pro = on; } },
    { id: "opt-cut", name: "cut", key: "dot-dash:tx-cut", say: on => on ? "cut numbers" : "no cut", apply: on => { READING.cut = on; } }
  ];
  let visiting = null;     // id → your own value, while a link's is in use

  const defaultOf = select => ([...select.options].find(o => o.defaultSelected) ?? select.options[0]).value;
  const valueOf = input => input.type === "checkbox" ? input.checked : input.tagName === "SELECT" ? choice(input) : input.value;

  function linkedSettings() {
    const parts = [];
    for (const { id, name } of LINKED) {
      const input = $("#" + id);
      if (input.type === "checkbox") {
        if (input.checked !== input.defaultChecked) parts.push(input.checked ? name : "no-" + name);
      } else if (input.tagName === "SELECT") {
        if (choice(input) !== defaultOf(input)) parts.push(choice(input));
      } else if (input.value !== (id === "opt-fwpm" ? $("#opt-wpm").value : input.defaultValue)) parts.push(name + input.value);
    }
    return parts.join(".");
  }

  /* a link's word → [input, value], or null if it isn't one of ours */
  function readPart(part) {
    if (part === "voice") part = "phonetic";       // an older link's words (fromOldSound)
    if (part === "tone") part = "sine";
    for (const { id, name } of LINKED) {
      const input = $("#" + id);
      if (input.type === "checkbox") {
        if (part === name || part === "no-" + name) return [input, part === name];
      } else if (input.tagName === "SELECT") {
        if (part !== "off" && [...input.options].some(o => o.value === part && !o.disabled)) return [input, part];
      } else {
        const n = part.startsWith(name) && part.slice(name.length);
        if (n && /^\d+$/.test(n)) return [input, String(Math.max(Number(input.min), Math.min(Number(input.max), Number(n))))];
      }
    }
    return null;
  }

  function setValue(input, v) {
    if (input.type === "checkbox") input.checked = v;
    else if (input.tagName === "SELECT" && input.value === "off" && input.dataset.off !== "own") input.dataset.last = v;   // muted: its choice for later
    else input.value = v;
  }

  /* a link's settings, for this visit; what it changed, said in a toast */
  function visit(hash) {
    const parts = hash.replace(/^#/, "").split(".").map(p => p.toLowerCase()).filter(Boolean);
    const read = parts.map(readPart);
    if (!parts.length || read.some(r => !r)) return false;     // not settings (or not ours)
    const wpmRead = read.find(([input]) => input.id === "opt-wpm");
    if (!read.some(([input]) => input.id === "opt-fwpm")) read.push([$("#opt-fwpm"), wpmRead?.[1] ?? $("#opt-wpm").value]);
    const own = {}, said = [];
    for (const [input, v] of read) {
      if (String(valueOf(input)) === String(v)) continue;
      own[input.id] ??= valueOf(input);
      setValue(input, v);
      LINKED.find(l => l.id === input.id).apply?.(v);
    }
    /* farnsworth is never faster than wpm */
    const wpm = $("#opt-wpm"), fwpm = $("#opt-fwpm");
    if (Number(fwpm.value) > Number(wpm.value)) { own[fwpm.id] ??= fwpm.value; fwpm.value = wpm.value; }
    for (const id in own) {
      const input = $("#" + id), out = outputFor(input), l = LINKED.find(l => l.id === id);
      if (out) out.value = input.value;
      said.push(l.say ? l.say(valueOf(input)) : valueOf(input));
    }
    if (!said.length) return true;
    visiting = own;
    toast(`the link's settings: ${said.join(" · ")}`, { ms: 8000, action: ["keep", keepVisit] });
    return true;
  }

  function keepVisit() {
    if (!visiting) return;
    for (const { id, key } of LINKED) {
      if (!key || !(id in visiting)) continue;
      try { localStorage.setItem(key, $("#" + id).checked ? "1" : "0"); } catch { }
    }
    visiting = null;
    saveSettings();
    toast("kept");
  }

  /* changed by hand: that one's yours again (before it's saved) */
  for (const t of ["input", "change"]) {
    $("#tray").addEventListener(t, event => { if (visiting) delete visiting[event.target.id]; }, true);
  }

  /* each fader's level, 0 … 1, for its brass fill (tx.css) */
  const markLevel = input => input.style.setProperty("--p", String((input.value - input.min) / (input.max - input.min)));
  const markLevels = () => { for (const input of document.querySelectorAll("#tray input[type=range]")) markLevel(input); };

  /* "farns." says what it is: a popup, not the slider (tx.css) */
  function openFarns(open) {
    $("#farns-pop").hidden = !open;
    $("#farns-what").setAttribute("aria-expanded", String(open));
    if (open) $("#farns-ok").focus({ preventScroll: true });
  }
  $("#farns-what").addEventListener("click", event => {
    event.preventDefault();     // inside the slider's label: not a tap on the slider
    openFarns(true);
  });
  for (const b of ["#farns-ok", "#farns-pop .close"]) $(b).addEventListener("click", () => openFarns(false));

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
      markLevel(input);
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
      strength: 50     // a strength of its own waits for the native app
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
  $("#opt-light").addEventListener("change", () => {
    outputs.quiet();
    if (choice("#opt-light") !== "torch") outputs.releaseTorch();
    wantTorch();
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

  function askLamp(rate, go, { cancel = null } = {}) {
    lampPending = { go, cancel, fast: rate > SAFE_RATE, confirmedFast: false };
    const fast = $("#lamp-warn .fast");
    fast.hidden = true;
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
      if (!select || select.dataset.off === "own") continue;   // the voice keeps its choice, greyed
      if (!on && select.value !== "off") {
        select.dataset.last = select.value;
        select.value = "off";
      } else if (on && select.value === "off") {
        select.value = choice(select);
      }
    }
  }

  /* pitch is the tone's: greyed with the sounder, which has none.
     Touched, the tone comes back, with the wave it had. The voice
     list is greyed while the sound says the marks (Di-Dah): playback
     says one or the other, and a touch on it brings the tone back too */
  const pitch = () => $("#opt-hz").closest(".fader");
  const voiceSet = () => $("#opt-voice").closest("label");
  function markPitch() {
    const sounding = choice("#opt-sound");
    pitch().classList.toggle("idle", sounding === "sounder");
    voiceSet().classList.toggle("covered", CODE_SOUNDS.includes(sounding));
    if (WAVES.includes(sounding)) $("#opt-sound").dataset.wave = sounding;
  }

  function wake(event) {
    const set = event.target.closest?.("#tray [data-needs].idle");
    if (set) document.querySelector(`[data-out="${set.dataset.needs}"]`)?.click();
    const toTone = event.target.closest?.(".fader.idle") === pitch() || event.target.closest?.(".covered") === voiceSet();
    if (toTone) {
      const select = $("#opt-sound");
      select.value = select.dataset.wave ?? "sine";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
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

  /* the mouse as the key (tx/keys.js): remembered, off by default */
  {
    const box = $("#opt-mouse");
    try { box.checked = localStorage.getItem("dot-dash:tx-mouse-key") === "1"; } catch { }
    box.addEventListener("change", () => {
      try { localStorage.setItem("dot-dash:tx-mouse-key", box.checked ? "1" : "0"); } catch { }
    });
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

  /*
   * The reading (morse.js READING): prosigns (<AR>, not +; on by
   * default, and keyed they act: AR returns, HH erases …) and cut
   * (5NN as 599; off by default). Remembered. A change rereads the
   * line being written; what's sent keeps the reading it went with.
   */
  for (const [id, key, on, part] of [
    ["#opt-prosigns", "dot-dash:tx-prosigns", true, "pro"],
    ["#opt-cut", "dot-dash:tx-cut", false, "cut"]
  ]) {
    const box = $(id);
    try { box.checked = on ? localStorage.getItem(key) !== "0" : localStorage.getItem(key) === "1"; } catch { }
    READING[part] = box.checked;
    box.addEventListener("change", () => {
      READING[part] = box.checked;
      try { localStorage.setItem(key, box.checked ? "1" : "0"); } catch { }
      reread(part);
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

  /* vibration waits for the native app (strength, a sharp tap per dit,
     roadmap): the toggle says so, and stays off */
  document.querySelector('[data-out="vibrate"]').setAttribute("aria-pressed", "false");

  for (const b of document.querySelectorAll(".outputs button")) {
    b.addEventListener("click", () => {
      if (b.dataset.out === "vibrate") return flash(b, "soon");
      setOutput(b.dataset.out, !outputOn(b.dataset.out));
      if (b.dataset.out === "sound" && sound.enabled) preview();
    });
  }

  /*
   * Sound and light also have "off" in their lists: the same
   * switch as ♪ / ☼. Picking off turns the output off; picking
   * anything else turns it back on. While it's off the list shows
   * "off" and keeps the last real choice for when it comes back.
   */
  for (const select of document.querySelectorAll("#opt-sound, #opt-light")) {
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
    const sounding = choice("#opt-sound");
    sound.setKind(sounding);       // Di-Dah keys with the tone; it's playback that says the marks
    sound.setWave(sounding);       // the sounder and Di-Dah aren't waves: the tone keeps its last
    sound.setSpeech(CODE_SOUNDS.includes(sounding) ? sounding : $("#opt-voice").value);
    markPitch();
  }

  function preview() {
    sound.unlock();
    if (sound.speaks) {
      sound.voiceReady().then(() => sound.speak(spokenWords("A")), () => toast("couldn't load the voice"));
      return;
    }
    const t = timingNow();
    sound.mark(0, Math.max(t.unit, 120) / 1000);
  }

  $("#opt-hz").addEventListener("input", applySound);
  $("#opt-vol").addEventListener("input", applySound);
  $("#opt-sound").addEventListener("change", () => { applySound(); preview(); });
  /* a voice chosen with ♪ off turns it on, as the greyed lists do */
  $("#opt-voice").addEventListener("change", () => {
    if ($("#opt-voice").value !== "off") setOutput("sound", true);
    applySound(); preview();
  });
  $("#opt-hz").addEventListener("change", preview);
  $("#opt-vol").addEventListener("change", preview);


  /* at startup: the saved settings, then a link's, applied */
  function start(hash = "") {
    loadSettings();
    const linked = visit(hash);
    wpmWas = Number($("#opt-wpm").value);
    markFarnsCap();
    markLevels();
    applySound();
    applyOutputs();
    return linked;
  }

  return {
    outputs, setSignal, openTray, start, linkedSettings,
    trayJustClosed: () => performance.now() - trayClosedAt < 600,
    wantsLamp, lampOk: rate => lampAgreed && rate <= SAFE_RATE, askLamp, openLamp, closeLamp, cancelLamp,
    torchOn: () => choice("#opt-light") === "torch" && outputOn("light")
  };
}

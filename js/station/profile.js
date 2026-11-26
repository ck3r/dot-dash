/*
 * The profile (the ring at the top right): a callsign and your
 * keying, kept on this device. No account, nothing sent: the same
 * promise as the tape.
 *
 *   createProfile({ stats, wear }) → {
 *     openProfile(open)      the popup (#profile-pop)
 *   }
 *
 *   ┌ profile ─────────────────── × ┐
 *   │ callsign  [ KD9XYZ    ]       │
 *   │ since 3 Nov 2026              │
 *   │ letters  310   words   52     │
 *   │ lines     18   fixes   23     │
 *   │ keying  14 min   speed 18 wpm │
 *   │ most     E T A I N            │
 *   │ slowest  Q Y X                │
 *   │          [x] color [ ] invert │   how it looks: preferences
 *   │ wear                          │
 *   │ ┌──────────┐ ┌──────────────┐ │   dit and dah as on the pad,
 *   │ │   ▒▓  •  │ │      ━  ░▒   │ │   worn where the finger lands
 *   │ │   dit    │ │     dah      │ │   (js/station/wear.js)
 *   │ └──────────┘ └──────────────┘ │
 *   │ [clear stats]                 │
 *   │ - - - - - - - - - - - - - - - │
 *   │ on another device             │   the profile as a file (below)
 *   │ [save to a file] [load a file]│
 *   │ - - - - - - - - - - - - - - - │
 *   │          made by ck3r         │
 *   └───────────────────────────────┘
 *
 * With a callsign, the ring holds its first character, in bold
 * (docs/roadmap.md, Profiles: the frame of brass marks comes later).
 */
import { $, toast } from "../shared/dom.js";

const KEY = "dot-dash:profile";

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { callsign: typeof saved?.callsign === "string" ? saved.callsign : "" };
  } catch { return { callsign: "" }; }
}

/* letters, digits and /, as callsigns are written: W1AW, VE3/G4ABC */
const tidy = text => text.toUpperCase().replace(/[^A-Z0-9/]/g, "").slice(0, 12);

const DATE = { day: "numeric", month: "short", year: "numeric" };

export function createProfile({ stats, wear }) {
  let profile = loadProfile();
  const pop = $("#profile-pop"), button = $("#profile"), call = $("#profile-call");

  const saveProfile = () => {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* storage blocked */ }
  };

  /* the ring: the callsign's first character, or the outline */
  function drawButton() {
    const initial = profile.callsign[0] ?? "";
    button.querySelector(".initial").textContent = initial;
    button.classList.toggle("signed", !!initial);
    const name = profile.callsign ? `profile: ${profile.callsign}` : "profile";
    button.title = name;
    button.setAttribute("aria-label", name);
  }

  function draw() {
    const s = stats.read();
    const n = x => x.toLocaleString("en");
    const set = (id, text) => { $(id).textContent = text; };
    set("#profile-since", `since ${new Date(s.since).toLocaleDateString("en-GB", DATE)}`);
    set("#stat-letters", n(s.letters));
    set("#stat-words", n(s.words));
    set("#stat-lines", n(s.lines));
    set("#stat-fixes", n(s.fixes));
    const min = Math.round(s.ms / 60000);
    set("#stat-time", s.ms < 60000 ? (s.ms ? "< 1 min" : "–") : `${n(min)} min`);
    set("#stat-speed", s.speed ? `${s.speed} wpm` : "–");
    set("#stat-most", s.most.slice(0, 6).join(" ") || "–");
    set("#stat-slowest", s.slowest.slice(0, 3).join(" ") || "–");
    $("#profile-empty").hidden = s.letters > 0;
    drawWear();
  }

  /*
   * wear: dit and dah side by side, one height, the row's width
   * between them, each the shape of its key on the pad (as it is now,
   * or as it was when worn, with the keys put away):
   *
   *   ┌────────┐ ┌────────────┐
   *   │   ▒▓   │ │     ░▒     │   widths by the keys' shapes
   *   └────────┘ └────────────┘
   */
  const WEAR = ["dit", "dah"], TALLEST = 220;
  function drawWear() {
    const { keys } = wear.read();
    const row = $("#wear-keys"), note = $("#wear-note");
    const worn = WEAR.filter(k => keys[k]?.n);
    note.textContent = worn.length
      ? worn.map(k => `${k}: ${keys[k].n.toLocaleString("en")} press${keys[k].n === 1 ? "" : "es"}`).join(", ")
      : "Touch the keys (on a touch screen) and where your finger lands wears in here, key by key.";
    const aspect = k => {
      const r = $(`#pad .key.${k}`)?.getBoundingClientRect();
      const a = r?.width && r.height ? r.width / r.height : keys[k]?.aspect || (k === "dit" ? 0.6 : 0.85);
      return Math.max(0.3, Math.min(2.5, a));
    };
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const room = row.clientWidth - gap * (WEAR.length - 1);
    if (room <= 0) return;
    const shapes = WEAR.map(aspect), sum = shapes.reduce((a, b) => a + b, 0);
    const height = Math.min(TALLEST, room / sum);
    const css = getComputedStyle(document.documentElement);
    const colours = { brass: css.getPropertyValue("--brass").trim(), wire: css.getPropertyValue("--wire").trim() };
    WEAR.forEach((k, i) => {
      const figure = row.querySelector(`[data-key="${k}"]`);
      figure.classList.toggle("worn", !!keys[k]?.n);
      wear.draw(figure.querySelector("canvas"), k, colours, { width: Math.floor(height * shapes[i]), height });
    });
  }

  function openProfile(open) {
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    call.value = profile.callsign;
    draw();
    resetClear();
    resetLoad();
    $("#profile-pop .close").focus({ preventScroll: true });
  }

  /* invert is here now: the wear's brass and wire are the theme's */
  $("#opt-theme").addEventListener("change", () => { if (!pop.hidden) drawWear(); });

  button.addEventListener("click", () => openProfile(pop.hidden));
  $("#profile-pop .close").addEventListener("click", () => openProfile(false));

  call.addEventListener("input", () => {
    const at = call.selectionStart, clean = tidy(call.value);
    if (clean !== call.value) { call.value = clean; call.setSelectionRange(at, at); }
    profile.callsign = clean;
    saveProfile();
    drawButton();
  });
  call.addEventListener("keydown", event => { if (event.key === "Enter") call.blur(); });

  /* clear: tap twice, as for the history (the privacy popup) */
  const clearButton = $("#profile-clear");
  let armed = null;
  function resetClear() {
    clearTimeout(armed);
    armed = null;
    clearButton.classList.remove("armed");
    clearButton.disabled = !stats.read().marks && !wear.read().favourite;
    clearButton.textContent = clearButton.disabled ? "nothing to clear" : "clear stats";
  }
  clearButton.addEventListener("click", () => {
    if (armed) {
      resetClear();
      stats.clear();
      wear.clear();
      draw();
      clearButton.disabled = true;
      clearButton.textContent = "stats cleared";
      return;
    }
    clearButton.classList.add("armed");
    clearButton.textContent = "tap again to clear your stats";
    armed = setTimeout(resetClear, 3000);
  });

  /*
   * The profile as a file: everything the site keeps on this device
   * (localStorage, "dot-dash:…") but the messages, as JSON, to keep or
   * to carry to another device and load there. Loading asks twice,
   * replaces this device's, and reloads, so each part reads its own
   * again. Nothing leaves the device but by the person's own hand.
   *
   *   { "dot-da.sh": "profile", "version": 1, "saved": "2026-11-24T…",
   *     "keep": { "tx-settings": "{…}", "stats": "{…}", … } }
   */
  const PREFIX = "dot-dash:", MESSAGES = /^(tx-history|tx-line)$/;
  function kept() {
    const keep = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && !MESSAGES.test(k.slice(PREFIX.length))) keep[k.slice(PREFIX.length)] = localStorage.getItem(k);
    }
    return keep;
  }
  $("#profile-save").addEventListener("click", async () => {
    let keep;
    try { keep = kept(); } catch { toast("this browser keeps nothing here: nothing to save"); return; }
    const now = new Date().toISOString();
    const body = JSON.stringify({ "dot-da.sh": "profile", version: 1, saved: now, keep }, null, 1);
    const name = (profile.callsign || now.slice(0, 10)).toLowerCase().replace(/\//g, "-");
    const { save } = await import("../shared/files.js");
    save(new Blob([body + "\n"], { type: "application/json" }), `dot-da.sh-profile_${name}.json`);
    toast("profile saved to a file");
  });

  /* load: pick a file, then a second tap to replace (as clear asks) */
  const loadButton = $("#profile-load"), picker = $("#profile-file");
  let waiting = null;
  function resetLoad() {
    clearTimeout(waiting?.timer);
    waiting = null;
    loadButton.classList.remove("armed");
    loadButton.textContent = "load a file";
  }
  loadButton.addEventListener("click", () => {
    if (!waiting) { picker.value = ""; picker.click(); return; }
    const { keep, from } = waiting;
    resetLoad();
    try {
      for (const k of Object.keys(kept())) localStorage.removeItem(PREFIX + k);
      for (const [k, v] of Object.entries(keep)) localStorage.setItem(PREFIX + k, v);
      sessionStorage.setItem(PREFIX + "loaded", from);
    } catch { toast("couldn't write to this browser's storage"); return; }
    location.reload();
  });
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    if (!file) return;
    let keep, saved;
    try {
      const data = JSON.parse(await file.text());
      if (data?.["dot-da.sh"] !== "profile" || !data.keep || typeof data.keep !== "object") throw new Error();
      keep = Object.fromEntries(Object.entries(data.keep)
        .filter(([k, v]) => typeof v === "string" && /^[a-z0-9-]+$/.test(k) && !MESSAGES.test(k)));
      saved = Date.parse(data.saved);
    } catch { toast("that isn't a dot-da.sh profile"); return; }
    let who = "";
    try { who = JSON.parse(keep.profile).callsign ?? ""; } catch { }
    const from = [who, isNaN(saved) ? "" : new Date(saved).toLocaleDateString("en-GB", DATE)].filter(Boolean).join(", ") || file.name;
    waiting = { keep, from, timer: setTimeout(resetLoad, 6000) };
    loadButton.classList.add("armed");
    loadButton.textContent = `tap again: replace with ${from}`;
  });
  /* after the reload: say it worked */
  try {
    const from = sessionStorage.getItem(PREFIX + "loaded");
    if (from) {
      sessionStorage.removeItem(PREFIX + "loaded");
      setTimeout(() => toast(`profile loaded: ${from}`, { ms: 3000 }), 300);
    }
  } catch { }


  drawButton();
  return { openProfile };
}

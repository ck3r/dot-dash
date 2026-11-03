/*
 * The profile (the ring at the top right): a callsign and your
 * keying, kept on this device. No account, nothing sent: the same
 * promise as the tape.
 *
 *   createProfile({ stats, wear, practise }) → {
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
 *   │ wear  [dit] dah ⌫ switch      │   the most worn key first
 *   │ ┌──────┐                      │   (js/tx/wear.js)
 *   │ │  ▒▓  │  dit: 412 presses    │
 *   │ └──────┘                      │
 *   │ [clear stats]                 │
 *   │ copy practice, Koch order     │
 *   │ [−] K M R [+]       [▷ start] │   practise(words): js/tx/main.js
 *   └───────────────────────────────┘
 *
 * With a callsign, the ring holds its first character, in bold
 * (docs/roadmap.md, Profiles: the frame of brass marks comes later).
 */
import { $, el } from "./dom.js";
import { KOCH, KOCH_MIN, groups } from "./practice.js";

const KEY = "dot-dash:profile";

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    const koch = Number.isInteger(saved?.koch) ? Math.min(KOCH.length, Math.max(KOCH_MIN, saved.koch)) : KOCH_MIN;
    return { callsign: typeof saved?.callsign === "string" ? saved.callsign : "", koch };
  } catch { return { callsign: "", koch: KOCH_MIN }; }
}

/* letters, digits and /, as callsigns are written: W1AW, VE3/G4ABC */
const tidy = text => text.toUpperCase().replace(/[^A-Z0-9/]/g, "").slice(0, 12);

const DATE = { day: "numeric", month: "short", year: "numeric" };

export function createProfile({ stats, wear, practise }) {
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

  /* wear: a chip for each key pressed (by touch), the most worn
     chosen when the profile opens; another chip shows that key */
  let wearShown = null;
  function drawWear(name) {
    const { keys, favourite } = wear.read();
    wearShown = name ?? favourite;
    const row = $("#wear-keys"), canvas = $("#wear-canvas"), note = $("#wear-note");
    row.textContent = "";
    const names = Object.keys(keys).sort((a, b) => keys[b].n - keys[a].n);
    for (const k of names) {
      const chip = el("button", "quiet", k);
      chip.type = "button";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(k === wearShown));
      chip.addEventListener("click", () => drawWear(k));
      row.append(chip);
    }
    canvas.hidden = !wearShown;
    if (!wearShown) {
      note.textContent = "Touch the keys (on a touch screen) and where your finger lands wears in here, key by key.";
      return;
    }
    const css = getComputedStyle(document.documentElement);
    wear.draw(canvas, wearShown, { brass: css.getPropertyValue("--brass").trim(), wire: css.getPropertyValue("--wire").trim() });
    const n = keys[wearShown].n;
    note.textContent = `${wearShown}: ${n.toLocaleString("en")} press${n === 1 ? "" : "es"}${wearShown === favourite && names.length > 1 ? ", the most worn" : ""}`;
  }

  function openProfile(open) {
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    call.value = profile.callsign;
    draw();
    resetClear();
    $("#profile-pop .close").focus({ preventScroll: true });
  }

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

  /* copy practice: how many Koch characters, the newest in paper */
  function drawKoch() {
    const box = $("#koch-set");
    box.textContent = "";
    KOCH.slice(0, profile.koch).forEach((ch, i) => box.append(el("span", i === profile.koch - 1 ? "new" : "", ch)));
    $("#koch-less").disabled = profile.koch <= KOCH_MIN;
    $("#koch-more").disabled = profile.koch >= KOCH.length;
  }
  const step = by => {
    profile.koch = Math.min(KOCH.length, Math.max(KOCH_MIN, profile.koch + by));
    saveProfile();
    drawKoch();
  };
  $("#koch-less").addEventListener("click", () => step(-1));
  $("#koch-more").addEventListener("click", () => step(1));
  $("#practice-go").addEventListener("click", () => {
    openProfile(false);
    practise(groups(profile.koch));
  });

  drawButton();
  drawKoch();
  return { openProfile };
}

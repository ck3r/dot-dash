/*
 * What a game keeps between visits (localStorage), for a browser that
 * may not let it: a private window, storage blocked. Nothing kept is
 * needed to play, so a failure is passed over.
 *
 *   keep(key, value)    put it by
 *   kept(key)           what was put by, or null
 *   keptJSON(key)       the same, read as JSON: {} if there's none
 */
export const keep = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };
export const kept = key => { try { return localStorage.getItem(key); } catch { return null; } };
export const keptJSON = key => { try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; } };

/* a tick box that's kept: ticked as it was left, and put by on a change */
export function keptBox(box, key, { fallback = false, change } = {}) {
  const was = kept(key);
  box.checked = was === null ? fallback : was === "1";
  box.addEventListener("change", () => {
    keep(key, box.checked ? "1" : "0");
    box.blur();             // or the space bar would tick it, as well as what the game has it do
    change?.();
  });
  return () => box.checked;
}

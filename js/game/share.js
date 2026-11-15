/*
 * A game's share menu: where the station's is (the word at the top
 * right, the menu under it), with rows of the game's own.
 *
 *                      share  ◯
 *   ┌─ share ─────────────────────┐
 *   │ copy link     dot-da.sh/h…  │   each row: what it does, and a
 *   │ copy result   HELLO WORLD…  │   peek at what would be copied
 *   │ share…                      │   (the system's sheet, where
 *   └─────────────────────────────┘    there is one)
 *
 *   createShare({ toggle, menu, copy, native, opened }) → {
 *     open(on)      show it, or put it away
 *     isOpen()
 *   }
 *
 * toggle: the word; menu: the box, with a .close, a .share-note, and
 * rows: <button data-do="copy-NAME"> with a .peek inside it, and one
 * data-do="share" in a row of its own that's hidden where the
 * browser has no sheet. copy: { NAME: () => the text, or "" if
 * there's none just now (the row is greyed) }; native(): what the
 * sheet is handed ({ title, text, url }); opened(): it's about to
 * show (stop what's running).
 */
const short = text => text.replace(/^https?:\/\//, "");

export function createShare({ toggle, menu, copy = {}, native, opened }) {
  const note = menu.querySelector(".share-note");
  const sheet = menu.querySelector('[data-do="share"]');
  if (sheet) sheet.closest(".rows").hidden = !(native && navigator.share);

  const isOpen = () => !menu.hidden;

  function open(on) {
    if (on === isOpen()) return;
    if (on) {
      opened?.();
      for (const [name, text] of Object.entries(copy)) {
        const row = menu.querySelector(`[data-do="copy-${name}"]`);
        const now = text();
        row.disabled = !now;
        row.querySelector(".peek").textContent = short(now || "");
      }
      note.textContent = "";
      /* just under the word, as the station's */
      menu.style.setProperty("--share-top", `${Math.round(toggle.getBoundingClientRect().bottom + 6)}px`);
    }
    menu.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    toggle.blur();
  }

  toggle.addEventListener("click", () => open(!isOpen()));
  menu.querySelector(".close").addEventListener("click", () => open(false));
  /* a press anywhere else puts it away */
  addEventListener("pointerdown", event => {
    if (isOpen() && !event.target.closest?.(".share-menu") && !toggle.contains(event.target)) open(false);
  }, true);

  menu.addEventListener("click", async event => {
    const act = event.target.closest?.("[data-do]")?.dataset.do;
    if (!act) return;
    try {
      if (act === "share") return await navigator.share(native());
      await navigator.clipboard.writeText(copy[act.replace("copy-", "")]());
      note.textContent = "copied";
    } catch (error) {
      /* the sheet shut without sharing is no failure */
      if (error?.name !== "AbortError") note.textContent = "couldn't: the browser said no";
    }
  });

  return { open, isOpen };
}

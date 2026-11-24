/*
 * A row's or a card's copy menu, on the reference: right-click it, or
 * hold it on a phone (the browser calls both "contextmenu"), and what
 * it is goes to the clipboard a tap at a time. Esc, a tap outside or
 * scrolling away (more than a nudge) closes it.
 *
 *          K ─┐ held
 *     ┌───────┴──────────┐
 *     │ K        char    │
 *     │ -.-      morse   │
 *     │ Kilo     name    │
 *     │ link     its page│
 *     └──────────────────┘
 *
 *   copyMenus({ rows, entryOf, pageOf })
 *     rows      the selector of what opens it (a row's link, a card's)
 *     entryOf   a link → its list row (a card's is drawn from one)
 *     pageOf    marks → that character's own page, if it has one
 */
import { siteOrigin } from "../core/where.js";

export function copyMenus({ rows, entryOf = a => a, pageOf = () => null }) {
  let menu = null, from = null, scrolledAt = 0;

  function close(focus = false) {
    if (!menu) return;
    menu.remove();
    menu = null;
    if (focus) from?.focus({ preventScroll: true });
    from = null;
  }

  function open(a, x, y) {
    close();
    const row = entryOf(a);
    const text = q => row.querySelector(q)?.textContent.trim() ?? "";
    const marks = text(".code").replace(/\s+/g, " ");
    const ch = text(".label");
    const name = text(".say");
    const own = pageOf(marks.replace(/\s/g, ""));
    const path = own ?? new URL(a.href).pathname + new URL(a.href).search;
    const items = [
      [ch, "char", ch],
      [marks, "morse", marks],
      [name, "name", name],
      ["link", own ? "its page" : "here", siteOrigin() + path]
    ].filter(([shown]) => shown);

    from = a;
    scrolledAt = scrollY;
    menu = Object.assign(document.createElement("div"), { className: "copy-menu" });
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `copy ${ch || marks}`);
    const list = Object.assign(document.createElement("ul"), { className: "crumb-list" });
    for (const [shown, what, value] of items) {
      const b = Object.assign(document.createElement("button"), { type: "button" });
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-label", `copy ${what}: ${shown}`);
      const left = Object.assign(document.createElement("span"), { className: "copy-value", textContent: shown });
      const right = Object.assign(document.createElement("span"), { className: "copy-what", textContent: what });
      b.append(left, right);
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(value);
          right.textContent = "copied";
        } catch {
          right.textContent = "couldn't";
        }
        setTimeout(() => close(true), 600);
      });
      const li = document.createElement("li");
      li.append(b);
      list.append(li);
    }
    menu.append(list);
    document.body.append(menu);

    /* by the pointer (or the row, from the keyboard), kept on screen */
    const r = a.getBoundingClientRect();
    if (!x && !y) { x = r.left; y = r.bottom; }
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, y + h + 8 > innerHeight ? y - h : y)}px`;
    menu.querySelector("button").focus({ preventScroll: true });
  }

  document.addEventListener("contextmenu", event => {
    const a = event.target.closest?.(rows);
    if (!a) return;
    event.preventDefault();   // ours, not the browser's link menu
    open(a, event.clientX, event.clientY);
  });
  document.addEventListener("pointerdown", event => { if (menu && !menu.contains(event.target)) close(); }, true);
  document.addEventListener("keydown", event => {
    if (!menu) return;
    if (event.key === "Escape") { event.stopPropagation(); close(true); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const all = [...menu.querySelectorAll("button")], at = all.indexOf(document.activeElement);
      all[(at + (event.key === "ArrowDown" ? 1 : all.length - 1)) % all.length].focus();
    }
  }, true);
  /* scrolled away: closed. Not on a nudge (a fling's last scroll can
     land just after a long press opened it) */
  addEventListener("scroll", () => { if (menu && Math.abs(scrollY - scrolledAt) > 40) close(); }, { passive: true });
  addEventListener("resize", () => close());
}

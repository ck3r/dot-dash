/*
 * The bar at the top of every page: the name, where you are, share
 * and the profile. One line, and the last crumb is the page's heading.
 *
 *   dot-da.sh / REF / K ▾                         share  (◯)
 *   └─ home    └─ a crumb opens the pages beside it
 *
 * The trail is the address's: /ref/k/ is REF / K. (K is a letter, a
 * prosign and an abbreviation, so no one table is its parent.)
 *
 * Every crumb but the name opens its siblings: the pages at its own
 * level, itself among them, marked. So REF lists STATION, KEY HERO,
 * REF …, and K lists what's in REF, its tables (folders), with the
 * one it's in already open and K marked there. The name is a plain
 * link home.
 *
 * The page writes its crumbs as plain links (and its heading as an
 * h1), so they work with no script; this turns each into a button.
 * Each says which list it belongs to (data-crumb): "top", "ref", or a
 * group of the reference ("alphabet"), whose members npm run ref
 * writes into js/shared/nav-tables.js.
 *
 * The lists keep the content's own order, never alphabetical or by
 * use: A to Z is already in order, symbols and prosigns as the
 * reference's tables have them, the station before the game before
 * the reference. Nothing reshuffles, so a page is where it was.
 *
 * Too wide (a phone, a long trail): the middle crumbs fold, one at a
 * time from the left, into "…", which opens them.
 *
 *   dot-da.sh / … / K ▾                           share  (◯)
 *
 * A page with no share of its own (the station's and Key hero's are
 * theirs) gets one here: its link, copied or handed to the phone; and
 * on a character's page, its pictures to keep, each to save.
 */
import { GROUPS } from "./nav-tables.js";
import { siteOrigin } from "../core/where.js";

/* the site's top level: what you came for first, a rule, then the small pages, the manual (help) first */
const TOP = [["/", "STATION"], ["/hero/", "KEY HERO"], ["/ref/", "REF"], null,
  ["/manual/", "MANUAL"], ["/design/", "DESIGN NOTES"], ["/privacy/", "PRIVACY"], ["/extension/", "EXTENSION"], ["/bookmarklet/", "BOOKMARKLET"]];

/* the reference: its six tables in its own order, a rule, then the pages that gather */
const REF = [["alphabet", "ALPHABET"], ["numbers", "NUMBERS"], ["symbols", "SYMBOLS"], ["prosigns", "PROSIGNS"],
  ["q-codes", "Q CODES"], ["abbreviations", "ABBREVIATIONS"], null,
  ["chart", "CHART"], ["tree", "TREE"], ["phrases", "PHRASES"], ["how-it-works", "HOW IT WORKS"]].map(r => r && [`/ref/${r[0]}/`, r[1]]);

const LISTS = { top: TOP, ref: REF, ...GROUPS };

/* a page with pages under it, and which: REF its tables, a table its members */
const UNDER = { "/ref/": REF, ...Object.fromEntries(Object.entries(GROUPS).map(([slug, rows]) => [`/ref/${slug}/`, rows])) };

const CHEV = `<svg class="crumb-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.8 6 6.2l4.5-4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const here = () => location.pathname.replace(/index\.html$/, "");

function make(tag, props = {}, html = "") {
  const e = Object.assign(document.createElement(tag), props);
  if (html) e.innerHTML = html;
  return e;
}

/* one menu, moved under whichever crumb (or share) opened it */
let menu, opener;

function close({ focus = false } = {}) {
  if (!opener) return;
  opener.setAttribute("aria-expanded", "false");
  menu.hidden = true;
  if (focus) opener.focus();
  opener = null;
}

function open(button, fill) {
  if (opener === button) { close(); return; }
  close();
  menu.textContent = "";
  fill(menu);
  menu.hidden = false;
  opener = button;
  button.setAttribute("aria-expanded", "true");
  place(button);
  (menu.querySelector("[aria-current]") ?? menu.querySelector("a, button"))?.focus({ preventScroll: true });
}

/* under its opener, its left edge on the opener's, kept on screen; as
   tall as the screen under it allows, so it scrolls only when it must */
function place(button) {
  const b = button.getBoundingClientRect(), bar = button.closest("header").getBoundingClientRect();
  menu.style.top = `${Math.round(b.bottom - bar.top + 6)}px`;
  menu.style.maxHeight = `${Math.round(innerHeight - b.bottom - 6 - 12)}px`;
  const room = bar.width - menu.offsetWidth;
  const left = button.closest(".top-right") ? b.right - bar.left - menu.offsetWidth : b.left - bar.left - 8;
  menu.style.left = `${Math.round(Math.max(0, Math.min(left, room)))}px`;
}

/*
 * A list of pages: links, the one you're on (or under) marked; short
 * names (A, 7, QTH) sit in a grid, long ones (ALPHABET) a column. A
 * folder (a page with pages under it) has a chevron at its right, and
 * a tap on it, name or chevron, opens what's in it here, in place,
 * indented (and shuts it again): ALL first, the folder's own page,
 * then the pages under it. So what's below can be found without
 * leaving the menu.
 *
 *   STATION
 *   KEY HERO
 *   REF                 ▾
 *     ALL
 *     ALPHABET          ›
 *     NUMBERS           ›
 *     …
 */
const SUB = `<svg class="crumb-sub" viewBox="0 0 8 12" aria-hidden="true"><path d="M2 1.5 6.2 6 2 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* the page a link is to, its section aside: K's prosign (/ref/k/#prosign) is K's page */
const page = href => href.split("#")[0];

function listOf(list, current) {
  const short = list.every(r => !r || r[1].length <= 6);
  const ul = make("ul", { className: short ? "crumb-list grid" : "crumb-list" });
  for (const row of list) {
    if (!row) { ul.append(make("li", { className: "rule", role: "separator" })); continue; }
    const [href, label] = row, li = make("li");
    const under = !short && !row[2] && UNDER[href];     // (ALL is the folder's own page: a link, always)
    if (under) {
      /* a folder: its name opens what's in it (ALL first, its own page) */
      li.className = "has-sub";
      const open = make("button", { type: "button", className: "sub-toggle" });
      open.append(make("span", { textContent: label }));
      open.insertAdjacentHTML("beforeend", SUB);
      open.setAttribute("aria-expanded", "false");
      if (href === current) open.setAttribute("aria-current", "page");
      let sub = null;
      open.addEventListener("click", () => {
        sub ??= li.appendChild(Object.assign(listOf([[href, "ALL", "page"], ...under], current), { hidden: true }));
        sub.classList.add("sub");
        sub.hidden = !sub.hidden;
        open.setAttribute("aria-expanded", String(!sub.hidden));
      });
      li.append(open);
      /* the folder you're in opens already, so where you are shows */
      if (under.some(r => r && page(r[0]) === current)) open.click();
    } else {
      const a = make("a", { href, textContent: label });
      if (page(href) === current) a.setAttribute("aria-current", "page");
      li.append(a);
    }
    ul.append(li);
  }
  return ul;
}

function pages(list, current) {
  return box => box.append(listOf(list, current));
}

function crumbButton(label, listId) {
  const b = make("button", { type: "button", className: "crumb" });
  b.setAttribute("aria-expanded", "false");
  b.setAttribute("aria-haspopup", "true");
  b.setAttribute("aria-controls", "crumb-menu");
  b.dataset.crumb = listId;
  b.append(...label);
  return b;
}

function wire(nav) {
  const list = nav.querySelector("ol");
  /* each crumb: a link (an ancestor) or the heading (where you are) */
  for (const el of [...list.querySelectorAll("[data-crumb]")]) {
    const listId = el.dataset.crumb, rows = LISTS[listId];
    if (!rows) continue;
    if (el.tagName === "H1") {
      const b = crumbButton([...el.childNodes], listId);
      b.insertAdjacentHTML("beforeend", CHEV);
      b.addEventListener("click", () => open(b, pages(rows, here())));
      el.removeAttribute("data-crumb");
      el.append(b);
    } else {
      const href = el.getAttribute("href");
      const b = crumbButton([...el.childNodes], listId);
      b.dataset.href = href;
      b.addEventListener("click", () => open(b, pages(rows, href)));
      el.replaceWith(b);
    }
  }

  /* the fold: "…" after the name, holding the middle crumbs once they don't fit */
  const crumbs = [...list.children];
  if (crumbs.length > 3) {
    const li = make("li", { className: "fold", hidden: true });
    const b = crumbButton(["…"], "fold");
    b.setAttribute("aria-label", "more of the trail");
    b.addEventListener("click", () => open(b, pages(
      crumbs.filter(c => c.classList.contains("folded")).map(c => { const x = c.querySelector(".crumb"); return [x.dataset.href, x.textContent]; }), null)));
    li.append(b);
    crumbs[0].after(li);
    const middle = crumbs.slice(1, -1);
    const fit = () => {
      for (const c of middle) c.classList.remove("folded");
      li.hidden = true;
      for (const c of middle) {
        if (nav.scrollWidth <= nav.clientWidth + 1) break;
        c.classList.add("folded");
        li.hidden = false;
      }
    };
    fit();
    new ResizeObserver(fit).observe(nav.closest("header"));
  }
}

/* share, for a page that has none of its own: its link */
function addShare(header) {
  let right = header.querySelector(".top-right");
  if (right?.querySelector("#share-toggle, .share-toggle")) return;
  if (!right) {
    right = make("div", { className: "top-right" });
    const profile = header.querySelector(":scope > .profile");
    header.append(right);
    if (profile) right.append(profile);
  }
  const b = make("button", { type: "button", className: "share-toggle", textContent: "share" });
  b.setAttribute("aria-expanded", "false");
  b.setAttribute("aria-controls", "crumb-menu");
  right.prepend(b);
  b.addEventListener("click", () => open(b, box => {
    const link = siteOrigin() + location.href.replace(/#.*$/, "").slice(location.origin.length);   // the app's pages too: core/where.js
    const ul = make("ul", { className: "crumb-list share-rows" });
    const note = make("p", { className: "crumb-note", ariaLive: "polite" });
    const row = (label, peek, act) => {
      const li = make("li"), x = make("button", { type: "button" });
      x.append(make("span", { textContent: label }));
      if (peek) x.append(make("span", { className: "peek", textContent: peek }));
      x.addEventListener("click", act);
      li.append(x);
      ul.append(li);
    };
    row("copy link", link.replace(/^https?:\/\//, ""), async () => {
      try { await navigator.clipboard.writeText(link); note.textContent = "copied"; } catch { note.textContent = "couldn't copy"; }
    });
    if (navigator.share) row("share…", "", () => navigator.share({ title: document.title, url: link }).catch(() => { }));
    /* a page with pictures to keep (a character's: /ref/k/): each, to
       save, named as its caption there, after a rule */
    const keep = [...document.querySelectorAll("#keep figure")].filter(f => f.querySelector("a[href]"));
    if (keep.length) {
      ul.append(make("li", { className: "rule", role: "separator" }));
      for (const f of keep) {
        const href = f.querySelector("a").getAttribute("href"), li = make("li");
        const a = make("a", { href, download: "" });
        a.append(make("span", { textContent: f.querySelector("figcaption")?.textContent ?? href }),
          make("span", { className: "peek", textContent: href.slice(href.lastIndexOf(".")) }));
        li.append(a);
        ul.append(li);
      }
    }
    box.append(ul, note);
  }));
}

function start() {
  const nav = document.querySelector("header .crumbs");
  if (!nav || nav.dataset.wired) return;
  nav.dataset.wired = "1";
  const header = nav.closest("header");
  menu = make("div", { id: "crumb-menu", className: "crumb-menu", hidden: true });
  header.append(menu);
  wire(nav);
  addShare(header);

  /* away: a tap outside, Escape, or the focus leaving the bar */
  document.addEventListener("pointerdown", e => { if (opener && !menu.contains(e.target) && !opener.contains(e.target)) close(); });
  document.addEventListener("keydown", e => { if (opener && e.key === "Escape") { e.stopPropagation(); close({ focus: true }); } }, true);
  /* Enter and Space on a crumb or a menu's page are theirs (open,
     follow), not the station's keyer listening on the whole page */
  header.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.closest(".crumbs, .crumb-menu")) e.stopPropagation();
  });
  header.addEventListener("focusout", e => { if (opener && !header.contains(e.relatedTarget) && e.relatedTarget) close(); });
  addEventListener("resize", () => opener && place(opener));

  /* a page that scrolls: the bar stays (base.css), with a rule under
     it once the page has moved */
  const stuck = () => header.classList.toggle("stuck", scrollY > 0);
  addEventListener("scroll", stuck, { passive: true });
  stuck();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();

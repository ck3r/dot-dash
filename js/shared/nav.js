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
 * The crumbs on the way are links: REF goes to /ref/. The heading,
 * where you are, opens the menu: the whole site, the same on every
 * page, with the folders you're in already open and this page marked.
 * So on K: STATION, KEY HERO, REF ▾ (its tables), ALPHABET ▾ (A to Z,
 * K marked). The name is a plain link home. (The reference's tables'
 * members come from npm run ref, js/shared/nav-tables.js.)
 *
 * A page in sections (the manual, how it works: frames with ids) has
 * one more crumb after its heading, the section you're reading,
 * following the scroll ("#" alone above the first); it opens the
 * page's sections. Each section's heading has a brass # by it, on
 * hover, that copies a link to it.
 *
 *   dot-da.sh / MANUAL ▾ / # keying ▾
 *
 * The page writes its crumbs as plain links (and its heading as an
 * h1), so they work with no script.
 *
 * The site's own list is in order of use: the folders first, nearest
 * the tap (REF, PRACTICE: the games, by name), then the station and
 * its manual, the other ways in (the app, the extension, the
 * bookmarklet; not shown in the app), and last the notes and privacy.
 * The rest keep the content's own order, never alphabetical: A to Z
 * is already in order, symbols and prosigns as the reference's tables
 * have them. Nothing reshuffles, so a page is where it was.
 *
 *   REF                 ›
 *   PRACTICE            ›     KEY DASH, KEY HERO
 *   ───────
 *   STATION
 *   MANUAL
 *   ───────
 *   APP                       the manual's part on it, for now
 *   EXTENSION
 *   BOOKMARKLET
 *   ───────
 *   DESIGN NOTES
 *   PRIVACY
 *
 * PRACTICE is a folder with no page of its own: on a game's page it's
 * a crumb that opens the games (dot-da.sh / PRACTICE ▾ / KEY HERO ▾).
 *
 * Too wide (a phone, a long trail), giving way in turn: the section's
 * name shortens; the name becomes the logo, the switch; the middle
 * crumbs fold, one at a time from the left, into "…", which opens
 * them; and last the heading ends in …
 *
 *   dot-da.sh / REF / K ▾ / # prosign ▾          share  (◯)
 *   ⌐o / … / K ▾ / # prosign ▾                   share  (◯)
 *
 * A page with no share of its own (the station's and Key hero's are
 * theirs) gets one here: its link, copied or handed to the phone; and
 * on a character's page, its pictures to keep, each to save.
 */
import { GROUPS } from "./nav-tables.js";
import { siteOrigin, inApp } from "../core/where.js";

/* the games, by name: a folder with no page of its own */
const PRACTICE = [["/dash/", "KEY DASH"], ["/hero/", "KEY HERO"]];

/* the ways in besides this one: in the app, it's already the one.
   APP is the manual's part on it (marked "aside": the manual's page,
   but not where you are on it) */
const ELSEWHERE = [["/manual/#app", "APP", "aside"], ["/extension/", "EXTENSION"], ["/bookmarklet/", "BOOKMARKLET"]];

/* the site's top level, in order of use (above) */
const TOP = () => [["/ref/", "REF"], ["practice", "PRACTICE"], null,
  ["/", "STATION"], ["/manual/", "MANUAL"], null,
  ...(inApp() ? [] : [...ELSEWHERE, null]),
  ["/design/", "DESIGN NOTES"], ["/privacy/", "PRIVACY"]];

/* the reference: its six tables in its own order, a rule, then the pages that gather */
const REF = [["alphabet", "ALPHABET"], ["numbers", "NUMBERS"], ["symbols", "SYMBOLS"], ["prosigns", "PROSIGNS"],
  ["q-codes", "Q CODES"], ["abbreviations", "ABBREVIATIONS"], null,
  ["chart", "CHART"], ["tree", "TREE"], ["phrases", "PHRASES"], ["how-it-works", "HOW IT WORKS"]].map(r => r && [`/ref/${r[0]}/`, r[1]]);

/* a page with pages under it, and which: REF its tables, a table its members */
const UNDER = { "/ref/": REF, practice: PRACTICE, ...Object.fromEntries(Object.entries(GROUPS).map(([slug, rows]) => [`/ref/${slug}/`, rows])) };

const CHEV = `<svg class="crumb-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.8 6 6.2l4.5-4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const here = () => location.pathname.replace(/index\.html$/, "");

/* narrow enough for the name to give way to the logo */
const NARROW = matchMedia("(max-width: 399.98px)");

/* the switch, the site's mark (js/shared/logo.js draws the icons; this is the pages' own inline one) */
const SWITCH = `<svg class="home-logo" viewBox="0 0 73 79" fill="none" aria-hidden="true"><circle cx="13.66" cy="52.81" r="7" stroke="currentColor" stroke-width="6"/><rect x="16.02" y="47.22" width="56" height="7" rx="3.5" fill="currentColor" transform="rotate(-30 13.66 52.81)"/></svg>`;

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
 * indented (and shuts it again): ALL first, the folder's own page
 * (if it has one: PRACTICE hasn't), then the pages under it. So what's below can be found without
 * leaving the menu.
 *
 *   REF                 ▾
 *     ALL
 *     ALPHABET          ›
 *     NUMBERS           ›
 *     …
 */
const SUB = `<svg class="crumb-sub" viewBox="0 0 8 12" aria-hidden="true"><path d="M2 1.5 6.2 6 2 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* the page a link is to, its section aside: K's prosign (/ref/k/#prosign) is K's page */
const page = href => href.split("#")[0];

/* a folder holds a page if it's the folder's own, or under it, however deep */
function holds(href, current) {
  return page(href) === current || !!UNDER[href]?.some(r => r && page(r[0]) !== href && holds(r[0], current));
}

function listOf(list, current) {
  const short = list.every(r => !r || r[1].length <= 6);
  const ul = make("ul", { className: short ? "crumb-list grid" : "crumb-list" });
  for (const row of list) {
    if (!row) { ul.append(make("li", { className: "rule", role: "separator" })); continue; }
    const [href, label] = row, li = make("li");
    const under = !short && row[2] !== "page" && UNDER[href];     // (ALL is the folder's own page: a link, always)
    if (under) {
      /* a folder: its name opens what's in it (ALL first, its own page) */
      li.className = "has-sub";
      const open = make("button", { type: "button", className: "sub-toggle" });
      open.append(make("span", { textContent: label }));
      open.insertAdjacentHTML("beforeend", SUB);
      open.setAttribute("aria-expanded", "false");
      /* this page, or the way to it (REF on K's page) */
      if (holds(href, current)) open.setAttribute("aria-current", href === current ? "page" : "true");
      let sub = null;
      open.addEventListener("click", () => {
        const own = href.startsWith("/") ? [[href, "ALL", "page"]] : [];
        sub ??= li.appendChild(Object.assign(listOf([...own, ...under], current), { hidden: true }));
        sub.classList.add("sub");
        sub.hidden = !sub.hidden;
        open.setAttribute("aria-expanded", String(!sub.hidden));
      });
      li.append(open);
      /* the folders you're in open already, so where you are shows
         (K's three: the alphabet, the prosigns, the abbreviations) */
      if (holds(href, current)) open.click();
    } else {
      const a = make("a", { href, textContent: label });
      if (page(href) === current && row[2] !== "aside") a.setAttribute("aria-current", "page");
      a.addEventListener("click", () => close());   // (a part of this page, APP on the manual's: no page load to shut it)
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
  /* each crumb: a link (an ancestor, to its page) or the heading (where
     you are: the whole site's menu) */
  for (const el of [...list.querySelectorAll("[data-crumb]")]) {
    const listId = el.dataset.crumb;
    el.removeAttribute("data-crumb");
    if (el.tagName === "H1") {
      const b = crumbButton([...el.childNodes], listId);
      b.insertAdjacentHTML("beforeend", CHEV);
      b.addEventListener("click", () => open(b, pages(TOP(), here())));
      el.append(b);
    } else if (UNDER[listId] && el.tagName !== "A") {
      /* a folder with no page (PRACTICE): a crumb that opens what's in it */
      const b = crumbButton([...el.childNodes], listId);
      b.dataset.folder = listId;
      b.insertAdjacentHTML("beforeend", CHEV);
      b.addEventListener("click", () => open(b, pages(UNDER[listId], here())));
      el.replaceWith(b);
    } else {
      el.classList.add("crumb");
      el.dataset.href = el.getAttribute("href");
    }
  }
  sectionCrumb(list);

  /* the name, and the logo it becomes when there's no room for it */
  const home = nav.querySelector(".home");
  if (home && !home.querySelector(".home-logo")) {
    home.insertAdjacentHTML("afterbegin", SWITCH);
    home.setAttribute("aria-label", "dot-da.sh");
  }

  /* the fold: "…" after the name, holding the middle crumbs once they
     don't fit (never the heading, nor the section after it) */
  const crumbs = [...list.children];
  const middle = crumbs.slice(1).filter(c => !c.querySelector("h1") && !c.classList.contains("section"));
  const fold = make("li", { className: "fold", hidden: true });
  if (middle.length) {
    const b = crumbButton(["…"], "fold");
    b.setAttribute("aria-label", "more of the trail");
    b.addEventListener("click", () => open(b, pages(
      crumbs.filter(c => c.classList.contains("folded")).flatMap(c => {
        const x = c.querySelector(".crumb");
        return x.dataset.folder ? UNDER[x.dataset.folder] : [[x.dataset.href, x.textContent]];
      }), null)));
    fold.append(b);
    crumbs[0].after(fold);
  }
  /* short of room: the line runs over, or the heading's name is cut;
     for the logo, the section's name cut too (the room is its). The
     logo only on a narrow phone: wider, the name stays, and the
     crumbs fold instead.
     Fitted to the page's longest section name, not the one showing,
     so scrolling from section to section moves nothing (fitted to each
     in turn, the logo and the fold came and went under the reader) */
  const cut = n => n && n.scrollWidth > n.clientWidth + 1;
  const heading = nav.querySelector("h1 .crumb-name"), section = nav.querySelector("li.section .crumb-name");
  const longest = sectionsOf().map(s => s.name).reduce((a, b) => (b.length > a.length ? b : a), "");
  const short = () => nav.scrollWidth > nav.clientWidth + 1 || cut(heading);
  const fit = () => {
    const showing = section && [section.textContent, section.hidden];
    if (section) { section.textContent = longest; section.hidden = false; }
    nav.classList.remove("tight");
    for (const c of middle) c.classList.remove("folded");
    fold.hidden = true;
    if (short() || cut(section)) {
      nav.classList.toggle("tight", NARROW.matches);
      for (const c of middle) {
        if (!short()) break;
        c.classList.add("folded");
        fold.hidden = false;
      }
    }
    if (section) [section.textContent, section.hidden] = showing;
  };
  fit();
  new ResizeObserver(fit).observe(nav.closest("header"));
  document.fonts?.ready.then(fit);   // (measured again in the bar's own type)
}

/*
 * A page in sections: its frames with an id, each under its heading
 * (section.frame#keying > h2.frame-label), called by it, or by its
 * data-topic where the heading is long (how it works' are whole
 * questions: "timing"). Two or more make a page worth a crumb for them.
 */
function sectionsOf() {
  const list = [...document.querySelectorAll("main section.frame[id] > h2.frame-label")]
    .map(h => ({ id: h.parentElement.id, name: h.parentElement.dataset.topic || h.textContent.trim(), el: h.parentElement }));
  return list.length >= 2 ? list : [];
}

/* the link to a section, as it's shared (the app's pages too: core/where.js) */
const linkTo = id => siteOrigin() + location.href.replace(/#.*$/, "").slice(location.origin.length) + (id ? `#${id}` : "");

/* the section being read (the section crumb's), for share: its link
   goes to there, not the page's top */
let reading = null;

/*
 * The section crumb: the last section whose top has passed under the
 * bar, or "#" alone above the first. It opens the page's sections.
 *
 *   ┌ keying ────┐ ← its top under the bar: # keying
 */
function sectionCrumb(list) {
  const all = sectionsOf();
  if (!all.length) return;
  const li = make("li", { className: "section" });
  const b = crumbButton([make("span", { className: "crumb-hash", textContent: "#" })], "sections");
  const name = make("span", { className: "crumb-name" });
  b.append(name);
  b.insertAdjacentHTML("beforeend", CHEV);
  b.setAttribute("aria-label", "this page's sections");
  li.append(b);
  list.append(li);

  let at;
  const follow = () => {
    const line = list.closest("header").getBoundingClientRect().bottom + 24;
    let now = null;
    for (const s of all) if (s.el.getBoundingClientRect().top <= line) now = s;
    /* the foot of the page: its last section, though it can't reach the bar */
    if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) now = all.at(-1);
    if (now === at) return;
    at = now;
    reading = now?.id ?? null;
    name.textContent = now ? now.name : "";
    name.hidden = !now;
  };
  let queued = false;
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; follow(); }); } }, { passive: true });
  addEventListener("hashchange", () => requestAnimationFrame(follow));
  follow();

  b.addEventListener("click", () => open(b, box => {
    /* its title, as a menu of the page's own, not the site's */
    box.append(make("p", { className: "crumb-menu-title", textContent: "on this page" }));
    const ul = make("ul", { className: "crumb-list sections" });
    for (const s of all) {
      const a = make("a", { href: `#${s.id}`, textContent: s.name }), row = make("li");
      if (s === at) a.setAttribute("aria-current", "location");
      a.addEventListener("click", () => close());
      row.append(a);
      ul.append(row);
    }
    box.append(ul);
  }));

  /* by each section's heading, on hover: a brass #, copying its link
     (the heading's own text untouched: a page's data reads it) */
  for (const s of all) {
    const a = make("a", { className: "anchor", href: `#${s.id}`, textContent: "#", title: "copy a link to this section" });
    a.setAttribute("aria-label", `copy a link to ${s.name}`);
    a.addEventListener("click", async e => {
      e.preventDefault();
      history.replaceState(null, "", `#${s.id}`);
      try { await navigator.clipboard.writeText(linkTo(s.id)); a.textContent = "copied"; } catch { a.textContent = "#"; }
      clearTimeout(a.back);
      a.back = setTimeout(() => { a.textContent = "#"; }, 1200);
    });
    s.el.prepend(a);
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
    const link = linkTo(reading);   // the app's pages too (core/where.js), and the section you're reading
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

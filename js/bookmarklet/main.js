/*
 * ============================================================
 * THE BOOKMARKLET: the extension's "send", and nothing else
 * ============================================================
 *
 * A bookmark whose address is a few lines of JavaScript: tapped,
 * it runs in the page you're on, takes what's selected and opens
 * the station with it, the way the extension sends:
 *
 *   select "brass keys"  →  tap  →  dot-da.sh/#text=brass+keys&src=…
 *
 * The text rides in the hash, so it never reaches a server, and
 * the station turns it into Morse (or Morse back into text) itself.
 * With a link back (its page's box, on to start), so does the
 * page's address, and from a selection a text fragment of its first
 * words and last (#:~:text=start,end, as the extension makes it), so
 * the station's ↗ opens the page at the passage. Not from a text
 * field (a fragment can't find words in one), nor the station's own
 * site.
 *
 * No build step: send() below is the bookmarklet. This page shows
 * its source, word for word, and makes the link from it, so what
 * you read is what you keep.
 */

import { siteOrigin } from "../core/where.js";

/* runs in someone else's page: on its own, nothing from outside
   but STATION (filled in below), every name its own */
function send() {
  const STATION = "@", BACK = true;
  const el = document.activeElement;
  const field = !!el && typeof el.selectionStart === "number" && el.selectionEnd > el.selectionStart;
  let text = String(getSelection()), passage = !field && !!text.trim();   // a field's words: no fragment finds them
  if (!text.trim() && el && typeof el.selectionStart === "number") {
    text = el.value.slice(el.selectionStart, el.selectionEnd);    // getSelection can't see into a text field
  }
  if (!text.trim()) text = prompt("Send to dot-da.sh as Morse:") || "";
  if (!text.trim()) return;
  let src = "";
  if (BACK && /^https?:$/.test(location.protocol) && location.origin + "/" !== STATION) {
    let frag = "";
    if (passage) {
      /* short, on one line: whole; else the first words of its first
         line and the last of its last */
      const lines = text.split("\n").map(l => l.trim().split(/\s+/).filter(Boolean)).filter(l => l.length);
      const enc = w => encodeURIComponent(w.join(" ")).replace(/-/g, "%2D");
      const a = lines[0], z = lines[lines.length - 1];
      const n = lines.length > 1 ? 4 : Math.max(1, Math.min(4, a.length >> 1));
      frag = lines.length === 1 && a.length <= 8 && a.join(" ").length <= 120 ? enc(a) : enc(a.slice(0, n)) + "," + enc(z.slice(-n));
    }
    src = "&src=" + encodeURIComponent(location.href.split("#")[0] + (frag ? "#:~:text=" + frag : ""));
  }
  open(STATION + "#text=" + encodeURIComponent(text.slice(0, 40000).toLowerCase())
    .replace(/%20/g, "+").replace(/%2C/g, ",") + src);
}

/* this site's own address, so a local copy makes a link to the
   local station (and the checks never leave the machine); from the
   app, the site's (core/where.js) */
const made = back => String(send).replace('"@", BACK = true', JSON.stringify(siteOrigin() + "/") + ", BACK = " + back);

/* void: without it, the page would be replaced by what open() returns.
   The link is made again when "with a link back" changes; the code
   shown is always the code it runs */
let href = "";
const back = document.querySelector("#back");
function build() {
  const source = made(back.checked);
  href = "javascript:" + encodeURIComponent(`void (${source})()`);
  document.querySelector("#keep-link").href = href;
  document.querySelector("#source").textContent = source;
}
back.addEventListener("change", build);
build();

const copy = document.querySelector("#copy");
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(href);
    copy.textContent = "copied";
  } catch {
    copy.textContent = "couldn't copy";
  }
  setTimeout(() => { copy.textContent = "copy it"; }, 1500);
});

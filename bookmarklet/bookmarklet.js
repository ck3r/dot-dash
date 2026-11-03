/*
 * ============================================================
 * THE BOOKMARKLET: the extension's "send", and nothing else
 * ============================================================
 *
 * A bookmark whose address is a few lines of JavaScript: tapped,
 * it runs in the page you're on, takes what's selected and opens
 * the station with it, the way the extension sends:
 *
 *   select "brass keys"  →  tap  →  dot-da.sh/#text=brass+keys
 *
 * The text rides in the hash, so it never reaches a server, and
 * the station turns it into Morse (or Morse back into text) itself.
 *
 * No build step: send() below is the bookmarklet. This page shows
 * its source, word for word, and makes the link from it, so what
 * you read is what you keep.
 */

/* runs in someone else's page: on its own, nothing from outside
   but STATION (filled in below), every name its own */
function send() {
  const STATION = "@";
  const el = document.activeElement;
  let text = String(getSelection());
  if (!text.trim() && el && typeof el.selectionStart === "number") {
    text = el.value.slice(el.selectionStart, el.selectionEnd);    // getSelection can't see into a text field
  }
  if (!text.trim()) text = prompt("Send to dot-da.sh as Morse:") || "";
  if (!text.trim()) return;
  open(STATION + "#text=" + encodeURIComponent(text.slice(0, 40000).toLowerCase())
    .replace(/%20/g, "+").replace(/%2C/g, ","));
}

/* this site's own address, so a local copy makes a link to the
   local station (and the checks never leave the machine) */
const source = String(send).replace('"@"', JSON.stringify(location.origin + "/"));

/* void: without it, the page would be replaced by what open() returns */
const href = "javascript:" + encodeURIComponent(`void (${source})()`);

document.querySelector("#keep-link").href = href;
document.querySelector("#source").textContent = source;

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

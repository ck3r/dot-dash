/*
 * ============================================================
 * THE TEXT KEYBOARD (type mode)
 * ============================================================
 *
 * The on-screen keyboard: its two layouts (letters, 123), the
 * hold menus (a letter's digits and symbols, from the tree), a
 * little forgiveness for fingers, and the "hold for more" popup.
 * What a key types is up to the station: typeKey(k).
 *
 *   createKeyboard({ typeKey }) → { openHold }
 */
import { DECODE, ENCODE } from "../morse.js";
import { $, el } from "./dom.js";

export function createKeyboard({ typeKey }) {
  /*
   * Two layouts: letters, and 123 (digits and symbols).
   *
   * Long-press a letter for the digits and symbols that grow out
   * of it in the tree (its descendants, up to the next letter):
   *
   *   O → 8 9 0 :     (---.. ----. ----- ---...  all start ---)
   *
   * A small tick in the key's corner shows it has some.
   */
  /*
   * A fixed grid, the same for both layouts, so switching never
   * moves or resizes a key: 20 half-key columns per row, every
   * key 2 wide (one key), ⌫ always 1½ keys at the right, and an
   * identical bottom row (space is 5½ keys).
   *
   *   letters                         123
   *   Q W E R T Y U I O P             1 2 3 4 5 6 7 8 9 0
   *    A S D F G H J K L              . , ? ! ' " ( ) / &
   *   (i) Z X C V B N M  ⌫             : ; = + - _ $ @  ⌫
   *   123 [   space   ]  ↵            ABC [   space   ]  ↵
   *
   * Hold 123 (or ABC) for two more: the prosigns, and the Q codes,
   * each a key two wide. A tap goes letters ⇄ 123, and back to the
   * letters from either of the others.
   *
   *   prosigns (as everywhere: <AR>)     Q codes
   *   <AR> <BT> <KN> <AS> <SK>           QTH QSL QSO QRZ QRT
   *   <BK> <CL> <KA> <SN> <AA>           QRS QRQ QRM QRN QRP
   *   <SOS>                 ⌫            QRX QSY QRL QRV  ⌫
   *
   * As on a phone's own keyboard: ⌫ over ↵ at the right, where the
   * Morse pad has them too (at the bottom of its side keys); the
   * layout key and the (i) at the left.
   *
   * Each row: [startColumn, keys] (keys 2 columns each), plus
   * any special keys as [key, startColumn, span].
   */
  const BOTTOM = [["layout", 1, 3], [" ", 4, 11], ["send", 15, 6]];
  const BACK = [["back", 18, 3]];
  /* the prosigns that share a code with a symbol are typed as it */
  const PRO = ["+", "=", "(", "&", "<SK>", "<BK>", "<CL>", "<KA>", "<SN>", "<AA>", "<SOS>"];
  const PRO_NAME = { "+": "<AR>", "=": "<BT>", "(": "<KN>", "&": "<AS>" };
  const Q_MEANS = {
    QTH: "my location is", QSL: "I confirm receipt", QSO: "a contact, a conversation", QRZ: "who is calling me?",
    QRT: "stop sending; closing down", QRS: "send slower", QRQ: "send faster", QRM: "man-made interference",
    QRN: "static, natural noise", QRP: "reduce power; low power", QRX: "wait, stand by", QSY: "change frequency",
    QRL: "this frequency is in use", QRV: "I am ready"
  };
  const QS = Object.keys(Q_MEANS);
  const LAYOUTS = {
    abc: [
      { start: 1, keys: [..."QWERTYUIOP"] },
      { start: 2, keys: [..."ASDFGHJKL"] },
      { start: 4, keys: [..."ZXCVBNM"], extra: BACK, info: true },
      { start: 1, keys: [], extra: BOTTOM }
    ],
    num: [
      { start: 1, keys: [..."1234567890"] },
      { start: 1, keys: [...".,?!'\"()/&"] },
      { start: 2, keys: [...":;=+-_$@"], extra: BACK },
      { start: 1, keys: [], extra: BOTTOM }
    ],
    pro: [
      { start: 1, span: 4, keys: PRO.slice(0, 5) },
      { start: 1, span: 4, keys: PRO.slice(5, 10) },
      { start: 2, span: 4, keys: PRO.slice(10), extra: BACK },
      { start: 1, keys: [], extra: BOTTOM }
    ],
    q: [
      { start: 1, span: 4, keys: QS.slice(0, 5) },
      { start: 1, span: 4, keys: QS.slice(5, 10) },
      { start: 2, span: 4, keys: QS.slice(10), extra: BACK },
      { start: 1, keys: [], extra: BOTTOM }
    ]
  };
  const LAYOUT_NAMES = { abc: ["ABC", "letters"], num: ["123", "numbers and symbols"], pro: ["<AR>", "prosigns"], q: ["Q", "Q codes"] };
  let layout = "abc";

  const isLetter = ch => /^[A-Z]$/.test(ch);

  /* each letter's descendants that aren't letters (digits, symbols), in tree order */
  const EXTRAS = {};
  for (const [code, ch] of Object.entries(DECODE)) {
    if (isLetter(ch) || ch.startsWith("<")) continue;
    let parent = code.slice(0, -1);
    while (parent && !isLetter(DECODE[parent])) parent = parent.slice(0, -1);
    if (parent) (EXTRAS[DECODE[parent]] ??= []).push(ch);
  }
  const treeOrder = ch => {
    const code = ENCODE[ch];
    return code.length * 1000 + parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2);
  };
  for (const list of Object.values(EXTRAS)) list.sort((a, b) => treeOrder(a) - treeOrder(b));

  /* a key's code, over its name (a Q code: its letters', spaced) */
  function codeMarks(ch) {
    const code = /^Q[A-Z]{2}$/.test(ch) ? [...ch].map(c => ENCODE[c]).join(" ") : ENCODE[ch];
    const small = el("small");
    small.style.setProperty("--len", code.length);   // lets the CSS size it to the key
    for (const m of code) small.append(m === " " ? " " : el("span", m === "." ? "dot" : "dash", m));
    return small;
  }

  function buildKeyboard() {
    const kbd = $("#kbd");
    kbd.textContent = "";
    kbd.dataset.layout = layout;
    for (const row of LAYOUTS[layout]) {
      const rowEl = el("div", "row");
      const span = row.span ?? 2;
      const keys = [
        ...row.keys.map((k, i) => [k, row.start + span * i, span]),
        ...(row.extra ?? [])
      ];
      for (const [k, column, span] of keys) {
        const b = el("button");
        b.type = "button";
        b.dataset.k = k;
        b.style.gridColumn = `${column} / span ${span}`;
        b.style.gridRow = "1";               // one line, whatever order they're placed in (the (i) comes last, at the start)
        if (k === "back") {
          b.className = "k-wide";
          b.append(el("b", "", "⌫"));
          b.setAttribute("aria-label", "backspace");
        } else if (k === " ") {
          b.className = "k-space";             // a plain bar, like a real space bar
          b.setAttribute("aria-label", "space");
        } else if (k === "send") {
          b.className = "k-send";
          b.append(el("b", "", "↵"));
          b.setAttribute("aria-label", "return");
        } else if (k === "layout") {
          b.className = "k-layout";
          b.append(el("b", "", layout === "abc" ? "123" : "ABC"));
          b.setAttribute("aria-label", `${layout === "abc" ? "numbers and symbols" : "letters"} (hold for prosigns, Q codes)`);
        } else if (layout === "pro" || layout === "q") {
          const name = PRO_NAME[k] ?? k;   // a prosign in its brackets, as on the tape
          b.append(codeMarks(k), el("b", "", name));
          b.title = layout === "q" ? `${k}: ${Q_MEANS[k]}` : name;
          b.setAttribute("aria-label", b.title);
        } else {
          /* Morse first: the code above the character */
          b.append(codeMarks(k), el("b", "", k));
          if (layout === "abc" && EXTRAS[k]) {
            b.classList.add("more");
            b.setAttribute("aria-label", `${k} (hold for ${EXTRAS[k].join(" ")})`);
          }
        }
        rowEl.append(b);
      }
      /* the empty start of the Z row: an (i) for the keys that hold more */
      if (row.info) {
        const info = el("button", "info kbd-info", "i");
        info.type = "button";
        info.style.gridColumn = "1 / span 3";
        info.style.gridRow = "1";
        info.title = "keys that hold more";
        info.setAttribute("aria-label", info.title);
        info.setAttribute("aria-haspopup", "dialog");
        info.addEventListener("click", () => openHold(true));
        rowEl.append(info);
      }
      kbd.append(rowEl);
    }
  }

  function openHold(open) {
    $("#hold-pop").hidden = !open;
    if (open) $("#hold-pop .close").focus({ preventScroll: true });
  }
  $("#hold-pop .close").addEventListener("click", () => openHold(false));

  buildKeyboard();


  /*
   * Presses. Keys type when you let go (so a long press can open
   * the fan instead); backspace acts at once, and held, deletes a
   * word at a time.
   *
   *        ┌──────────────────┐
   *        │ ---.  ----. ---… │   the fan: slide onto one, let go
   *        │  8     9    0  : │
   *        └────────┬─────────┘
   *               [ O ]
   */
  const HOLD = 380;   // ms before the fan opens
  let held = null;    // { b, k, timer, fan, items, choice }

  function openFan() {
    const fan = el("div", "fan");
    /* 123 held: the layouts, by name; a letter held: its descendants */
    const items = held.k === "layout"
      ? Object.entries(LAYOUT_NAMES).map(([id, [name, what]]) => {
          const item = el("span", "item");
          item.dataset.ch = id;
          item.append(el("small", "", what), el("b", "", name));
          fan.append(item);
          return item;
        })
      : [held.k, ...EXTRAS[held.k]].map(ch => {
          const item = el("span", "item");
          item.dataset.ch = ch;
          item.append(codeMarks(ch), el("b", "", ch));
          fan.append(item);
          return item;
        });
    document.body.append(fan);
    const key = held.b.getBoundingClientRect();
    const w = fan.offsetWidth;
    fan.style.left = Math.max(6, Math.min(innerWidth - w - 6, key.left + key.width / 2 - w / 2)) + "px";
    fan.style.top = (key.top - fan.offsetHeight - 6) + "px";
    held.fan = fan;
    held.items = items;
    choose(held.k === "layout" ? items.find(i => i.dataset.ch === "pro") : items[1]);   // the first digit / symbol (or the prosigns), ready to go
  }

  function choose(item) {
    for (const i of held.items) i.classList.toggle("on", i === item);
    held.choice = item?.dataset.ch ?? null;
  }

  function closeFan() {
    held?.fan?.remove();
  }

  /*
   * A little forgiveness for fingers: a touch that lands in a gap or
   * on an edge goes to the nearest key, and touches are read a few
   * pixels higher (fingers land a little below where they aim). No
   * guessing at words: Morse is full of callsigns and Q codes.
   */
  const AIM_LIFT = 3;   // px

  function keyAt(event) {
    const direct = event.target.closest("button[data-k]");
    if (event.pointerType !== "touch") return direct;
    if (event.target.closest(".kbd-info")) return null;
    const x = event.clientX, y = event.clientY - AIM_LIFT;
    let best = null, bestD = Infinity;
    for (const b of $("#kbd").querySelectorAll("button[data-k]")) {
      const r = b.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  $("#kbd").addEventListener("pointerdown", event => {
    const b = keyAt(event);
    if (!b) return;
    event.preventDefault();
    b.setPointerCapture?.(event.pointerId);
    b.classList.add("pressed");
    closeFan();
    held = { b, k: b.dataset.k, timer: null, fan: null, items: [], choice: null };
    if (held.k === "back") {
      /* held, a word at a time (half a second, then every half second) */
      held.timer = setInterval(() => typeKey("back-word"), 500);
      return typeKey("back");
    }
    if ((layout === "abc" && EXTRAS[held.k]) || held.k === "layout") held.timer = setTimeout(openFan, HOLD);
  });

  $("#kbd").addEventListener("pointermove", event => {
    if (!held?.fan) return;
    /* the item under the finger (by its column, so a slight drift up or down is fine) */
    const x = event.clientX;
    const item = held.items.find(i => { const r = i.getBoundingClientRect(); return x >= r.left && x < r.right; });
    if (item) choose(item);
  });

  function release(event, commit) {
    if (!held) return;
    clearTimeout(held.timer);
    clearInterval(held.timer);
    held.b.classList.remove("pressed");
    const { k, fan, choice } = held;
    closeFan();
    held = null;
    if (!commit || k === "back") return;
    if (fan && k === "layout") {
      if (!choice || choice === layout) return;
      layout = choice;
      return buildKeyboard();
    }
    if (fan) return choice && typeKey(choice);
    if (k === "layout") {
      layout = layout === "abc" ? "num" : "abc";
      return buildKeyboard();
    }
    typeKey(k);
  }

  $("#kbd").addEventListener("pointerup", event => release(event, true));
  $("#kbd").addEventListener("pointercancel", event => release(event, false));
  $("#kbd").addEventListener("contextmenu", event => event.preventDefault());

  return { openHold };
}

/*
 * The tree edge: the collapsed tree (where you are, magnified) with
 * the about column under it, and the whole tree, scaled to fit, with
 * a ⋮ where a long prosign runs off its end.
 *
 *   createTreeEdge({ state, press, retype, update, ... }) → {
 *     tree               the whole tree: { handle(event) }, a no-op until
 *                        it's first opened (js/tree.js loads then)
 *     about              the about column (js/tx/about.js)
 *     drawLocal(code?), drawTree(), followNode()
 *     openTree(open), isTreeOpen()
 *     inTree(code), REAL   as far as a code goes in the tree; its nodes
 *   }
 */
import { DECODE, TREE } from "../morse.js";
import { structure, wordsOf } from "./state.js";
import { createAbout } from "./about.js";
import { $, el, icon } from "./dom.js";

export function createTreeEdge({
  state, press, retype, update, settleTape, hiding, redact, cancelKeyer, openHeard, openCut, greet, playing, stopPlayback
}) {
  /*
   * ============================================================
   * THE TREE
   * ============================================================
   *
   * Collapsed: a magnified view of where you are.
   *
   *     E        parent
   *     |        the step that got here (dot red, dash blue)
   *    [A]       here
   *    / \
   *   R   W      children: tap one to key that mark
   */

  function treeChar(code) {
    if (!code) return "●";
    const row = TREE[code.length - 1];
    if (!row) return "_";
    const ch = row[parseInt(code.replaceAll(".", "0").replaceAll("-", "1"), 2)];
    return ch && ch !== "*" ? ch : "_";
  }

  /*
   * What the collapsed tree (and the about below it) shows: the
   * letter being keyed, or else the last letter keyed, so it stays
   * up while you think. Pressing a space (˽ or /) yourself clears
   * it; a pause doesn't. Undo walks back through what came before.
   */
  function focusCode() {
    const { path } = structure(state.tokens);
    if (path) return path;
    if (state.localCleared) return "";
    return wordsOf(state.tokens).flat().at(-1) ?? "";
  }

  /* the last letter is showing, finished: tapping a child extends it */
  const showingDone = () => !structure(state.tokens).path && !state.localCleared && wordsOf(state.tokens).length > 0;

  function drawLocal(override) {
    const path = override ?? focusCode();
    const box = $("#local");
    box.textContent = "";
    const row = (...parts) => {
      const d = el("div");
      d.append(...parts);
      box.append(d);
    };
    const side = s => (s === "." ? "dot" : "dash");

    if (path) {
      row(el("span", "", treeChar(path.slice(0, -1))));
      row(el("span", side(path.at(-1)), "|"));
    } else {
      row(" ");
      row(" ");
    }
    row(el("span", "here", treeChar(path)));
    row(el("span", "dot", "/"), " ", el("span", "dash", "\\"));

    const child = mark => {
      const b = el("button", side(mark), treeChar(path + mark));
      b.type = "button";
      b.setAttribute("aria-label", mark === "." ? "dit" : "dah");
      b.addEventListener("click", () => extend(mark));
      return b;
    };
    row(child("."), "  ", child("-"));
    /* letters hidden: every letter here is a bar, and the children
       can't be tapped (tap the column to open the tree, as ever) */
    if (hiding() === "letters") {
      const letters = [box.children[0]?.firstElementChild, box.querySelector(".here"), ...box.querySelectorAll("button")];
      for (const e of letters) if (e && e.textContent.trim() && e.textContent !== "_") redact(e);
    }
    about.draw(path);
  }

  /* a child of what's showing: key that mark onto it (a finished
     letter is reopened: R from A, not a new E) */
  function extend(mark) {
    if (playing() || state.playKey !== null) stopPlayback();   // back to keying: the player lets go, rewound
    if (state.mode === "type") {
      const code = (showingDone() ? wordsOf(state.tokens).flat().at(-1) : "") + mark;
      const ch = DECODE[code];
      if (!ch || ch.startsWith("<")) return;
      return retype((showingDone() ? state.typed.slice(0, -1) : state.typed) + ch);
    }
    if (showingDone()) {
      while (state.tokens.length && (state.tokens.at(-1) === " " || state.tokens.at(-1) === "/")) { state.tokens.pop(); state.took.pop(); }
    }
    cancelKeyer();
    press(mark);
  }

  /* the about column, under the collapsed tree: js/tx/about.js */
  const about = createAbout({ hiding, redact, openHeard, openCut, greet });

  /*
   * Expanded: the letters-only vertical tree, plus branches for
   * anything else this message uses (numbers, symbols). Its drawing
   * code (js/tree.js, the biggest module) loads the first time it's
   * opened, not at startup; the player follows it through `shown`,
   * which does nothing until then.
   */
  let tree = null;          // createTree(…), once loaded
  let buildModel = null;
  let loading = null;
  const load = () => loading ??= import("../tree.js").then(lib => {
    buildModel = lib.buildModel;
    tree = lib.createTree($("#tree"), "vertical", { legend: false });   // the key sits above, at a fixed size
  });
  const shown = { handle: event => tree?.handle(event) };

  let treeOpen = false;

  /*
   * The real tree: every node that holds a character, and every
   * node on the way to one. A long prosign (SOS is 9 marks) runs
   * past the bottom of it; we trace it only as far as the tree
   * goes, rather than growing empty levels.
   */
  const REAL = new Set([""]);
  TREE.forEach((row, depth) => [...row].forEach((ch, i) => {
    if (ch === "*") return;
    const code = i.toString(2).padStart(depth + 1, "0").replaceAll("0", ".").replaceAll("1", "-");
    for (let k = 1; k <= code.length; k++) REAL.add(code.slice(0, k));
  }));

  function inTree(code) {
    while (code && !REAL.has(code)) code = code.slice(0, -1);
    return code;
  }

  function drawTree() {
    if (!treeOpen) return;
    const { path } = structure(state.tokens);
    const codes = wordsOf(state.tokens).flat().map(inTree).filter(Boolean);
    sizeTreePanel();
    tree.render(buildModel({ letters: true, extra: codes }), false);
    fitTree();
    tree.handle({ type: "start" });
    if (path) {
      const shown = inTree(path);
      tree.handle({ type: "beat", path: shown });
      /* off the end of the tree: light the way there, but no letter,
         and a ⋮ after the last node: it carries on past here */
      if (shown !== path) {
        for (const s of $("#tree").querySelectorAll(".lbl.on")) s.classList.remove("on");
        carriesOn(shown, path[shown.length]);
      }
    } else {
      /* between letters (a space, a word break): the last letter keyed */
      const last = wordsOf(state.tokens).flat().at(-1);
      const shown = last && inTree(last);
      if (shown) {
        tree.handle({ type: "beat", path: shown });            // the way there, and the letter
        if (shown !== last) {
          for (const s of $("#tree").querySelectorAll(".lbl.on")) s.classList.remove("on");
          carriesOn(shown, last[shown.length]);
        }
      }
    }
    /* the eye leaves the whole tree alone: a hint to work from, and
       a way to learn the tree */
    followNode();
  }

  /*
   * ⋮ beside the deepest node shown, when the marks run on past the
   * tree's edge (a long prosign): upright, so it fits in the padding
   * and nothing re-scales; coloured as the path's next step would be.
   */
  function carriesOn(code, next) {
    const pre = $("#tree");
    const node = pre.querySelector(`.lbl[data-code="${CSS.escape(code)}"]`);
    if (!node) return;
    const p = pre.getBoundingClientRect(), n = node.getBoundingClientRect();
    const more = el("span", `more on ${next === "." ? "dot" : "dash"}`, "⋮");
    more.setAttribute("aria-hidden", "true");
    more.style.left = (n.right - p.left) + "px";
    more.style.top = (n.top - p.top + n.height / 2) + "px";
    pre.append(more);
  }

  /*
   * No scrolling: the whole tree is scaled to its half of the
   * field. Measured at a base size, then sized so both its width
   * and height fit (text stays crisp; it's real text, not zoom).
   */
  const TREE_BASE = 13;
  const TREE_MAX = 18;
  const TREE_MIN = 6;    // tiny, but the lit path still reads; only crowded trees scroll (and follow)

  /* scale the drawn tree to fit its box */
  /* the room inside the scroll area, not counting its padding */
  function room(box) {
    const cs = getComputedStyle(box);
    return {
      w: box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      h: box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    };
  }

  function fitTree() {
    const box = $("#tree-scroll"), pre = $("#tree");
    pre.style.fontSize = TREE_BASE + "px";
    const w = pre.scrollWidth, h = pre.scrollHeight;
    if (!w || !h) return;
    const { w: rw, h: rh } = room(box);
    /* 0.98: glyph widths don't scale perfectly linearly; stay inside */
    const scale = Math.min(rw / w, rh / h) * 0.98;
    const size = Math.max(TREE_MIN, Math.min(TREE_MAX, Math.floor(TREE_BASE * scale * 10) / 10));
    pre.style.fontSize = size + "px";
    box.classList.toggle("scrolls", pre.scrollHeight > rh + 1 || pre.scrollWidth > rw + 1);
  }

  /*
   * When the tree is too big to shrink any further (lots of
   * numbers and symbols), the panel scrolls, and follows the
   * node you're on the way the tape follows the caret.
   */
  function followNode() {
    const box = $("#tree-scroll"), pre = $("#tree");
    if (!box.classList.contains("scrolls")) {
      box.scrollTop = box.scrollLeft = 0;
      return;
    }
    /* the current letter, the one just landed, or the deepest lit step */
    let target = pre.querySelector(".lbl.on, .lbl.landed");
    if (!target) {
      for (const s of pre.querySelectorAll(".on")) {
        if (!target || (s.dataset.code ?? "").length >= (target.dataset.code ?? "").length) target = s;
      }
    }
    if (!target) return;

    const b = box.getBoundingClientRect(), t = target.getBoundingClientRect();
    const mx = Math.min(40, b.width / 4), my = b.height / 4;   // keep some tree around it
    if (t.left < b.left + mx) box.scrollLeft -= b.left + mx - t.left;
    else if (t.right > b.right - mx) box.scrollLeft += t.right - (b.right - mx);
    if (t.top < b.top + my) box.scrollTop -= b.top + my - t.top;
    else if (t.bottom > b.bottom - my) box.scrollTop += t.bottom - (b.bottom - my);
  }

  /*
   * The panel's width is set from the DEFAULT tree (letters only)
   * and only changes when the screen does (tray, rotation), never
   * while keying: extra branches (numbers, symbols) make the tree
   * smaller instead of the panel wider.
   */
  let panelFor = "";

  function sizeTreePanel() {
    const station = $(".station"), edge = $(".tree-edge");
    const key = station.clientWidth + "x" + station.clientHeight;
    if (key === panelFor) return;
    panelFor = key;
    edge.style.width = "";                       // half, then measure the default tree in it
    tree.render(buildModel({ letters: true }), false);
    fitTree();
    /* give the spare width back to the message; the padding on
       both sides of the tree stays equal */
    const spare = room($("#tree-scroll")).w - $("#tree").scrollWidth;
    if (spare > 2) edge.style.width = Math.ceil(edge.getBoundingClientRect().width - spare + 2) + "px";
  }

  async function openTree(open) {
    if (open && !tree) {
      try { await load(); } catch { return; }   // (offline and never cached: it stays closed)
    }
    treeOpen = open;
    document.body.classList.toggle("tree-open", open);
    $("#tree-box").hidden = !open;
    $("#local").hidden = open;
    $("#about").hidden = open;
    const toggle = $("#tree-toggle");
    toggle.innerHTML = icon(open ? "out" : "in");
    toggle.title = open ? "back to where you are" : "show the whole tree";
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) $(".tree-edge").style.width = "";
    panelFor = "";
    try { localStorage.setItem("dot-dash:tx-tree", open ? "1" : "0"); } catch { }
    update();   /* the field changed size: re-fit the tree, re-settle the tape */
  }

  $("#tree-toggle").addEventListener("click", () => openTree(!treeOpen));
  /* a tap on the collapsed tree (not its two children) opens it too */
  $("#local").addEventListener("click", event => {
    if (!event.target.closest("button")) openTree(true);
  });

  /*
   * Whenever the station changes size (settings tray opening or
   * closing, the tree toggling, rotating the phone, an on-screen
   * keyboard), re-fit the tree and re-settle the tape. Watching
   * the box itself catches every cause, not just window resizes.
   */
  let refitQueued = false;
  new ResizeObserver(() => {
    if (refitQueued) return;
    refitQueued = true;
    requestAnimationFrame(() => {
      refitQueued = false;
      if (treeOpen) drawTree();   // re-measures the panel only if the station's size changed
      else about.draw(about.current());   // the column's size may have changed
      settleTape();
    });
  }).observe($(".station"));

  /* tap a letter in the tree to key all of it */
  $("#tree").addEventListener("click", event => {
    const t = event.target;
    const code = t.dataset?.code;
    if (t.dataset?.kind !== "lbl" || !code || t.classList.contains("blank")) return;
    if (structure(state.tokens).path) state.tokens.push(" ");
    state.tokens.push(...code, " ");
    state.localCleared = false;
    update();
  });

  return { tree: shown, about, drawLocal, drawTree, followNode, openTree, isTreeOpen: () => treeOpen, inTree, REAL };
}

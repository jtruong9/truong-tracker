// Drag and drop: reorder categories by their grip, and move an item to another category by dragging it.
//
// Pointer events, not HTML5 drag and drop: one code path for a mouse, a pen and a finger (HTML5 drag doesn't work on
// iPhone). A drag starts only from a category's grip (⋮⋮) or an item's grip, so clicking titles, ticking steps and
// selecting text never start one. On touch the browser is told not to scroll from a grip (touch-action: none in CSS).
//
//   category: drag the grip; a line shows where it lands among that section's categories (sideways on the board,
//             up and down on the list); drop to save the new order.
//   item:     drag the grip onto another category (a column, or a category card); it is highlighted; drop to move the
//             item there. Order inside a category stays automatic, so items don't reorder inside their own category.
//   Esc cancels. A focused category grip also moves with the arrow keys.
"use strict";

const Drag = (() => {
  let d = null;          // the drag in progress
  const MOVE_PX = 6;     // a press that moves less than this is a click, not a drag

  const isBoard = () => !!document.querySelector("#page-section .board");
  const catEls = () => [...document.querySelectorAll("#page-section [data-cat]")].filter((el) => !el.closest("[data-cat] [data-cat]"));

  function start(e) {
    const grip = e.target.closest(".grip");
    if (!grip || e.button > 0) return;
    const kind = grip.dataset.drag;                       // "cat" | "item"
    const host = kind === "cat" ? grip.closest("[data-cat]") : grip.closest("[data-id]");
    if (!host) return;
    e.preventDefault();
    d = { kind, grip, host, id: kind === "cat" ? host.dataset.cat : host.dataset.id, x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId, ghost: null, mark: null, target: null };
    // keep getting moves even when the pointer leaves the grip; if the browser refuses (Safari can, for a pointer
    // it isn't tracking), the document-level listeners still see every move
    try { grip.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
  }

  function move(e) {
    if (!d || e.pointerId !== d.pid) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < MOVE_PX) return;
      d.moved = true;
      document.body.classList.add("dragging");
      d.host.classList.add("drag-src");
      const r = d.host.getBoundingClientRect();
      d.dx = d.x0 - r.left; d.dy = d.y0 - r.top;
      d.ghost = d.host.cloneNode(true);
      d.ghost.classList.add("drag-ghost");
      d.ghost.removeAttribute("data-cat"); d.ghost.removeAttribute("data-id");
      d.ghost.style.width = r.width + "px";
      d.ghost.style.height = Math.min(r.height, d.kind === "cat" ? 220 : 140) + "px";
      document.body.append(d.ghost);
      if (d.kind === "cat") { d.mark = document.createElement("div"); d.mark.className = "drop-line" + (isBoard() ? " v" : ""); document.body.append(d.mark); }
    }
    d.ghost.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px)`;
    if (d.kind === "cat") placeLine(e); else pickTarget(e);
    autoScroll(e);
  }

  // where a category would land: before the first category whose middle is past the pointer
  function placeLine(e) {
    const board = isBoard(), list = catEls().filter((el) => el.dataset.cat !== d.id);
    let before = null;
    for (const el of list) {
      const r = el.getBoundingClientRect();
      if (board ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2) { before = el; break; }
    }
    d.target = before ? before.dataset.cat : "";      // "" = at the end
    const ref = before || list[list.length - 1];
    if (!ref) { d.mark.hidden = true; return; }
    const r = ref.getBoundingClientRect();
    d.mark.hidden = false;
    if (board) Object.assign(d.mark.style, { left: (before ? r.left - 8 : r.right + 6) + "px", top: r.top + "px", height: Math.min(r.height, window.innerHeight - r.top - 8) + "px", width: "" });
    else Object.assign(d.mark.style, { top: (before ? r.top - 7 : r.bottom + 5) + "px", left: r.left + "px", width: r.width + "px", height: "" });
  }

  // which category an item would move to: the category under the pointer (not its own)
  function pickTarget(e) {
    d.ghost.style.visibility = "hidden";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    d.ghost.style.visibility = "";
    const cat = under && under.closest("#page-section [data-cat]");
    const it = Store.item(d.id);
    const id = cat && it && cat.dataset.cat !== it.categoryId ? cat.dataset.cat : null;
    if (id === d.target) return;
    document.querySelectorAll(".drop-into").forEach((x) => x.classList.remove("drop-into"));
    d.target = id;
    if (cat && id) cat.classList.add("drop-into");
  }

  function autoScroll(e) {
    const edge = 40, sp = 14;
    if (e.clientY < edge) window.scrollBy(0, -sp); else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, sp);
    const b = document.querySelector("#page-section .board");
    if (b) { const r = b.getBoundingClientRect(); if (e.clientX < r.left + edge) b.scrollLeft -= sp; else if (e.clientX > r.right - edge) b.scrollLeft += sp; }
  }

  async function end(e, cancel) {
    if (!d || (e && e.pointerId !== d.pid)) return;
    const s = d; d = null;
    // release before saving: the save redraws the page, and the grip may already be gone (Safari throws on a
    // release from a removed element, so check it is still captured and still in the page)
    try { if (s.grip.isConnected && s.grip.hasPointerCapture(s.pid)) s.grip.releasePointerCapture(s.pid); } catch { /* already released */ }
    document.body.classList.remove("dragging");
    s.host.classList.remove("drag-src");
    if (s.ghost) s.ghost.remove();
    if (s.mark) s.mark.remove();
    document.querySelectorAll(".drop-into").forEach((x) => x.classList.remove("drop-into"));
    if (!s.moved || cancel) return;
    if (s.kind === "cat") await dropCat(s.id, s.target);
    else if (s.target) await dropItem(s.id, s.target);
  }

  // save the new category order (only the section the category is in)
  async function dropCat(id, beforeId) {
    const c = Store.category(id); if (!c) return;
    const cats = Store.categories().filter((x) => x.section === c.section).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const rest = cats.filter((x) => x.id !== id);
    const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, c);
    if (rest.every((x, k) => x.id === cats[k].id)) return;          // dropped where it was
    await Store.saveCategories(rest.map((x, k) => ({ ...x, order: k + 1 })));
  }

  // move an item into another category; across sections (task <-> gift) its status is re-fitted
  async function dropItem(itemId, catId) {
    const it = Store.item(itemId), c = Store.category(catId);
    if (!it || !c || it.categoryId === c.id) return;
    const status = Model.fitStatus(it.status, c.section);
    await Store.saveItem({ ...it, categoryId: c.id, section: c.section, status, doneAt: Model.isDone({ status }) ? it.doneAt || Date.now() : 0 });
    toast(`Moved "${it.title}" to ${c.name}.`);
  }

  // keyboard: arrow keys on a focused category grip move it one place
  async function key(e) {
    const grip = e.target.closest && e.target.closest(".grip[data-drag='cat']");
    if (!grip) return;
    const back = ["ArrowUp", "ArrowLeft"].includes(e.key), fwd = ["ArrowDown", "ArrowRight"].includes(e.key);
    if (!back && !fwd) return;
    e.preventDefault();
    const id = grip.closest("[data-cat]").dataset.cat, c = Store.category(id); if (!c) return;
    const cats = Store.categories().filter((x) => x.section === c.section).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const i = cats.findIndex((x) => x.id === id), j = i + (back ? -1 : 1);
    if (j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    await Store.saveCategories(cats.map((x, k) => ({ ...x, order: k + 1 })));
    const g = document.querySelector(`[data-cat="${CSS.escape(id)}"] .grip[data-drag='cat']`);
    if (g) g.focus();
  }

  document.addEventListener("pointerdown", start);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && d) { end({ pointerId: d.pid }, true); return; } key(e); });
  // a drag that never moved is a click on the grip: nothing to do; a real drag must not click what it lands on
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".grip")) e.preventDefault(); }, true);

  return { active: () => !!(d && d.moved), dropCat, dropItem };
})();

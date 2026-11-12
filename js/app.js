// The page: Today, Work, Personal, How to use, Settings. Reads Store, draws with plain DOM strings.
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => Model.todayIso();

// Per-computer view settings (what is open, filters). Not data, so localStorage; it may be empty.
const view = (() => {
  const K = "truong-tracker.view";
  let v = {};
  try { v = JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch { v = {}; }
  const save = () => { try { localStorage.setItem(K, JSON.stringify(v)); } catch { /* private window: fine */ } };
  return {
    get: (k, d) => (k in v ? v[k] : d),
    set: (k, val) => { v[k] = val; save(); },
    toggleIn: (k, id) => { const s = new Set(v[k] || []); s.has(id) ? s.delete(id) : s.add(id); v[k] = [...s]; save(); return s.has(id); },
    has: (k, id) => (v[k] || []).includes(id),
  };
})();

const ui = { tab: view.get("tab", "today"), q: "" };

function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------------------------------ pieces
const statusOpts = (sec, sel) => Model.statusesFor(sec).map((s) => `<option value="${s.key}"${s.key === sel ? " selected" : ""}>${s.label}</option>`).join("");
const PRI_OPTS = Model.PRIORITIES.map((p) => `<option value="${p.key}">${p.label}</option>`).join("");
const fmtMoney = (n) => "$" + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const priceChip = (it) => (Model.isGift(it) && it.price != null ? `<span class="price">${fmtMoney(it.price)}</span>` : "");
const occChip = (it) => (Model.isGift(it) && it.occasion ? `<span class="occ">${esc(it.occasion)}</span>` : "");
const SECTION_KEYS = Model.SECTIONS.map((s) => s.key);
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }); };

function dueChip(it) {
  if (!it.due) return "";
  const st = Model.dueState(it, today());
  const word = st === "overdue" ? "Overdue · " : st === "today" ? "Today · " : "";
  return `<span class="due due-${st}" title="Due ${esc(it.due)}">${word}${esc(fmtDate(it.due))}</span>`;
}
const priChip = (it) => (it.priority ? `<span class="pri pri-${it.priority}">${Model.label(Model.PRIORITIES, it.priority)}</span>` : "");
function progChip(it) {
  const p = Model.progress(it);
  if (!p.total) return "";
  return `<span class="prog" title="${p.done} of ${p.total} steps done"><span class="bar"><i style="width:${Math.round((100 * p.done) / p.total)}%"></i></span>${p.done}/${p.total}</span>`;
}
const linkChips = (it) => it.links.map((l) => `<a class="lnk" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}">${icon("link")}${esc(l.label || shortUrl(l.url))}</a>`).join("");
function shortUrl(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + (x.pathname.length > 1 ? x.pathname.slice(0, 18) + (x.pathname.length > 18 ? "…" : "") : ""); } catch { return u; } }

// One item row. `ctx` = "section" (inside its category) or "today" (shows where it lives).
function itemRow(it, ctx) {
  const open = view.has("openItems", it.id);
  const cat = Store.category(it.categoryId);
  const where = ctx === "today" ? `<span class="where">${esc(Model.label(Model.SECTIONS, it.section))} › ${esc(cat ? cat.name : "No category")}</span>` : "";
  const hasMore = it.checklist.length || it.notes || ctx === "section";
  return `<div class="it st-${it.status}${Model.isDone(it) ? " is-done" : ""}${open ? " open" : ""}" data-id="${esc(it.id)}">
    <div class="it-row">
      <button class="ghost tiny it-tog" data-act="toggle-item" aria-label="${open ? "Hide" : "Show"} details" ${hasMore ? "" : "disabled"}>${icon(open ? "chevronDown" : "chevronRight")}</button>
      <button class="it-title" data-act="edit-item" title="Edit">${esc(it.title)}</button>
      ${where}
      <span class="it-meta">${occChip(it)}${priceChip(it)}${progChip(it)}${priChip(it)}${dueChip(it)}${linkChips(it)}</span>
      <select class="st-sel st-${it.status}" data-act="status" aria-label="Status">${statusOpts(it.section, it.status)}</select>
    </div>
    ${open ? itemBody(it) : ""}
  </div>`;
}

function itemBody(it) {
  const steps = it.checklist.map((c, i) => `<label class="step${c.done ? " done" : ""}"><input type="checkbox" data-act="step" data-i="${i}" ${c.done ? "checked" : ""}><span>${esc(c.text)}</span></label>`).join("");
  return `<div class="it-body">
    ${steps ? `<div class="steps">${steps}</div>` : ""}
    <div class="step-add"><input data-act="step-new" placeholder="Add a step, then Enter" aria-label="Add a step"></div>
    ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ""}
  </div>`;
}

// ------------------------------------------------------------------------------------------ pages
function render() {
  if ($("#app").hidden) return;
  $$("#tabs button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
  const isSection = SECTION_KEYS.includes(ui.tab);
  $("#page-today").hidden = ui.tab !== "today";
  $("#page-section").hidden = !isSection;
  $("#page-help").hidden = ui.tab !== "help";
  $("#page-settings").hidden = ui.tab !== "settings";
  $(".search").hidden = !(isSection || ui.tab === "today");
  $("#page-title").textContent = isSection ? Model.label(Model.SECTIONS, ui.tab) : { today: "Today", help: "How to use", settings: "Settings" }[ui.tab];
  if (ui.tab === "today") renderToday();
  if (isSection) renderSection(ui.tab);
  if (ui.tab === "settings") {
    const phone = Store.mode() === "drive";
    $("#st-folder").textContent = phone
      ? `This phone reads and saves "${Store.folderName()}" in Google Drive${Drive.savedEmail() ? ` (${Drive.savedEmail()})` : ""}. Its own file is tracker-${Store.deviceId()}.json.`
      : `This computer reads and writes "${Store.folderName()}" (its own file is tracker-${Store.deviceId()}.json).`;
    $("#st-change").hidden = phone;
    $("#st-signout").hidden = !phone;
  }
  renderCounts();
}

function renderCounts() {
  const t = today(), all = Store.items();
  for (const s of SECTION_KEYS) {
    const st = Model.stats(all.filter((i) => i.section === s), t);
    $("#count-" + s).textContent = st.open ? String(st.open) : "";
    $("#count-" + s).classList.toggle("bad", st.overdue > 0);
    $("#count-" + s).title = `${st.open} open${st.overdue ? `, ${st.overdue} overdue` : ""}`;
  }
  const f = Model.focus(all, t, "");
  const urgent = f.overdue.length + f.today.length;
  $("#badge-today").hidden = !urgent;
  $("#badge-today").textContent = urgent;
}

function renderToday() {
  const sec = view.get("todaySec", "");
  const items = Store.items().filter((i) => Model.matches(i, ui.q));
  const f = Model.focus(items, today(), sec);
  const groups = [
    ["overdue", "Overdue", "bad"], ["today", "Due today", "warn"], ["soon", "Due in the next 7 days", ""],
    ["blocked", "Blocked", "warn"], ["doing", "In progress", ""],
  ];
  const n = groups.reduce((a, [k]) => a + f[k].length, 0);
  const seg = [["", "All"], ...Model.SECTIONS.map((s) => [s.key, s.label])].map(([k, l]) => `<button class="${sec === k ? "on" : ""}" data-act="today-sec" data-sec="${k}">${l}</button>`).join("");
  const d = new Date();
  let h = `<div class="page-head"><div><h1>Today</h1><div class="sub">${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · ${n ? `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} you` : "nothing due or in progress"}${ui.q ? ` matching "${esc(ui.q)}"` : ""}</div></div><div class="actions seg">${seg}</div></div>`;
  if (!Store.categories().length) h += emptyStart();
  for (const [k, label, tone] of groups) {
    if (!f[k].length) continue;
    h += `<div class="card group"><h2 class="${tone}">${label} <span class="n">${f[k].length}</span></h2>${f[k].map((i) => itemRow(i, "today")).join("")}</div>`;
  }
  if (!n && Store.categories().length) h += `<div class="card empty">Nothing overdue, due this week, blocked or in progress${sec ? " in " + Model.label(Model.SECTIONS, sec) : ""}. Open <b>Work</b>, <b>Personal</b> or <b>Gifts</b> to see everything.</div>`;
  $("#page-today").innerHTML = h;
}

function emptyStart() {
  return `<div class="card empty"><h2>Nothing here yet</h2><p>Open <b>Work</b> or <b>Personal</b> and click <b>Add category</b> to start, for example <i>Projects</i>, then add items under it.</p></div>`;
}

// "2 ideas · 1 bought · 1 given · $185 spent": a person's gifts at a glance
function giftSummary(s) {
  const parts = Model.GIFT_STATUSES.filter((x) => s.byStatus[x.key]).map((x) => `${s.byStatus[x.key]} ${x.label.toLowerCase()}${x.key === "idea" && s.byStatus[x.key] > 1 ? "s" : ""}`);
  if (s.spent) parts.push(`${fmtMoney(s.spent)} spent`);
  if (s.overdue) parts.push(`<span class="bad">${s.overdue} overdue</span>`);
  return parts.join(" · ") || "No gifts yet";
}

function renderSection(sec) {
  const gift = Model.isGift(sec);
  const show = view.get("show", "open");      // open | all | done (gifts: done = given)
  const pri = view.get("pri", "");            // "" = any
  const occ = view.get("occ", "");            // gifts: "" = any occasion
  const t = today();
  const cats = Store.categories().filter((c) => c.section === sec).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const all = Store.items().filter((i) => i.section === sec);
  const st = Model.stats(all, t);
  const occs = gift ? Model.occasions(all) : [];
  const occOn = gift && occ && occs.some((o) => o.toLowerCase() === occ.toLowerCase()) ? occ : "";
  const pass = (i) => (show === "open" ? !Model.isDone(i) : show === "done" ? Model.isDone(i) : true) &&
    (gift ? !occOn || i.occasion.toLowerCase() === occOn.toLowerCase() : !pri || i.priority === pri) && Model.matches(i, ui.q);
  const seg = [["open", "Open"], ["all", "All"], ["done", gift ? "Given" : "Done"]].map(([k, l]) => `<button class="${show === k ? "on" : ""}" data-act="show" data-show="${k}">${l}</button>`).join("");
  const filterSel = gift
    ? (occs.length ? `<select data-act="occ-filter" aria-label="Occasion filter"><option value="">Any occasion</option>${occs.map((o) => `<option value="${esc(o)}" ${occOn.toLowerCase() === o.toLowerCase() ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : "")
    : `<select data-act="pri-filter" aria-label="Priority filter"><option value="">Any priority</option>${Model.PRIORITIES.filter((p) => p.key).map((p) => `<option value="${p.key}" ${pri === p.key ? "selected" : ""}>${p.label}</option>`).join("")}</select>`;
  const catWord = gift ? ["person", "people"] : ["category", "categories"];
  const sub = gift
    ? `${cats.length} ${cats.length === 1 ? catWord[0] : catWord[1]} · ${giftSummary(st)}`
    : `${cats.length} ${cats.length === 1 ? catWord[0] : catWord[1]} · ${st.open} open · ${st.done} done${st.overdue ? ` · <span class="bad">${st.overdue} overdue</span>` : ""}${st.blocked ? ` · <span class="warn">${st.blocked} blocked</span>` : ""}`;
  let h = `<div class="page-head"><div><h1>${Model.label(Model.SECTIONS, sec)}</h1><div class="sub">${sub}</div></div>
    <div class="actions"><span class="seg">${seg}</span>${filterSel}<button data-act="add-cat"><span>${icon("plus")}</span>${gift ? "Add person" : "Add category"}</button></div></div>`;
  if (sec === "work") h += `<p class="hint work-note">⚠ Saved in your personal Google Drive: names and status only, no CUI, ITAR / EAR or proprietary details.</p>`;
  if (!cats.length) h += gift
    ? `<div class="card empty"><h2>No people yet</h2><p>Click <b>Add person</b>, for example <i>Wife</i> or <i>Sister</i>, then add gift ideas under them.</p></div>`
    : `<div class="card empty"><h2>No categories yet</h2><p>Click <b>Add category</b>, for example <i>${sec === "work" ? "Projects" : "Home"}</i>.</p></div>`;
  const filtering = show !== "all" || pri || occOn || ui.q;
  const what = gift ? "gift" : "item";
  cats.forEach((c, idx) => {
    const ci = all.filter((i) => i.categoryId === c.id);
    const shown = Model.sortItems(ci.filter(pass));
    const cs = Model.stats(ci, t);
    const collapsed = view.has("closedCats", c.id) && !ui.q;
    const pct = cs.total ? Math.round((100 * cs.done) / cs.total) : 0;
    const csum = gift ? giftSummary(cs)
      : `${cs.done}/${cs.total} done${cs.overdue ? ` · <span class="bad">${cs.overdue} overdue</span>` : ""}${cs.blocked ? ` · <span class="warn">${cs.blocked} blocked</span>` : ""}`;
    h += `<div class="card cat${collapsed ? " collapsed" : ""}" data-cat="${esc(c.id)}">
      <div class="cat-head">
        <button class="ghost tiny" data-act="toggle-cat" aria-label="${collapsed ? "Open" : "Close"} ${catWord[0]}">${icon(collapsed ? "chevronRight" : "chevronDown")}</button>
        <h2 data-act="toggle-cat">${esc(c.name)}</h2>
        <span class="cat-sum">${csum}</span>
        ${gift ? "" : `<span class="bar wide" title="${pct}% done"><i style="width:${pct}%"></i></span>`}
        <span class="cat-tools">
          <button class="ghost tiny" data-act="add-item-cat" title="Add ${what} with details">${icon("plus")}</button>
          <button class="ghost tiny" data-act="cat-up" title="Move up" ${idx === 0 ? "disabled" : ""}>${icon("arrowUp")}</button>
          <button class="ghost tiny" data-act="cat-down" title="Move down" ${idx === cats.length - 1 ? "disabled" : ""}>${icon("arrowDown")}</button>
          <button class="ghost tiny" data-act="cat-edit" title="Rename">${icon("pencil")}</button>
          <button class="ghost tiny danger" data-act="cat-del" title="Delete ${catWord[0]}">${icon("trash")}</button>
        </span>
      </div>
      ${collapsed ? "" : `<div class="cat-items">${shown.map((i) => itemRow(i, "section")).join("") || `<div class="none">${ci.length && filtering ? `No ${what}s match the filter.` : `No ${what}s yet.`}</div>`}</div>
      <div class="quick-add"><input data-act="quick-add" placeholder="Add a${gift ? " gift idea for" : "n item to"} ${esc(c.name)}, then Enter" aria-label="Add a${gift ? " gift idea for" : "n item to"} ${esc(c.name)}"></div>`}
    </div>`;
  });
  const orphans = all.filter((i) => !Store.category(i.categoryId) && pass(i));
  if (orphans.length) h += `<div class="card cat"><div class="cat-head"><h2>No category</h2><span class="cat-sum">Edit an item to give it a category</span></div><div class="cat-items">${Model.sortItems(orphans).map((i) => itemRow(i, "section")).join("")}</div></div>`;
  $("#page-section").innerHTML = h;
}

// ------------------------------------------------------------------------------------------ actions
function itemOf(el) { const r = el.closest("[data-id]"); return r ? Store.item(r.dataset.id) : null; }
function catOf(el) { const r = el.closest("[data-cat]"); return r ? Store.category(r.dataset.cat) : null; }

document.addEventListener("click", async (e) => {
  const tab = e.target.closest("#tabs button[data-tab]");
  if (tab) { ui.tab = tab.dataset.tab; view.set("tab", ui.tab); if (narrow()) setMenu(false); render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest("[data-act]");
  if (!a || a.tagName === "SELECT" || a.tagName === "INPUT") return;
  const act = a.dataset.act;
  if (act === "toggle-item") { const it = itemOf(a); if (it) { view.toggleIn("openItems", it.id); render(); } }
  else if (act === "edit-item") { const it = itemOf(a); if (it) openItem(it); }
  else if (act === "toggle-cat") { const c = catOf(a); if (c) { view.toggleIn("closedCats", c.id); render(); } }
  else if (act === "add-item-cat") { const c = catOf(a); if (c) openItem(null, c); }
  else if (act === "add-cat") openCat(null, ui.tab);
  else if (act === "cat-edit") { const c = catOf(a); if (c) openCat(c); }
  else if (act === "cat-up" || act === "cat-down") { const c = catOf(a); if (c) await moveCat(c, act === "cat-up" ? -1 : 1); }
  else if (act === "cat-del") { const c = catOf(a); if (c) await deleteCat(c); }
  else if (act === "show") { view.set("show", a.dataset.show); render(); }
  else if (act === "today-sec") { view.set("todaySec", a.dataset.sec); render(); }
});

document.addEventListener("change", async (e) => {
  const a = e.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act;
  if (act === "status") {
    const it = itemOf(a); if (!it) return;
    const done = a.value === "done" || a.value === "given";
    await Store.saveItem({ ...it, status: a.value, doneAt: done ? Date.now() : 0 });
    if (done) toast(`"${it.title}" ${a.value === "given" ? "given" : "done"}.`);
  } else if (act === "step") {
    const it = itemOf(a); if (!it) return;
    const checklist = it.checklist.map((c, i) => (i === Number(a.dataset.i) ? { ...c, done: a.checked } : c));
    await Store.saveItem({ ...it, checklist });
  } else if (act === "pri-filter") { view.set("pri", a.value); render(); }
  else if (act === "occ-filter") { view.set("occ", a.value); render(); }
});

document.addEventListener("keydown", async (e) => {
  const a = e.target.closest && e.target.closest("[data-act]");
  if (!a || e.key !== "Enter" || e.isComposing) return;
  const text = a.value.trim();
  if (a.dataset.act === "quick-add") {
    e.preventDefault();
    const c = catOf(a); if (!c || !text) return;
    a.value = "";   // emptied first: the redraw is skipped while this box holds typing
    // a gift typed into the Occasion filter's view gets that occasion, so it stays visible
    const occ = Model.isGift(c.section) ? view.get("occ", "") : "";
    await Store.saveItem({ section: c.section, categoryId: c.id, title: text, status: Model.statusesFor(c.section)[0].key, occasion: occ });
    focusAfterRender(`[data-cat="${cssEsc(c.id)}"] [data-act="quick-add"]`);
  } else if (a.dataset.act === "step-new") {
    e.preventDefault();
    const it = itemOf(a); if (!it || !text) return;
    a.value = "";
    // a new step reopens a finished task; a given gift stays given
    const reopen = it.status === "done";
    await Store.saveItem({ ...it, checklist: [...it.checklist, { text, done: false }], status: reopen ? "doing" : it.status, doneAt: reopen ? 0 : it.doneAt });
    focusAfterRender(`[data-id="${cssEsc(it.id)}"] [data-act="step-new"]`);
  }
});
const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
function focusAfterRender(sel) { const el = $(sel); if (el) el.focus(); }

async function moveCat(c, dir) {
  const cats = Store.categories().filter((x) => x.section === c.section).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const i = cats.findIndex((x) => x.id === c.id), j = i + dir;
  if (j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  await Store.saveCategories(cats.map((x, k) => ({ ...x, order: k + 1 })));
}

async function deleteCat(c) {
  const n = Store.items().filter((i) => i.categoryId === c.id).length;
  const g = Model.isGift(c.section), what = g ? "gift" : "item";
  if (!confirm(`Delete ${g ? "" : "the category "}"${c.name}"${n ? ` and ${g ? "their" : "its"} ${n} ${what}${n === 1 ? "" : "s"}` : ""}? This can't be undone (a backup file can bring it back).`)) return;
  await Store.deleteCategory(c.id);
  toast(`Deleted "${c.name}".`);
}

// ---- category dialog ----
let catEditing = null;
function openCat(c, sec) {
  catEditing = c;
  const s = c ? c.section : SECTION_KEYS.includes(sec) ? sec : "work";
  catDialogWords(s);
  $("#ct-name").value = c ? c.name : "";
  $("#ct-section").value = s;
  $("#ct-section").disabled = !!c;
  $("#ct-msg").hidden = !!c;
  $("#dlg-cat").showModal();
  $("#ct-name").focus();
}
// The dialog speaks of a "person" in Gifts and a "category" elsewhere
function catDialogWords(s) {
  const g = Model.isGift(s);
  $("#ct-head").textContent = catEditing ? (g ? "Rename person" : "Rename category") : g ? "Add person" : "Add category";
  $("#ct-name").placeholder = g ? "For example, Wife or Sister" : "For example, Projects";
  $("#ct-msg").textContent = g ? "Each person holds their gift ideas." : "A category groups items, for example Projects or Home.";
}
$("#ct-section").onchange = () => catDialogWords($("#ct-section").value);
$("#ct-cancel").onclick = () => $("#dlg-cat").close();
$("#form-cat").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#ct-name").value.trim(); if (!name) return;
  if (catEditing) await Store.saveCategory({ ...catEditing, name });
  else {
    const section = $("#ct-section").value;
    const max = Math.max(0, ...Store.categories().filter((x) => x.section === section).map((x) => x.order));
    await Store.saveCategory({ section, name, order: max + 1 });
    if (ui.tab !== section) { ui.tab = section; view.set("tab", section); render(); }
  }
  $("#dlg-cat").close();
};

// ---- item dialog ----
let itEditing = null, itSteps = [], itLinks = [];
function catOptions(selected) {
  return Model.SECTIONS.map((s) => {
    const cs = Store.categories().filter((c) => c.section === s.key).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return cs.length ? `<optgroup label="${s.label}">${cs.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
}
function openItem(it, cat) {
  if (!Store.categories().length) { toast("Add a category first (open Work, Personal or Gifts)."); return; }
  itEditing = it;
  const defCat = it ? it.categoryId : cat ? cat.id : defaultCatId();
  $("#it-title").value = it ? it.title : "";
  $("#it-cat").innerHTML = catOptions(defCat);
  $("#it-pri").innerHTML = PRI_OPTS; $("#it-pri").value = it ? it.priority : "";
  $("#it-due").value = it ? it.due : "";
  $("#it-notes").value = it ? it.notes : "";
  $("#it-price").value = it && it.price != null ? String(it.price) : "";
  $("#it-occ").value = it ? it.occasion : Model.isGift(ui.tab) ? view.get("occ", "") : "";
  itSteps = it ? it.checklist.map((c) => ({ ...c })) : [];
  itLinks = it ? it.links.map((l) => ({ ...l })) : [];
  $("#it-err").textContent = "";
  $("#it-delete").hidden = !it;
  itStatusKeep = it ? it.status : "";
  $("#it-status").innerHTML = "";
  $("#occ-list").innerHTML = Model.occasions(Store.items().filter((i) => Model.isGift(i))).map((o) => `<option value="${esc(o)}">`).join("");
  drawSteps(); drawLinks(); sectionFields();
  $("#dlg-item").showModal();
  $("#it-title").focus();
}
function defaultCatId() {
  const sec = SECTION_KEYS.includes(ui.tab) ? ui.tab : "work";
  const cs = Store.categories().filter((c) => c.section === sec).sort((a, b) => a.order - b.order);
  return (cs[0] || Store.categories()[0]).id;
}
// The editor follows the chosen category's section: gift statuses, price and occasion for a person;
// task statuses and priority otherwise. Moving between them keeps a finished thing finished (Model.fitStatus).
let itStatusKeep = "";
function sectionFields() {
  const c = Store.category($("#it-cat").value), sec = c ? c.section : "work", g = Model.isGift(sec);
  const cur = $("#it-status").value || itStatusKeep;
  $("#it-status").innerHTML = statusOpts(sec, Model.fitStatus(cur || Model.statusesFor(sec)[0].key, sec));
  $("#it-head").textContent = itEditing ? (g ? "Edit gift" : "Edit item") : g ? "Add gift" : "Add item";
  $("#it-cat-lbl").textContent = g ? "For" : "Category";
  $$(".gift-only").forEach((el) => (el.hidden = !g));
  $$(".task-only").forEach((el) => (el.hidden = g));
  $("#it-worknote").hidden = sec !== "work";
}
$("#it-cat").onchange = () => { itStatusKeep = $("#it-status").value; sectionFields(); };
function drawSteps() {
  $("#it-checklist").innerHTML = itSteps.map((c, i) => `<div class="ed-row"><input type="checkbox" data-i="${i}" ${c.done ? "checked" : ""} aria-label="Done"><input class="ed-text" data-i="${i}" value="${esc(c.text)}" aria-label="Step"><button type="button" class="ghost tiny" data-del="${i}" title="Remove step">${icon("x")}</button></div>`).join("");
}
$("#it-checklist").addEventListener("input", (e) => { const i = Number(e.target.dataset.i); if (e.target.classList.contains("ed-text")) itSteps[i].text = e.target.value; else if (e.target.type === "checkbox") itSteps[i].done = e.target.checked; });
$("#it-checklist").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (b) { itSteps.splice(Number(b.dataset.del), 1); drawSteps(); } });
function addStep() { const v = $("#it-step").value.trim(); if (!v) return; itSteps.push({ text: v, done: false }); $("#it-step").value = ""; drawSteps(); $("#it-step").focus(); }
$("#it-step-add").onclick = addStep;
$("#it-step").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } });
function drawLinks() {
  $("#it-links").innerHTML = itLinks.map((l, i) => `<div class="ed-row"><input class="ed-lbl" data-i="${i}" value="${esc(l.label)}" placeholder="Name (optional)" aria-label="Link name"><input class="ed-url" data-i="${i}" value="${esc(l.url)}" placeholder="https://…" aria-label="Link address"><button type="button" class="ghost tiny" data-del="${i}" title="Remove link">${icon("x")}</button></div>`).join("");
}
$("#it-links").addEventListener("input", (e) => { const i = Number(e.target.dataset.i); if (e.target.classList.contains("ed-lbl")) itLinks[i].label = e.target.value; if (e.target.classList.contains("ed-url")) itLinks[i].url = e.target.value; });
$("#it-links").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (b) { itLinks.splice(Number(b.dataset.del), 1); drawLinks(); } });
$("#it-link-add").onclick = () => { itLinks.push({ label: "", url: "" }); drawLinks(); $$("#it-links .ed-url").pop().focus(); };
$("#it-due-clear").onclick = () => { $("#it-due").value = ""; };
$("#it-cancel").onclick = () => $("#dlg-item").close();
$("#it-delete").onclick = async () => {
  if (!itEditing || !confirm(`Delete "${itEditing.title}"?`)) return;
  await Store.deleteItem(itEditing.id);
  $("#dlg-item").close();
  toast("Item deleted.");
};
$("#form-item").onsubmit = async (e) => {
  e.preventDefault();
  const title = $("#it-title").value.trim();
  const cat = Store.category($("#it-cat").value);
  if (!title) { $("#it-err").textContent = "Give the item a title."; return; }
  if (!cat) { $("#it-err").textContent = "Pick a category."; return; }
  const pending = $("#it-step").value.trim();
  if (pending) itSteps.push({ text: pending, done: false });
  const bad = itLinks.filter((l) => l.url.trim() && !Model.safeUrl(l.url));
  if (bad.length) { $("#it-err").textContent = `Links must start with https:// or http:// (${bad.map((l) => l.url).join(", ")}).`; return; }
  const g = Model.isGift(cat.section);
  const priceText = $("#it-price").value.trim();
  if (g && priceText && Model.money(priceText) == null) { $("#it-err").textContent = `"${priceText}" isn't a price. Type a number, like 45 or 45.99.`; return; }
  const status = $("#it-status").value;
  const base = itEditing || {};
  const finished = status === "done" || status === "given";
  await Store.saveItem({
    ...base, title, section: cat.section, categoryId: cat.id, status,
    // a gift has no priority; a task keeps any price or occasion it had as a gift, unused
    priority: g ? base.priority || "" : $("#it-pri").value,
    price: g ? Model.money(priceText) : base.price, occasion: g ? $("#it-occ").value.trim() : base.occasion,
    due: $("#it-due").value, notes: $("#it-notes").value.trim(),
    checklist: itSteps.filter((c) => c.text.trim()), links: itLinks.filter((l) => l.url.trim()),
    doneAt: finished ? base.doneAt || Date.now() : 0,
  });
  $("#dlg-item").close();
  toast(itEditing ? "Saved." : g ? `Added a gift for ${cat.name}.` : `Added to ${cat.name}.`);
};
$("#btn-add").onclick = () => openItem(null, null);

// ---- search ----
let qTimer = null;
$("#q").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(() => { ui.q = $("#q").value.trim(); render(); }, 150); });

// ---- settings ----
$("#st-change").onclick = () => openApp(() => Store.pickFolder());
$("#st-backup").onclick = () => {
  const blob = new Blob([JSON.stringify(Store.snapshot(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `truong-tracker-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#st-load").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  $("#st-load-msg").textContent = "";
  try {
    const snap = JSON.parse(await f.text());
    const { cats, items, unfiled } = Model.readSnapshot(snap);
    if (!confirm(`Load ${cats.length} categor${cats.length === 1 ? "y" : "ies"} and ${items.length} item${items.length === 1 ? "" : "s"} from "${f.name}"?`)) return;
    await Store.restore(snap);
    toast(`Loaded ${cats.length} categories and ${items.length} items${unfiled ? ` (${unfiled} without a category)` : ""}.`, 5000);
  } catch (err) {
    $("#st-load-msg").textContent = "Couldn't load that file: " + err.message;
  } finally { e.target.value = ""; }
};

// ------------------------------------------------------------------------------------------ startup
$$("[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

async function start() {
  // Don't redraw under someone typing in a quick-add or step box
  Store.onChange(() => { const ae = document.activeElement; if (ae && ae.dataset && (ae.dataset.act === "quick-add" || ae.dataset.act === "step-new") && ae.value) return; render(); setStatus(); });
  const status = await Store.init();
  if (status === "ready") { await openApp(() => Store.open()); return; }
  if (status === "phone-ready") { showApp(); await phoneSync(true); return; }
  if (status === "phone-signin") { await phoneSetup(); return; }
  $("#setup").hidden = false;
  if (status === "needs-permission") {
    $("#setup-msg").textContent = "The browser needs your OK to open the data folder again.";
    $("#btn-regrant").hidden = false;
    $("#regrant-name").textContent = Store.folderName();
  }
}
function showApp() { $("#setup").hidden = true; $("#app").hidden = false; render(); setStatus(); }
async function openApp(fn) {
  try {
    const info = await fn();
    showApp();
    if (info.problems.length) toast("Couldn't read: " + info.problems.join("; "), 8000);
    setStatus(info);
  } catch (e) {
    if (e.name !== "AbortError") { $("#setup").hidden = false; $("#setup-msg").textContent = "Couldn't open the folder: " + e.message; }
  }
}

// ---- phones: sign in to Google Drive, find the folder, then keep it in step ----
async function phoneSetup() {
  $("#setup").hidden = false; $("#setup-folder").hidden = true; $("#setup-phone").hidden = false;
  $("#ph-err").textContent = Drive.lastError();
  if (!Drive.configured()) { $("#btn-google").hidden = true; $("#ph-hint").hidden = true; $("#ph-noconfig").hidden = false; return; }
  if (!Drive.token()) return;                 // waits for "Sign in with Google"
  $("#btn-google").hidden = true;
  $("#ph-msg").textContent = "Signed in. Looking for your Truong Tracker Data folder…";
  try {
    const found = await Store.findDriveFolder();
    if (found.length === 1) return phoneOpen(found[0]);
    const box = $("#ph-folders");
    box.hidden = false;
    if (!found.length) {
      $("#ph-msg").innerHTML = `No folder named <b>${esc(Store.FOLDER_NAME)}</b> was found in this Google account's Drive. On your computer, check it is in <b>My Drive</b> and has synced, and that this is the same Google account. Or start a new one here.`;
      box.innerHTML = `<button class="primary" id="ph-retry">Look again</button> <button id="ph-new">Make a new folder</button>`;
      $("#ph-retry").onclick = () => phoneSetup();
      $("#ph-new").onclick = async () => phoneOpen(await Store.createDriveFolder());
    } else {
      $("#ph-msg").textContent = `There are ${found.length} folders with that name. Pick the one your computers use (newest change first):`;
      box.innerHTML = found.map((f, i) => `<button class="${i ? "" : "primary"} ph-pick" data-i="${i}">${esc(f.name)} · changed ${esc(new Date(f.modifiedTime).toLocaleString())}</button>`).join("");
      $$(".ph-pick", box).forEach((b) => (b.onclick = () => phoneOpen(found[Number(b.dataset.i)])));
    }
  } catch (e) {
    if (e.auth) { $("#btn-google").hidden = false; $("#ph-msg").textContent = "Google sign-in ran out. Sign in again."; return; }
    $("#ph-err").textContent = "Couldn't reach Google Drive: " + e.message;
    $("#btn-google").hidden = false;
  }
}
async function phoneOpen(folder) {
  $("#ph-msg").textContent = `Loading "${folder.name}"…`;
  try {
    const info = await Store.openDrive(folder);
    showApp();
    setStatus(info);
    if (info.problems.length) toast("Couldn't read: " + info.problems.join("; "), 8000);
    else toast(`Connected to "${folder.name}": ${Store.items().length} items.`);
  } catch (e) {
    $("#ph-err").textContent = (e.auth ? "Google sign-in ran out. " : "Couldn't load the folder: ") + e.message;
    $("#btn-google").hidden = false;
  }
}
// Bring the phone up to date. When the sign-in has run out, a quiet trip to Google renews it and comes back.
async function phoneSync(opening) {
  if (Store.mode() !== "drive") return;
  if (!Drive.token()) {
    if (Drive.shouldTrySilent() && !anyTyping()) { Drive.signIn({ silent: true }); return; }
    setStatus(); return;
  }
  const info = await Store.reload();
  setStatus(info);
  if (info.auth && opening && Drive.shouldTrySilent()) Drive.signIn({ silent: true });
}
const anyTyping = () => !!document.querySelector("dialog[open]") || [...document.querySelectorAll("input,textarea")].some((i) => i === document.activeElement && i.value);
$("#btn-google").onclick = () => { $("#ph-err").textContent = ""; Drive.clearError(); try { Drive.signIn(); } catch (e) { $("#ph-err").textContent = e.message; } };
$("#st-signout").onclick = async () => {
  const s = Store.syncInfo();
  if (!confirm(s.dirty ? "This phone has changes that aren't in Google Drive yet. Sign out anyway and lose them?" : "Sign out of Google on this device? Your list stays in Google Drive.")) return;
  await Store.forgetPhone();
  location.reload();
};

let fileCount = 0;
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function setStatus(info) {
  if (info && info.files && info.files.length) fileCount = info.files.length;
  const s = Store.syncInfo();
  let line = `${Store.folderName()} · ${fileCount} file${fileCount === 1 ? "" : "s"} · ${Store.items().length} items`;
  if (s.mode === "drive") {
    line += s.lastSync ? ` · Drive ${hhmm(s.lastSync)}` : "";
    if (s.dirty) line += " · not saved to Drive yet";
  } else line += ` · ${hhmm(Date.now())}`;
  $("#status").textContent = line;
  const warn = s.mode === "drive" && (s.dirty || !Drive.token());
  $("#sync-bar").hidden = !(s.mode === "drive" && (s.note || !Drive.token()));
  if (!$("#sync-bar").hidden) {
    $("#sync-msg").textContent = s.note || (s.dirty ? "Your latest changes are on this phone only." : "Showing what's on this phone.");
    $("#sync-signin").hidden = !!Drive.token() || !Drive.configured();
  }
  $("#app").classList.toggle("unsynced", warn);
}
$("#sync-signin").onclick = () => { Drive.clearError(); Drive.signIn(); };
$("#btn-pick").onclick = () => openApp(() => Store.pickFolder());
$("#btn-regrant").onclick = () => openApp(() => Store.regrant());
$("#btn-refresh").onclick = async () => {
  if (Store.mode() === "drive") { await phoneSync(false); toast(Store.syncInfo().note || "Up to date with Google Drive."); return; }
  const info = await Store.reload(); setStatus(info); toast("Reloaded from the data folder.");
};
// Pick up the other devices' edits when the app comes back. Not while a dialog is open or a file is being chosen.
async function onReturn() {
  if ($("#app").hidden || ui.tab === "settings" || document.querySelector("dialog[open]")) return;
  if (Store.mode() === "drive") return phoneSync(false);
  setStatus(await Store.reload());
}
window.addEventListener("focus", onReturn);
// iPhone: switching back to the app fires visibilitychange, not always focus
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onReturn(); });
window.addEventListener("online", () => { if (Store.mode() === "drive") phoneSync(false); });

// ---- left menu: docked on wide windows (collapsible to icons), slides over on narrow ones ----
const narrow = () => window.matchMedia("(max-width: 900px)").matches;
function setMenu(open) {
  const app = $("#app");
  if (narrow()) { app.classList.toggle("sb-open", open); $("#sb-scrim").hidden = !open; }
  else { app.classList.toggle("sb-collapsed", !open); view.set("menu", open); }
}
$("#btn-menu").onclick = () => setMenu(narrow() ? !$("#app").classList.contains("sb-open") : $("#app").classList.contains("sb-collapsed"));
$("#sb-scrim").onclick = () => setMenu(false);
if (!narrow() && view.get("menu", true) === false) $("#app").classList.add("sb-collapsed");

start();

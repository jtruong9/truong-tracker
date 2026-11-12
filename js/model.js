// Pure logic: no page, no files. Loaded by the page and by the node tests (tests/model.test.js).
//
// Data is an event log. Every change is an event { id, ts, dev, type, data }:
//   "cat"      data = full category { id, section, name, order, color }
//   "cat-del"  data = { id }
//   "item"     data = full item (see normItem)
//   "item-del" data = { id }
//   "cfg"      data = { key, value }
// The state is the events replayed in time order; the latest event per thing wins.
"use strict";

const Model = (() => {
  // Gifts: one category per person, a gift per item, with its own statuses, a price and an occasion
  const SECTIONS = [{ key: "work", label: "Work" }, { key: "personal", label: "Personal" }, { key: "gifts", label: "Gifts" }];
  const STATUSES = [
    { key: "todo", label: "To do" }, { key: "doing", label: "In progress" },
    { key: "blocked", label: "Blocked" }, { key: "done", label: "Done" },
  ];
  const GIFT_STATUSES = [
    { key: "idea", label: "Idea" }, { key: "bought", label: "Bought" },
    { key: "wrapped", label: "Wrapped" }, { key: "given", label: "Given" },
  ];
  const PRIORITIES = [{ key: "high", label: "High" }, { key: "med", label: "Medium" }, { key: "low", label: "Low" }, { key: "", label: "None" }];
  // open gifts that are bought or wrapped sort ahead of ideas: they are the ones still to hand over
  const STATUS_RANK = { blocked: 0, doing: 1, todo: 2, done: 3, bought: 1, wrapped: 1, idea: 2, given: 3 };
  const PRI_RANK = { high: 0, med: 1, low: 2, "": 3 };
  const label = (list, key) => (list.find((x) => x.key === key) || { label: key }).label;
  const isGift = (secOrItem) => (typeof secOrItem === "string" ? secOrItem : secOrItem && secOrItem.section) === "gifts";
  const statusesFor = (sec) => (isGift(sec) ? GIFT_STATUSES : STATUSES);
  const statusLabel = (item) => label(statusesFor(item.section), item.status);
  const isDone = (item) => item.status === "done" || item.status === "given";
  // A status that fits the section; moving between a gift and a task keeps "finished" finished
  function fitStatus(status, sec) {
    const keys = statusesFor(sec).map((s) => s.key);
    if (keys.includes(status)) return status;
    if (status === "done" || status === "given") return isGift(sec) ? "given" : "done";
    return keys[0];
  }
  const SPENT = new Set(["bought", "wrapped", "given"]);
  // Category colors: ten presets that read on white, picked in the category dialog; "" = no color (gray)
  const COLORS = [
    { key: "blue", label: "Blue", hex: "#2563EB" }, { key: "teal", label: "Teal", hex: "#0D9488" },
    { key: "green", label: "Green", hex: "#16A34A" }, { key: "lime", label: "Olive", hex: "#65A30D" },
    { key: "amber", label: "Amber", hex: "#D97706" }, { key: "orange", label: "Orange", hex: "#EA580C" },
    { key: "red", label: "Red", hex: "#DC2626" }, { key: "pink", label: "Pink", hex: "#DB2777" },
    { key: "purple", label: "Purple", hex: "#7C3AED" }, { key: "slate", label: "Slate", hex: "#475569" },
  ];
  const color = (key) => (COLORS.some((c) => c.key === key) ? key : "");
  const colorHex = (key) => (COLORS.find((c) => c.key === key) || { hex: "" }).hex;

  // An edit and a delete of the same thing share a key, so whichever is later wins
  function keyOf(e) {
    const d = e.data || {};
    if (e.type === "cat" || e.type === "cat-del") return "cat:" + d.id;
    if (e.type === "item" || e.type === "item-del") return "item:" + d.id;
    if (e.type === "cfg") return "cfg:" + d.key;
    return "?:" + e.id;
  }
  const byTime = (a, b) => (a.ts === b.ts ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.ts - b.ts);

  const section = (s) => (SECTIONS.some((x) => x.key === s) ? s : "work");
  const isoDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "");
  // Price in dollars: a number or a typed "$1,234.50"; "" / bad = null (not set)
  function money(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function normCat(d) {
    return { id: String(d.id), section: section(d.section), name: String(d.name || "").trim() || "(no name)", order: Number(d.order) || 0, color: color(d.color) };
  }

  function normItem(d) {
    const sec = section(d.section);
    return {
      id: String(d.id),
      section: sec,
      categoryId: String(d.categoryId || ""),
      title: String(d.title || "").trim() || "(no title)",
      status: fitStatus(d.status, sec),
      priority: d.priority in PRI_RANK ? d.priority : "",
      price: money(d.price),
      occasion: String(d.occasion || "").trim().slice(0, 60),
      due: isoDate(d.due),
      notes: String(d.notes || ""),
      links: (Array.isArray(d.links) ? d.links : [])
        .filter((l) => l && safeUrl(l.url))
        .map((l) => ({ label: String(l.label || "").trim(), url: safeUrl(l.url) })),
      checklist: (Array.isArray(d.checklist) ? d.checklist : [])
        .filter((c) => c && String(c.text || "").trim())
        .map((c) => ({ text: String(c.text).trim(), done: !!c.done })),
      created: Number(d.created) || 0,
      updated: Number(d.updated) || 0,
      doneAt: Number(d.doneAt) || 0,
    };
  }

  function replay(events) {
    const cats = new Map(), items = new Map(), cfg = {};
    for (const e of [...events].sort(byTime)) {
      const d = e.data || {};
      if (e.type === "cat") cats.set(String(d.id), normCat(d));
      else if (e.type === "cat-del") cats.delete(String(d.id));
      else if (e.type === "item") items.set(String(d.id), normItem(d));
      else if (e.type === "item-del") items.delete(String(d.id));
      else if (e.type === "cfg") cfg[d.key] = d.value;
    }
    return { cats, items, cfg };
  }

  // Keep only the latest of THIS device's events per thing. An older one can never win again (the latest event per thing
  // wins, and we keep our latest), so the merged state is unchanged and this computer's file stops growing.
  function compact(events) {
    const last = new Map();
    for (const e of events) {
      const k = keyOf(e), p = last.get(k);
      if (!p || byTime(p, e) < 0) last.set(k, e);
    }
    return [...last.values()].sort(byTime);
  }

  // Links: only web addresses, so a typed "javascript:" can never run
  function safeUrl(u) {
    const s = String(u || "").trim();
    if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
    if (/^www\.[^\s]+$/i.test(s)) return "https://" + s;
    return "";
  }

  // ---- dates (local calendar days as "YYYY-MM-DD") ----
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  function addDays(iso, n) {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // "overdue" | "today" | "soon" (next 7 days) | "later" | "none" (no date, or done)
  function dueState(item, today) {
    if (!item.due || isDone(item)) return "none";
    if (item.due < today) return "overdue";
    if (item.due === today) return "today";
    if (item.due <= addDays(today, 7)) return "soon";
    return "later";
  }

  const progress = (item) => ({ done: item.checklist.filter((c) => c.done).length, total: item.checklist.length });

  // Open items first (blocked, in progress, to do), then by priority, due date (none last) and title
  function sortItems(list) {
    return [...list].sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      PRI_RANK[a.priority] - PRI_RANK[b.priority] ||
      (a.due || "9999") .localeCompare(b.due || "9999") ||
      a.title.localeCompare(b.title));
  }
  const byDue = (list) => [...list].sort((a, b) => a.due.localeCompare(b.due) || PRI_RANK[a.priority] - PRI_RANK[b.priority] || a.title.localeCompare(b.title));

  // byStatus counts every status (gifts: idea / bought / wrapped / given); spent = the price of every bought, wrapped
  // or given gift
  function stats(items, today) {
    const s = { total: items.length, done: 0, open: 0, blocked: 0, overdue: 0, spent: 0, byStatus: {} };
    for (const i of items) {
      if (isDone(i)) s.done++; else s.open++;
      if (i.status === "blocked") s.blocked++;
      if (dueState(i, today) === "overdue") s.overdue++;
      s.byStatus[i.status] = (s.byStatus[i.status] || 0) + 1;
      if (isGift(i) && SPENT.has(i.status) && i.price) s.spent = Math.round((s.spent + i.price) * 100) / 100;
    }
    return s;
  }

  // The Today page. Every open item lands in at most one group: a date group if it is due within 7 days (or late),
  // otherwise Blocked or In progress. Gifts have neither of those statuses, so a gift shows only when due within
  // 7 days or late. `sec` = "work" | "personal" | "gifts" | "" (all).
  function focus(items, today, sec) {
    const g = { overdue: [], today: [], soon: [], blocked: [], doing: [] };
    for (const i of items) {
      if (isDone(i) || (sec && i.section !== sec)) continue;
      const d = dueState(i, today);
      if (d === "overdue" || d === "today" || d === "soon") g[d].push(i);
      else if (i.status === "blocked") g.blocked.push(i);
      else if (i.status === "doing") g.doing.push(i);
    }
    return { overdue: byDue(g.overdue), today: sortItems(g.today), soon: byDue(g.soon), blocked: sortItems(g.blocked), doing: sortItems(g.doing) };
  }

  function matches(item, q) {
    if (!q) return true;
    const hay = [item.title, item.notes, item.occasion, ...item.checklist.map((c) => c.text), ...item.links.map((l) => l.label)].join("\n").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  // Backup / starter file: { app, version, exportedAt, categories: [...], items: [...] }
  function snapshot(state) {
    return { app: "truong-tracker", version: 1, exportedAt: new Date().toISOString(),
      categories: [...state.cats.values()], items: [...state.items.values()] };
  }
  function readSnapshot(obj) {
    if (!obj || obj.app !== "truong-tracker" || !Array.isArray(obj.categories) || !Array.isArray(obj.items)) {
      throw new Error("This isn't a tracker backup file.");
    }
    const cats = obj.categories.filter((c) => c && c.id).map(normCat);
    const ids = new Set(cats.map((c) => c.id));
    const items = obj.items.filter((i) => i && i.id).map(normItem).map((i) => {
      const c = cats.find((x) => x.id === i.categoryId);
      return c && c.section !== i.section ? normItem({ ...i, section: c.section }) : i;   // re-fit the status to the section
    });
    return { cats, items, unfiled: items.filter((i) => !ids.has(i.categoryId)).length };
  }

  // Distinct occasions on these items (case-insensitive), in the first-seen spelling, sorted
  function occasions(items) {
    const m = new Map();
    for (const i of items) if (i.occasion && !m.has(i.occasion.toLowerCase())) m.set(i.occasion.toLowerCase(), i.occasion);
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }

  return { SECTIONS, STATUSES, GIFT_STATUSES, PRIORITIES, COLORS, colorHex, label, isGift, statusesFor, statusLabel, isDone, fitStatus, money, occasions,
    keyOf, replay, compact, normItem, normCat, safeUrl,
    todayIso, addDays, dueState, progress, sortItems, stats, focus, matches, snapshot, readSnapshot };
})();

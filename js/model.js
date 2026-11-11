// Pure logic: no page, no files. Loaded by the page and by the node tests (tests/model.test.js).
//
// Data is an event log. Every change is an event { id, ts, dev, type, data }:
//   "cat"      data = full category { id, section, name, order }
//   "cat-del"  data = { id }
//   "item"     data = full item (see normItem)
//   "item-del" data = { id }
//   "cfg"      data = { key, value }
// The state is the events replayed in time order; the latest event per thing wins.
"use strict";

const Model = (() => {
  const SECTIONS = [{ key: "work", label: "Work" }, { key: "personal", label: "Personal" }];
  const STATUSES = [
    { key: "todo", label: "To do" }, { key: "doing", label: "In progress" },
    { key: "blocked", label: "Blocked" }, { key: "done", label: "Done" },
  ];
  const PRIORITIES = [{ key: "high", label: "High" }, { key: "med", label: "Medium" }, { key: "low", label: "Low" }, { key: "", label: "None" }];
  const STATUS_RANK = { blocked: 0, doing: 1, todo: 2, done: 3 };
  const PRI_RANK = { high: 0, med: 1, low: 2, "": 3 };
  const label = (list, key) => (list.find((x) => x.key === key) || { label: key }).label;

  // An edit and a delete of the same thing share a key, so whichever is later wins
  function keyOf(e) {
    const d = e.data || {};
    if (e.type === "cat" || e.type === "cat-del") return "cat:" + d.id;
    if (e.type === "item" || e.type === "item-del") return "item:" + d.id;
    if (e.type === "cfg") return "cfg:" + d.key;
    return "?:" + e.id;
  }
  const byTime = (a, b) => (a.ts === b.ts ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.ts - b.ts);

  const section = (s) => (s === "personal" ? "personal" : "work");
  const isoDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "");

  function normCat(d) {
    return { id: String(d.id), section: section(d.section), name: String(d.name || "").trim() || "(no name)", order: Number(d.order) || 0 };
  }

  function normItem(d) {
    return {
      id: String(d.id),
      section: section(d.section),
      categoryId: String(d.categoryId || ""),
      title: String(d.title || "").trim() || "(no title)",
      status: d.status in STATUS_RANK ? d.status : "todo",
      priority: d.priority in PRI_RANK ? d.priority : "",
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
    if (!item.due || item.status === "done") return "none";
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

  function stats(items, today) {
    const s = { total: items.length, done: 0, open: 0, blocked: 0, overdue: 0 };
    for (const i of items) {
      if (i.status === "done") s.done++; else s.open++;
      if (i.status === "blocked") s.blocked++;
      if (dueState(i, today) === "overdue") s.overdue++;
    }
    return s;
  }

  // The Today page. Every open item lands in at most one group: a date group if it is due within 7 days (or late),
  // otherwise Blocked or In progress. `sec` = "work" | "personal" | "" (both).
  function focus(items, today, sec) {
    const g = { overdue: [], today: [], soon: [], blocked: [], doing: [] };
    for (const i of items) {
      if (i.status === "done" || (sec && i.section !== sec)) continue;
      const d = dueState(i, today);
      if (d === "overdue" || d === "today" || d === "soon") g[d].push(i);
      else if (i.status === "blocked") g.blocked.push(i);
      else if (i.status === "doing") g.doing.push(i);
    }
    return { overdue: byDue(g.overdue), today: sortItems(g.today), soon: byDue(g.soon), blocked: sortItems(g.blocked), doing: sortItems(g.doing) };
  }

  function matches(item, q) {
    if (!q) return true;
    const hay = [item.title, item.notes, ...item.checklist.map((c) => c.text), ...item.links.map((l) => l.label)].join("\n").toLowerCase();
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
      return c ? { ...i, section: c.section } : i;
    });
    return { cats, items, unfiled: items.filter((i) => !ids.has(i.categoryId)).length };
  }

  return { SECTIONS, STATUSES, PRIORITIES, label, keyOf, replay, compact, normItem, normCat, safeUrl,
    todayIso, addDays, dueState, progress, sortItems, stats, focus, matches, snapshot, readSnapshot };
})();

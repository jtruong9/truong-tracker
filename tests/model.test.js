// Run: node tests/model.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "model.js"), "utf8") + "\nthis.Model = Model;", ctx);
const M = ctx.Model;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const ev = (id, ts, type, data, dev = "a") => ({ id, ts, dev, type, data });
// vm objects come from another realm: compare as plain JSON
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

t("replay: latest event per item wins, across devices, whatever the file order", () => {
  const events = [
    ev("2", 20, "item", { id: "i1", categoryId: "c1", title: "Second", status: "doing" }, "b"),
    ev("1", 10, "item", { id: "i1", categoryId: "c1", title: "First" }, "a"),
  ];
  assert.strictEqual(M.replay(events).items.get("i1").title, "Second");
});

t("replay: a later delete removes; a later edit after a delete brings it back", () => {
  const base = [ev("1", 10, "item", { id: "i1", title: "A" }), ev("2", 20, "item-del", { id: "i1" })];
  assert.strictEqual(M.replay(base).items.has("i1"), false);
  assert.strictEqual(M.replay([...base, ev("3", 30, "item", { id: "i1", title: "B" })]).items.get("i1").title, "B");
});

t("replay: equal timestamps break ties by event id, so every computer gets the same answer", () => {
  const a = [ev("x", 10, "cfg", { key: "k", value: 1 }), ev("y", 10, "cfg", { key: "k", value: 2 })];
  assert.strictEqual(M.replay(a).cfg.k, 2);
  assert.strictEqual(M.replay([...a].reverse()).cfg.k, 2);
});

t("normItem: bad status, priority, date and links are cleaned", () => {
  const i = M.normItem({ id: 5, title: "  x ", status: "weird", priority: "urgent", due: "11/20/2026",
    links: [{ url: "javascript:alert(1)" }, { url: "www.example.com", label: "ex" }, { url: "https://a.b/c" }],
    checklist: [{ text: "  " }, { text: "step", done: 1 }] });
  assert.strictEqual(i.id, "5"); assert.strictEqual(i.title, "x");
  assert.strictEqual(i.status, "todo"); assert.strictEqual(i.priority, ""); assert.strictEqual(i.due, "");
  eq(i.links, [{ label: "ex", url: "https://www.example.com" }, { label: "", url: "https://a.b/c" }]);
  eq(i.checklist, [{ text: "step", done: true }]);
});

t("safeUrl: only http(s) addresses", () => {
  assert.strictEqual(M.safeUrl("https://jira.example.com/browse/X-1"), "https://jira.example.com/browse/X-1");
  assert.strictEqual(M.safeUrl("javascript:alert(1)"), "");
  assert.strictEqual(M.safeUrl("data:text/html,hi"), "");
  assert.strictEqual(M.safeUrl("ftp://x"), "");
  assert.strictEqual(M.safeUrl("https://a b"), "");
});

t("compact: keeps this device's latest event per thing, and the merged state is unchanged", () => {
  const mine = [
    ev("1", 10, "item", { id: "i1", title: "A" }), ev("2", 20, "item", { id: "i1", title: "B" }),
    ev("3", 30, "item", { id: "i2", title: "C" }), ev("4", 40, "item-del", { id: "i2" }),
    ev("5", 50, "cat", { id: "c1", name: "Projects" }), ev("6", 60, "cfg", { key: "k", value: 1 }),
  ];
  const other = [ev("9", 25, "item", { id: "i1", title: "Other computer" }, "b")];
  const small = M.compact(mine);
  assert.strictEqual(small.length, 4);
  const full = M.replay([...mine, ...other]), after = M.replay([...small, ...other]);
  eq([...after.items.values()], [...full.items.values()]);
  eq([...after.cats.values()], [...full.cats.values()]);
  eq(after.cfg, full.cfg);
});

t("compact: an older event of mine never gets resurrected over the other computer's newer one", () => {
  const mine = [ev("1", 10, "item", { id: "i1", title: "Mine old" }), ev("2", 30, "item", { id: "i1", title: "Mine new" })];
  const other = [ev("9", 20, "item", { id: "i1", title: "Theirs" }, "b")];
  assert.strictEqual(M.replay([...M.compact(mine), ...other]).items.get("i1").title, "Mine new");
});

const item = (o) => M.normItem({ id: o.id || o.title, title: o.title, status: o.status || "todo", priority: o.priority || "", due: o.due || "", section: o.section || "work", categoryId: "c", checklist: o.checklist });

t("dueState: overdue / today / soon (7 days) / later / none; done items are never late", () => {
  const T = "2026-11-11";
  assert.strictEqual(M.dueState(item({ title: "a", due: "2026-11-10" }), T), "overdue");
  assert.strictEqual(M.dueState(item({ title: "a", due: T }), T), "today");
  assert.strictEqual(M.dueState(item({ title: "a", due: "2026-11-18" }), T), "soon");
  assert.strictEqual(M.dueState(item({ title: "a", due: "2026-11-19" }), T), "later");
  assert.strictEqual(M.dueState(item({ title: "a" }), T), "none");
  assert.strictEqual(M.dueState(item({ title: "a", due: "2026-11-01", status: "done" }), T), "none");
});

t("addDays: crosses months and years", () => {
  assert.strictEqual(M.addDays("2026-12-28", 7), "2027-01-04");
  assert.strictEqual(M.addDays("2028-02-27", 2), "2028-02-29");
});

t("sortItems: blocked, in progress, to do, done; then priority, due, title", () => {
  const list = [item({ title: "z done", status: "done", priority: "high" }), item({ title: "todo low", priority: "low" }),
    item({ title: "todo high late", priority: "high", due: "2026-12-01" }), item({ title: "todo high early", priority: "high", due: "2026-11-20" }),
    item({ title: "blocked", status: "blocked" }), item({ title: "doing", status: "doing" })];
  eq(M.sortItems(list).map((i) => i.title), ["blocked", "doing", "todo high early", "todo high late", "todo low", "z done"]);
});

t("focus: each open item in one group; date groups first; section filter", () => {
  const T = "2026-11-11";
  const list = [
    item({ title: "late", due: "2026-11-01" }), item({ title: "now", due: T, status: "blocked" }),
    item({ title: "week", due: "2026-11-15", status: "doing" }), item({ title: "blocked far", status: "blocked", due: "2027-01-01" }),
    item({ title: "doing", status: "doing" }), item({ title: "plain todo" }), item({ title: "done late", due: "2026-11-01", status: "done" }),
    item({ title: "home", status: "doing", section: "personal" }),
  ];
  const f = M.focus(list, T, "");
  eq({ o: f.overdue.map((i) => i.title), t: f.today.map((i) => i.title), s: f.soon.map((i) => i.title), b: f.blocked.map((i) => i.title), d: f.doing.map((i) => i.title) },
    { o: ["late"], t: ["now"], s: ["week"], b: ["blocked far"], d: ["doing", "home"] });
  eq(M.focus(list, T, "personal").doing.map((i) => i.title), ["home"]);
  eq(M.focus(list, T, "work").doing.map((i) => i.title), ["doing"]);
});

t("stats and progress", () => {
  const T = "2026-11-11";
  const s = M.stats([item({ title: "a", status: "done" }), item({ title: "b", status: "blocked", due: "2026-11-01" }), item({ title: "c" })], T);
  eq(s, { total: 3, done: 1, open: 2, blocked: 1, overdue: 1 });
  eq(M.progress(item({ title: "p", checklist: [{ text: "1", done: true }, { text: "2" }, { text: "3", done: true }] })), { done: 2, total: 3 });
});

t("matches: every word, in title, notes, steps or link names, any case", () => {
  const i = M.normItem({ id: "1", title: "Build #1 shelf", notes: "waiting on the cable order", checklist: [{ text: "Install widget A" }], links: [{ label: "Jira", url: "https://x.y" }] });
  assert.ok(M.matches(i, "shelf widget"));
  assert.ok(M.matches(i, "CABLE"));
  assert.ok(M.matches(i, "jira"));
  assert.ok(!M.matches(i, "shelf garage"));
  assert.ok(M.matches(i, ""));
});

t("snapshot / readSnapshot round trip; an item follows its category's section; bad files are refused", () => {
  const st = M.replay([
    ev("1", 1, "cat", { id: "c1", section: "personal", name: "Home", order: 1 }),
    ev("2", 2, "item", { id: "i1", categoryId: "c1", section: "work", title: "Gutters" }),
    ev("3", 3, "item", { id: "i2", categoryId: "gone", title: "Lost" }),
  ]);
  const back = M.readSnapshot(JSON.parse(JSON.stringify(M.snapshot(st))));
  assert.strictEqual(back.cats.length, 1);
  assert.strictEqual(back.items.find((i) => i.id === "i1").section, "personal");
  assert.strictEqual(back.unfiled, 1);
  assert.throws(() => M.readSnapshot({ app: "truong-finance", categories: [], items: [] }));
  assert.throws(() => M.readSnapshot(null));
});

console.log(`\n${n} tests passed`);

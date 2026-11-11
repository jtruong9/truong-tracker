// Data layer: one event log per computer, stored as JSON files in a folder the user picks (a Google Drive
// for desktop folder). Each computer writes ONLY its own tracker-<deviceId>.json, so Drive sync never makes
// conflict copies; every computer reads all tracker-*.json files and merges them (Model.replay).
// Same design as the family finances app.
"use strict";

const Store = (() => {
  const DB_NAME = "truong-tracker";
  const FILE_RE = /^tracker-[\w-]+\.json$/;
  let dir = null;            // FileSystemDirectoryHandle
  let deviceId = null;
  let myEvents = [];         // events in this computer's file
  let allEvents = [];        // merged from every file
  let state = Model.replay([]);
  const listeners = [];

  // ---- tiny IndexedDB key/value (remembers the folder and this computer's id) ----
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const t = open.result.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      };
    });
  }
  const kvGet = (k) => idb("readonly", (s) => s.get(k));
  const kvSet = (k, v) => idb("readwrite", (s) => s.put(v, k));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  async function getDeviceId() {
    let d = await kvGet("deviceId");
    if (!d) { d = uid().slice(0, 8); await kvSet("deviceId", d); }
    return d;
  }
  const myFileName = () => `tracker-${deviceId}.json`;

  async function readJson(handle) {
    const text = await (await handle.getFile()).text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.events) ? parsed.events : [];
  }

  async function writeMine() {
    myEvents = Model.compact(myEvents);
    const fh = await dir.getFileHandle(myFileName(), { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ app: "truong-tracker", version: 1, device: deviceId, events: myEvents }));
    await w.close();
  }

  function rebuild() {
    state = Model.replay(allEvents);
    listeners.forEach((fn) => fn());
  }

  async function reload() {
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && FILE_RE.test(name)) files.push([name, handle]);
    }
    const seen = new Set(), merged = [], problems = [];
    for (const [name, handle] of files) {
      try {
        for (const e of await readJson(handle)) if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
      } catch (err) {
        problems.push(`${name}: ${err.message}`);
      }
    }
    // Our own file may be mid-sync on disk: never lose events we already hold in memory
    for (const e of myEvents) if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    // Redraw only when something changed (this runs every time the window gets focus)
    const before = new Set(allEvents.map((e) => e.id));
    const changed = merged.length !== before.size || merged.some((e) => !before.has(e.id));
    allEvents = merged;
    if (changed) rebuild();
    return { files: files.map(([n]) => n), problems, changed };
  }

  async function append(events) {
    const ts = Date.now();
    const stamped = events.map((e, i) => ({ id: uid(), ts: ts + i * 0.001, dev: deviceId, ...e }));
    myEvents.push(...stamped);
    allEvents.push(...stamped);
    rebuild();
    await writeMine();
  }

  return {
    supported: () => typeof window.showDirectoryPicker === "function",
    async init() {
      deviceId = await getDeviceId();
      const saved = await kvGet("dir");
      if (!saved) return "needs-folder";
      dir = saved;
      const perm = await dir.queryPermission({ mode: "readwrite" });
      return perm === "granted" ? "ready" : "needs-permission";
    },
    async pickFolder() {
      dir = await window.showDirectoryPicker({ id: "truong-tracker", mode: "readwrite" });
      await kvSet("dir", dir);
      myEvents = [];
      return this.open();
    },
    async regrant() {
      const perm = await dir.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("Permission to the folder was not granted.");
      return this.open();
    },
    async open() {
      const mine = await dir.getFileHandle(myFileName(), { create: true });
      myEvents = await readJson(mine);
      allEvents = [];
      const info = await reload();
      rebuild();   // always draw once on open, even for an empty folder
      return info;
    },
    reload,
    folderName: () => (dir ? dir.name : ""),
    deviceId: () => deviceId,
    onChange: (fn) => listeners.push(fn),

    // ---- reads ----
    categories: () => [...state.cats.values()],
    category: (id) => state.cats.get(id),
    items: () => [...state.items.values()],
    item: (id) => state.items.get(id),
    cfg: (key, fallback) => (key in state.cfg ? state.cfg[key] : fallback),
    state: () => state,

    // ---- writes ----
    saveCategory: (c) => append([{ type: "cat", data: { ...c, id: c.id || uid() } }]),
    saveCategories: (cs) => append(cs.map((c) => ({ type: "cat", data: { ...c, id: c.id || uid() } }))),
    // Deleting a category deletes its items too (the page asks first)
    deleteCategory: (id) => append([
      ...[...state.items.values()].filter((i) => i.categoryId === id).map((i) => ({ type: "item-del", data: { id: i.id } })),
      { type: "cat-del", data: { id } },
    ]),
    saveItem: (it) => {
      const now = Date.now();
      return append([{ type: "item", data: { ...it, id: it.id || uid(), created: it.created || now, updated: now } }]);
    },
    saveItems: (list) => append(list.map((it) => ({ type: "item", data: { ...it, id: it.id || uid(), created: it.created || Date.now(), updated: Date.now() } }))),
    deleteItem: (id) => append([{ type: "item-del", data: { id } }]),
    setCfg: (key, value) => append([{ type: "cfg", data: { key, value } }]),

    // Backup file, and restoring one (or a starter file) as new events from this computer
    snapshot: () => Model.snapshot(state),
    restore: (snap) => {
      const { cats, items } = Model.readSnapshot(snap);
      return append([...cats.map((c) => ({ type: "cat", data: c })), ...items.map((i) => ({ type: "item", data: i }))]);
    },
    newId: uid,
  };
})();

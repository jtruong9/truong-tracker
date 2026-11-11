// Data layer: one event log per device, stored as JSON files in one shared folder (the "Truong Tracker Data" folder in
// Google Drive). Each device writes ONLY its own tracker-<deviceId>.json, so two devices never write the same file;
// every device reads all tracker-*.json files and merges them (Model.replay).
//
// Two ways to reach that folder:
//   "folder": a computer opens it directly (Chrome / Edge folder picker; Google Drive for desktop syncs it).
//   "drive":  a phone (or any browser without the picker) reads and writes it through the Google Drive service
//             (js/drive.js). The phone also keeps a copy of everything on the phone, so it opens and edits without
//             signal; unsaved edits wait on the phone and are written the next time it can reach Google.
"use strict";

const Store = (() => {
  const DB_NAME = "truong-tracker";
  const FILE_RE = /^tracker-[\w-]+\.json$/;
  const FOLDER_NAME = "Truong Tracker Data";
  let mode = "";             // "folder" | "drive"
  let dir = null;            // folder mode: FileSystemDirectoryHandle
  let drive = null;          // drive mode: { folderId, folderName, fileId }
  let deviceId = null;
  let myEvents = [];         // events in this device's file
  let allEvents = [];        // merged from every file
  let state = Model.replay([]);
  let dirty = false;         // drive mode: this device has edits not yet in its Drive file
  let lastSync = 0;
  let syncNote = "";
  const listeners = [];
  // Drive calls run one at a time, so two quick edits can't both create this device's file
  let chain = Promise.resolve();
  const serial = (fn) => (chain = chain.then(fn, fn));

  // ---- tiny IndexedDB key/value: the folder, the device id, and (phone) the copy kept on the phone ----
  function idb(mode_, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const t = open.result.transaction("kv", mode_);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      };
    });
  }
  const kvGet = (k) => idb("readonly", (s) => s.get(k));
  const kvSet = (k, v) => idb("readwrite", (s) => s.put(v, k));
  const kvDel = (k) => idb("readwrite", (s) => s.delete(k));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  async function getDeviceId() {
    let d = await kvGet("deviceId");
    if (!d) { d = uid().slice(0, 8); await kvSet("deviceId", d); }
    return d;
  }
  const myFileName = () => `tracker-${deviceId}.json`;
  const fileText = () => JSON.stringify({ app: "truong-tracker", version: 1, device: deviceId, events: myEvents });
  function parseEvents(text) {
    if (!String(text || "").trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.events) ? parsed.events : [];
  }

  function rebuild() {
    state = Model.replay(allEvents);
    listeners.forEach((fn) => fn());
  }
  // Merge files into memory. Our own events in memory always win over a (possibly stale) copy on disk.
  function mergeFiles(fileEvents) {
    const seen = new Set(), merged = [];
    for (const list of fileEvents) for (const e of list) if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    for (const e of myEvents) if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    const before = new Set(allEvents.map((e) => e.id));
    const changed = merged.length !== before.size || merged.some((e) => !before.has(e.id));
    allEvents = merged;
    return changed;
  }
  // Pick up this device's own file from storage (after a reinstall, or a first open on this browser)
  function adoptOwn(diskEvents) {
    const ids = new Set(myEvents.map((e) => e.id));
    for (const e of diskEvents) if (!ids.has(e.id)) myEvents.push(e);
  }

  // ------------------------------------------------------------------ folder mode (computers)
  async function folderReload() {
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && FILE_RE.test(name)) files.push([name, handle]);
    }
    const lists = [], problems = [];
    for (const [name, handle] of files) {
      try {
        const ev = parseEvents(await (await handle.getFile()).text());
        if (name === myFileName()) adoptOwn(ev);
        lists.push(ev);
      } catch (err) { problems.push(`${name}: ${err.message}`); }
    }
    const changed = mergeFiles(lists);
    if (changed) rebuild();
    lastSync = Date.now();
    return { files: files.map(([n]) => n), problems, changed };
  }
  async function folderWrite() {
    const fh = await dir.getFileHandle(myFileName(), { create: true });
    const w = await fh.createWritable();
    await w.write(fileText());
    await w.close();
  }

  // ------------------------------------------------------------------ drive mode (phones)
  const saveLocal = () => kvSet("phoneCopy", { myEvents, allEvents, dirty, lastSync, drive }).catch(() => {});
  const driveReload = () => serial(driveReloadNow);
  async function driveReloadNow() {
    const files = (await Drive.list(drive.folderId)).filter((f) => FILE_RE.test(f.name));
    const lists = [], problems = [];
    for (const f of files) {
      try {
        const ev = parseEvents(await Drive.read(f.id));
        if (f.name === myFileName()) { drive.fileId = f.id; adoptOwn(ev); }
        lists.push(ev);
      } catch (err) {
        if (err.auth) throw err;
        problems.push(`${f.name}: ${err.message}`);
      }
    }
    const changed = mergeFiles(lists);
    if (changed) rebuild();
    if (dirty) await driveWrite();
    lastSync = Date.now();
    syncNote = "";
    await saveLocal();
    return { files: files.map((f) => f.name), problems, changed };
  }
  async function driveWrite() {
    myEvents = Model.compact(myEvents);
    const text = fileText();
    if (!drive.fileId) {
      const found = await Drive.findFile(drive.folderId, myFileName());
      drive.fileId = found ? found.id : await Drive.create(drive.folderId, myFileName(), text);
      if (!found) { dirty = false; return; }
    }
    await Drive.update(drive.fileId, text);
    dirty = false;
  }
  // Try to write; on no signal or an expired sign-in, keep the edit on the phone and say so
  const driveFlush = () => serial(driveFlushNow);
  async function driveFlushNow() {
    try {
      await driveWrite();
      lastSync = Date.now(); syncNote = "";
    } catch (err) {
      syncNote = err.auth ? "Sign in to Google to save to Drive." : "Saved on this phone. It goes to Drive when you're back online.";
    }
    await saveLocal();
    listeners.forEach((fn) => fn());
  }

  async function append(events) {
    const ts = Date.now();
    const stamped = events.map((e, i) => ({ id: uid(), ts: ts + i * 0.001, dev: deviceId, ...e }));
    myEvents.push(...stamped);
    allEvents.push(...stamped);
    rebuild();
    if (mode === "folder") { myEvents = Model.compact(myEvents); await folderWrite(); }
    else { dirty = true; await saveLocal(); await driveFlush(); }
  }

  return {
    FOLDER_NAME,
    supported: () => typeof window.showDirectoryPicker === "function",
    // "ready" | "needs-permission" | "needs-folder" (computer) | "phone-ready" | "phone-signin" (phone)
    async init() {
      deviceId = await getDeviceId();
      const m = await kvGet("mode");
      if (m === "drive" || (!m && !this.supported())) {
        const copy = await kvGet("phoneCopy");
        if (copy && copy.drive) {
          ({ myEvents, allEvents, dirty, lastSync, drive } = copy);
          mode = "drive";
          state = Model.replay(allEvents);
          return "phone-ready";
        }
        return "phone-signin";
      }
      const saved = await kvGet("dir");
      if (!saved) return "needs-folder";
      dir = saved; mode = "folder";
      const perm = await dir.queryPermission({ mode: "readwrite" });
      return perm === "granted" ? "ready" : "needs-permission";
    },

    // ---- computers ----
    async pickFolder() {
      dir = await window.showDirectoryPicker({ id: "truong-tracker", mode: "readwrite" });
      await kvSet("dir", dir); await kvSet("mode", "folder");
      mode = "folder"; myEvents = [];
      return this.open();
    },
    async regrant() {
      const perm = await dir.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("Permission to the folder was not granted.");
      return this.open();
    },
    async open() {
      const mine = await dir.getFileHandle(myFileName(), { create: true });
      myEvents = parseEvents(await (await mine.getFile()).text());
      allEvents = [];
      const info = await folderReload();
      rebuild();
      return info;
    },

    // ---- phones ----
    // After Google sign-in: find the folder by name (the newest one if there are several) and load it
    async findDriveFolder() {
      const found = await Drive.findFolders(FOLDER_NAME);
      return found;
    },
    async openDrive(folder) {
      await Drive.email().catch(() => "");
      const prev = await kvGet("phoneCopy");
      if (!(prev && prev.drive && prev.drive.folderId === folder.id)) { myEvents = []; allEvents = []; dirty = false; }
      drive = { folderId: folder.id, folderName: folder.name, fileId: null };
      mode = "drive";
      await kvSet("mode", "drive");
      const info = await driveReload();
      rebuild();
      return info;
    },
    async createDriveFolder() { return Drive.createFolder(FOLDER_NAME); },
    // Drop the phone's copy and sign out (Settings). Edits not yet saved to Drive are lost, so the page asks first.
    async forgetPhone() {
      Drive.signOut();
      await kvDel("phoneCopy"); await kvDel("mode");
      myEvents = []; allEvents = []; drive = null; dirty = false; state = Model.replay([]);
    },

    async reload() {
      if (mode === "folder") return folderReload();
      try { return await driveReload(); }
      catch (err) {
        syncNote = err.auth ? "Sign in to Google to get the latest from Drive." : "No connection to Google Drive. Showing what's on this phone.";
        listeners.forEach((fn) => fn());
        return { files: [], problems: [], changed: false, offline: true, auth: !!err.auth };
      }
    },
    mode: () => mode,
    folderName: () => (mode === "folder" ? (dir ? dir.name : "") : drive ? drive.folderName : ""),
    deviceId: () => deviceId,
    onChange: (fn) => listeners.push(fn),
    syncInfo: () => ({ mode, dirty, lastSync, note: syncNote }),

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

    snapshot: () => Model.snapshot(state),
    restore: (snap) => {
      const { cats, items } = Model.readSnapshot(snap);
      return append([...cats.map((c) => ({ type: "cat", data: c })), ...items.map((i) => ({ type: "item", data: i }))]);
    },
    newId: uid,
  };
})();

// Run: node tests/offline.test.js
// Guards against the offline copy going stale: every file index.html loads must be in sw.js's
// list, with the same ?v= number, and VERSION must match.
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

const loaded = [...html.matchAll(/(?:src|href)="((?:js|css|vendor)\/[^"]+)"/g)].map((m) => "./" + m[1]);
const listed = new Set([...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]));
const missing = loaded.filter((f) => !listed.has(f));
const notOnDisk = [...listed].filter((f) => f !== "./" && !fs.existsSync(path.join(root, f.replace(/^\.\//, "").replace(/\?.*$/, ""))));
const versions = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
const swVersion = (sw.match(/const VERSION = "v(\d+)"/) || [])[1];

const problems = [];
if (missing.length) problems.push("index.html loads files that sw.js does not save for offline: " + missing.join(", "));
if (notOnDisk.length) problems.push("sw.js lists files that don't exist: " + notOnDisk.join(", "));
if (versions.size !== 1) problems.push("index.html uses more than one ?v= number: " + [...versions].join(", "));
if (swVersion !== [...versions][0]) problems.push(`sw.js VERSION (v${swVersion}) doesn't match index.html (?v=${[...versions][0]})`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`ok - offline list covers all ${loaded.length} files, version v${swVersion}`);

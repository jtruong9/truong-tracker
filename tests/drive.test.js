// Run: node tests/drive.test.js
// The pure parts of the Google Drive sign-in (no network): the sign-in address, reading Google's reply, upload body.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const ctx = { CONFIG: { googleClientId: "test.apps.googleusercontent.com" }, URLSearchParams, JSON, String, Number, Date, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "drive.js"), "utf8") + "\nthis.Drive = Drive;", ctx);
const D = ctx.Drive;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("redirectUri: the app's folder, without index.html", () => {
  assert.strictEqual(D.redirectUri({ origin: "https://jtruong9.github.io", pathname: "/truong-tracker/index.html" }), "https://jtruong9.github.io/truong-tracker/");
  assert.strictEqual(D.redirectUri({ origin: "https://jtruong9.github.io", pathname: "/truong-tracker/" }), "https://jtruong9.github.io/truong-tracker/");
});

t("authUrl: token flow, Drive scope, state; silent adds prompt=none; login hint", () => {
  const u = new URL(D.authUrl({ clientId: "abc", redirect: "https://x.io/app/", state: "s1", silent: false, hint: "" }));
  assert.strictEqual(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.strictEqual(u.searchParams.get("response_type"), "token");
  assert.strictEqual(u.searchParams.get("scope"), "https://www.googleapis.com/auth/drive");
  assert.strictEqual(u.searchParams.get("redirect_uri"), "https://x.io/app/");
  assert.strictEqual(u.searchParams.get("state"), "s1");
  assert.strictEqual(u.searchParams.get("prompt"), null);
  const s = new URL(D.authUrl({ clientId: "abc", redirect: "https://x.io/app/", state: "s2", silent: true, hint: "me@gmail.com" }));
  assert.strictEqual(s.searchParams.get("prompt"), "none");
  assert.strictEqual(s.searchParams.get("login_hint"), "me@gmail.com");
});

t("parseReturn: token, error, or not a reply", () => {
  const ok = D.parseReturn("#state=s1&access_token=ya29.x&token_type=Bearer&expires_in=3599&scope=x");
  assert.strictEqual(ok.token, "ya29.x"); assert.strictEqual(ok.expiresIn, 3599); assert.strictEqual(ok.state, "s1");
  const er = D.parseReturn("#error=interaction_required&state=s2");
  assert.strictEqual(er.error, "interaction_required"); assert.strictEqual(er.state, "s2");
  assert.strictEqual(D.parseReturn(""), null);
  assert.strictEqual(D.parseReturn("#settings"), null);
});

t("multipart: metadata part then the file, closed boundary", () => {
  const body = D.multipart({ name: "tracker-abc.json", parents: ["F1"] }, '{"events":[]}', "BND");
  assert.ok(body.startsWith("--BND\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\"name\":\"tracker-abc.json\""));
  assert.ok(body.includes('\r\n--BND\r\nContent-Type: application/json\r\n\r\n{"events":[]}\r\n--BND--'));
});

console.log(`\n${n} tests passed`);

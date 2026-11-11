// Google Drive access for phones (and any browser without the folder picker).
//
// Sign-in is a page redirect to Google and back (OAuth 2.0 for client-side web apps): Google returns a short-lived
// access token in the address after "#". No Google script is loaded and no popup is used, so it works in iPhone
// Safari. The token lasts about an hour; after that the app sends you to Google again, which comes straight back
// when you are still signed in there ("prompt=none").
//
// Scope: full Google Drive. The folder and the computers' files were made by Google Drive for desktop, not by this
// app, and Google's narrower "only files this app made" scope can't see them.
"use strict";

const Drive = (() => {
  const SCOPE = "https://www.googleapis.com/auth/drive";
  const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const K = { token: "truong-tracker.gtoken", state: "truong-tracker.gstate", before: "truong-tracker.gbefore",
    tried: "truong-tracker.gsilent", email: "truong-tracker.gemail" };
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* private window */ } },
  };
  let lastError = "";

  class AuthError extends Error { constructor(m) { super(m); this.auth = true; } }

  // ---- pure helpers (tested in tests/drive.test.js) ----
  // The address Google sends you back to: the app's folder, without "index.html"
  const redirectUri = (loc) => loc.origin + loc.pathname.replace(/index\.html$/, "");
  function authUrl({ clientId, redirect, state, silent, hint }) {
    const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "token", scope: SCOPE,
      include_granted_scopes: "true", state });
    if (silent) p.set("prompt", "none");
    if (hint) p.set("login_hint", hint);
    return AUTH + "?" + p.toString();
  }
  // "#access_token=..&expires_in=3599&state=.." or "#error=..&state=.." -> { token, expiresIn, state } | { error, state } | null
  function parseReturn(hash) {
    const h = String(hash || "").replace(/^#/, "");
    if (!/(^|&)(access_token|error)=/.test(h)) return null;
    const p = new URLSearchParams(h);
    if (p.get("error")) return { error: p.get("error"), state: p.get("state") || "" };
    return { token: p.get("access_token") || "", expiresIn: Number(p.get("expires_in")) || 3600, state: p.get("state") || "" };
  }
  function multipart(meta, text, boundary) {
    return `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  }
  const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");   // a value inside a Drive search
  const nonce = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  // ---- sign-in ----
  // Runs once at page load: a reply from Google sits in the address after "#"
  function consumeRedirect() {
    const r = parseReturn(location.hash);
    if (!r) return;
    history.replaceState(null, "", redirectUri(location) + location.search);
    const want = ls.get(K.state);
    ls.del(K.state);
    if (!want || r.state !== want) { lastError = "Google's sign-in reply didn't match this page. Please sign in again."; return; }
    if (r.error) { lastError = r.error === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in is needed (" + r.error + ")."; return; }
    ls.set(K.token, JSON.stringify({ t: r.token, exp: Date.now() + Math.max(60, r.expiresIn - 60) * 1000 }));
    ls.set(K.before, "1");
  }
  function token() {
    try { const v = JSON.parse(ls.get(K.token) || "null"); return v && v.exp > Date.now() ? v.t : ""; } catch { return ""; }
  }
  function signIn({ silent = false } = {}) {
    if (!CONFIG.googleClientId) throw new Error("Google sign-in isn't set up (no client ID in js/config.js).");
    const state = nonce();
    ls.set(K.state, state);
    if (silent) ls.set(K.tried, String(Date.now()));
    location.assign(authUrl({ clientId: CONFIG.googleClientId, redirect: redirectUri(location), state, silent, hint: ls.get(K.email) || "" }));
  }
  // Worth a quiet trip to Google: signed in before, the token ran out, online, and not tried in the last minute
  const shouldTrySilent = () => !!CONFIG.googleClientId && !token() && !!ls.get(K.before) && navigator.onLine && !lastError &&
    Date.now() - Number(ls.get(K.tried) || 0) > 60000;
  function signOut() {
    const t = token();
    [K.token, K.before, K.email].forEach(ls.del);
    if (t) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t), { method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" } }).catch(() => {});
  }

  // ---- Drive API ----
  async function api(url, opts = {}) {
    const t = token();
    if (!t) throw new AuthError("Not signed in to Google.");
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    if (r.status === 401) { ls.del(K.token); throw new AuthError("Google sign-in ran out."); }
    if (!r.ok) throw new Error(`Google Drive answered ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r;
  }
  const json = async (url, opts) => (await api(url, opts)).json();
  const search = (query, fields = "files(id,name,modifiedTime)") =>
    json(`${API}/files?` + new URLSearchParams({ q: query, fields, pageSize: "1000", spaces: "drive", orderBy: "modifiedTime desc" }));

  async function email() {
    const r = await json(`${API}/about?fields=user(emailAddress)`);
    const e = (r.user && r.user.emailAddress) || "";
    if (e) ls.set(K.email, e);
    return e;
  }
  const findFolders = async (name) => (await search(`name = '${q(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)).files || [];
  async function createFolder(name) {
    return json(`${API}/files?fields=id,name`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }) });
  }
  const list = async (folderId) => (await search(`'${q(folderId)}' in parents and trashed = false and name contains 'tracker-'`)).files || [];
  const findFile = async (folderId, name) => ((await search(`'${q(folderId)}' in parents and trashed = false and name = '${q(name)}'`)).files || [])[0] || null;
  const read = async (id) => (await api(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
  async function create(folderId, name, text) {
    const b = "tt" + nonce().replace(/-/g, "");
    const r = await json(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${b}` },
      body: multipart({ name, parents: [folderId], mimeType: "application/json" }, text, b) });
    return r.id;
  }
  const update = (id, text) => api(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, { method: "PATCH",
    headers: { "Content-Type": "application/json" }, body: text });

  return { SCOPE, redirectUri, authUrl, parseReturn, multipart, consumeRedirect, token, signIn, signOut, shouldTrySilent,
    configured: () => !!CONFIG.googleClientId, lastError: () => lastError, clearError: () => { lastError = ""; },
    savedEmail: () => ls.get(K.email) || "", email, findFolders, createFolder, list, findFile, read, create, update };
})();

if (typeof location !== "undefined" && typeof history !== "undefined") Drive.consumeRedirect();

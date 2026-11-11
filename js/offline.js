// Offline support on the page side: registers sw.js (which keeps a copy of the app files), shows an
// "Offline" badge, an "Install" button, and an "Update" bar when a new version is downloaded.
"use strict";

(() => {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https:$|^http:$/.test(location.protocol)) return;   // service workers need https or localhost

  // Reload only when switching to an update the user asked for, not on the very first install
  let updateRequested = false, reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      const offer = (worker) => {
        if (!worker || !navigator.serviceWorker.controller) return;
        $("#update-bar").hidden = false;
        $("#btn-update").onclick = () => { updateRequested = true; worker.postMessage("activate-now"); };
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w.addEventListener("statechange", () => { if (w.state === "installed") offer(w); });
      });
    } catch { /* offline copy unavailable; the app still works online */ }
  });

  const net = () => { $("#offline-badge").hidden = navigator.onLine; };
  window.addEventListener("online", net);
  window.addEventListener("offline", net);
  net();

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("#btn-install").hidden = false; });
  $("#btn-install").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("#btn-install").hidden = true; };
  window.addEventListener("appinstalled", () => { $("#btn-install").hidden = true; });
})();

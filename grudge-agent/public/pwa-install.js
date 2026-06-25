/**
 * GRUDA Agent — PWA install + standalone detection
 */
(function (global) {
  let deferredPrompt = null;

  function isStandalone() {
    return global.matchMedia("(display-mode: standalone)").matches
      || global.navigator.standalone === true
      || document.referrer.includes("android-app://");
  }

  function canInstall() {
    return !!deferredPrompt;
  }

  async function promptInstall() {
    if (!deferredPrompt) return { ok: false, reason: "unavailable" };
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    updateInstallUI();
    return { ok: choice.outcome === "accepted", outcome: choice.outcome };
  }

  function updateInstallUI() {
    const show = !isStandalone() && canInstall();
    document.querySelectorAll("[data-pwa-install]").forEach((el) => {
      el.style.display = show ? "" : "none";
      el.disabled = !canInstall();
    });
    document.querySelectorAll("[data-pwa-installed]").forEach((el) => {
      el.style.display = isStandalone() ? "" : "none";
    });
  }

  async function registerSw() {
    if (!("serviceWorker" in navigator)) return false;
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      return true;
    } catch (e) {
      console.warn("[pwa] SW register failed", e);
      return false;
    }
  }

  global.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallUI();
  });

  global.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    updateInstallUI();
    try { global.GrudaAppData?.setMeta?.("pwaInstalledAt", Date.now()); } catch {}
  });

  const GrudaPwa = {
    isStandalone,
    canInstall,
    promptInstall,
    updateInstallUI,
    registerSw,
  };

  global.GrudaPwa = GrudaPwa;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      registerSw();
      updateInstallUI();
    });
  } else {
    registerSw();
    updateInstallUI();
  }
})(typeof window !== "undefined" ? window : globalThis);
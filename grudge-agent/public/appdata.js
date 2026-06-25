/**
 * GRUDA Agent — storage paths UI + workspace export/import
 */
(function (global) {
  let cachedPaths = null;

  async function fetchPaths() {
    if (cachedPaths) return cachedPaths;
    try {
      cachedPaths = await fetch("/api/app/paths").then((r) => r.json());
    } catch {
      cachedPaths = { mode: "web", web: { engine: "IndexedDB", db: "gruda-agent-local" } };
    }
    return cachedPaths;
  }

  function formatPathsHtml(paths) {
    if (!paths) return "<span style='color:var(--muted)'>Loading…</span>";
    if (paths.mode === "serverless" || paths.ephemeral) {
      return `<div class="path-row"><span class="path-label">Web (primary)</span><code>IndexedDB → ${paths.web?.db || "gruda-agent-local"}</code></div>
        <div class="path-row"><span class="path-label">Server (ephemeral)</span><code>${esc(paths.dataDir || "/tmp")}</code></div>
        <div class="path-hint">Install the web app or run desktop GRUDA Agent for durable file storage.</div>`;
    }
    return `<div class="path-row"><span class="path-label">Config & insights</span><code>${esc(paths.dataDir)}</code></div>
      <div class="path-row"><span class="path-label">Projects</span><code>${esc(paths.projectsDir)}</code></div>
      ${paths.windows ? `<div class="path-row"><span class="path-label">Windows AppData</span><code>${esc(paths.windows.appData)}\\GrudgeStudio\\gruda-agent</code></div>` : ""}
      <div class="path-row"><span class="path-label">Browser mirror</span><code>IndexedDB → ${paths.web?.db || "gruda-agent-local"}</code></div>`;
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function refreshPathsUI(elId) {
    const el = document.getElementById(elId || "appdata-paths");
    if (!el) return;
    const paths = await fetchPaths();
    el.innerHTML = formatPathsHtml(paths);
  }

  async function exportWorkspace() {
    const store = global.GrudaLocalStore;
    if (!store?.available()) throw new Error("IndexedDB unavailable");
    const blob = await store.exportAll();
    const name = `gruda-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    return name;
  }

  async function importWorkspace(file) {
    const store = global.GrudaLocalStore;
    if (!store?.available()) throw new Error("IndexedDB unavailable");
    const text = await file.text();
    const blob = JSON.parse(text);
    await store.importAll(blob);
    return blob;
  }

  async function setMeta(key, value) {
    const store = global.GrudaLocalStore;
    if (store?.setMeta) await store.setMeta(key, value);
  }

  const GrudaAppData = {
    fetchPaths,
    refreshPathsUI,
    exportWorkspace,
    importWorkspace,
    setMeta,
  };

  global.GrudaAppData = GrudaAppData;
})(typeof window !== "undefined" ? window : globalThis);
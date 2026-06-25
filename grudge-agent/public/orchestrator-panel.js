/**
 * GRUDA Agent — AI orchestrator UI (workers, truth, Forge, Mine-Loader, deploy).
 */
(function (global) {
  let config = null;
  let running = false;

  function el(id) { return document.getElementById(id); }

  async function loadConfig() {
    if (config) return config;
    try {
      config = await fetch("/api/orchestrator/config").then((r) => r.json());
    } catch {
      config = { workers: [], forgeTools: [], mineLoaderTools: [] };
    }
    return config;
  }

  function log(msg, cls) {
    const box = el("orch-log");
    if (!box) return;
    const line = document.createElement("div");
    line.className = "orch-line" + (cls ? " " + cls : "");
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  function renderWorkers() {
    const wrap = el("orch-workers");
    if (!wrap || !config?.workers) return;
    wrap.innerHTML = config.workers.map((w) =>
      `<span class="orch-chip" title="${esc(w.scope)}">${esc(w.name)}</span>`
    ).join("");
  }

  function renderTools() {
    const forge = el("orch-forge-tools");
    const mine = el("orch-mine-tools");
    if (forge && config?.forgeTools) {
      forge.innerHTML = config.forgeTools.map((t) =>
        `<button class="orch-tool-btn" onclick="GrudaOrchestrator.openForge('${t.url || ""}')" title="${esc(t.desc)}">${esc(t.name)}</button>`
      ).join("");
    }
    if (mine && config?.mineLoaderTools) {
      mine.innerHTML = config.mineLoaderTools.slice(0, 8).map((t) =>
        `<span class="orch-tool-chip" title="${esc(t.desc)}">${esc(t.name)}</span>`
      ).join("");
    }
  }

  async function refreshTruth() {
    const proj = global.activeProj?.name || "_default";
    try {
      const d = await fetch(`/api/truth?project=${encodeURIComponent(proj)}`).then((r) => r.json());
      const pre = el("orch-truth");
      if (pre) pre.textContent = JSON.stringify(d.truth, null, 2);
    } catch (e) {
      log("Truth load failed: " + e.message, "orch-err");
    }
  }

  async function run() {
    if (running) return;
    const goal = el("orch-goal")?.value?.trim();
    if (!goal) return;
    running = true;
    el("orch-run-btn").disabled = true;
    log("▶ " + goal, "orch-start");
    const proj = global.activeProj?.name || "_default";
    const model = global.currentModel || "";
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, project: proj, model }),
      });
      const rdr = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await rdr.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(l.slice(6));
            if (d.type === "plan") log("Plan: " + d.tasks.map((t) => t.worker).join(" → "));
            else if (d.type === "worker_start") log(`  [${d.worker}] ${d.task}`, "orch-worker");
            else if (d.type === "worker_done") log(`  ✓ ${d.worker}: ${(d.result || "").slice(0, 120)}…`);
            else if (d.type === "check") log("QA: " + (d.findings || "").slice(0, 200), "orch-qa");
            else if (d.type === "error") log("✗ " + d.message, "orch-err");
            else if (d.type === "done") { refreshTruth(); log("Done.", "orch-done"); }
          } catch {}
        }
      }
    } catch (e) {
      log("Orchestrator failed: " + e.message, "orch-err");
    }
    running = false;
    el("orch-run-btn").disabled = false;
  }

  function openForge(url) {
    const u = url || config?.forgeUrl || "https://forge.grudge-studio.com";
    window.open(u, "_blank", "noopener");
    log("Opened Forge: " + u);
  }

  async function deployLocal() {
    try {
      const a = document.createElement("a");
      a.href = "/api/deploy/local/script?platform=windows&port=3200";
      a.download = "gruda-local-deploy.bat";
      a.click();
      log("Downloaded local deploy script (Ollama auto-start + npx gruda-agent)");
    } catch (e) { log("Deploy script failed: " + e.message, "orch-err"); }
  }

  async function deployPuterWorker() {
    const slug = (el("orch-worker-slug")?.value || "gruda-api").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    try {
      const d = await fetch(`/api/deploy/puter-worker/template?slug=${encodeURIComponent(slug)}`).then((r) => r.json());
      if (typeof puter !== "undefined" && puter.workers?.create) {
        const blob = new Blob([d.code], { type: "text/javascript" });
        const file = new File([blob], "worker.js", { type: "text/javascript" });
        await puter.workers.create(slug, file);
        log(`Puter worker deployed: ${slug}.puter.site (user-pays, free)`);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([d.code], { type: "text/javascript" }));
        a.download = `${slug}-worker.js`;
        a.click();
        log("Sign in with Puter to deploy, or upload worker.js manually. Template downloaded.");
      }
    } catch (e) {
      log("Puter worker: " + e.message + " — download template and deploy from Cloud tab.", "orch-err");
    }
  }

  async function probeLlm() {
    try {
      const d = await fetch("/api/llm/probe").then((r) => r.json());
      const badge = el("orch-llm-badge");
      if (badge) {
        badge.textContent = "LLM: " + (d.fallbackChain?.join(" → ") || "none");
        badge.title = JSON.stringify(d);
      }
    } catch {}
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function init() {
    await loadConfig();
    renderWorkers();
    renderTools();
    await refreshTruth();
    await probeLlm();
  }

  global.GrudaOrchestrator = {
    init, run, openForge, deployLocal, deployPuterWorker, refreshTruth, log,
  };
})(typeof window !== "undefined" ? window : globalThis);
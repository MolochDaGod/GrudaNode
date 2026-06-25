/**
 * GRUDA Agent — VS Code-style integrated terminal (Node/npm/git/ollama allow-list).
 */
(function (global) {
  const history = [];
  let histIdx = -1;
  let cwd = "";

  function el(id) { return document.getElementById(id); }

  function appendLine(text, cls) {
    const out = el("terminal-output");
    if (!out) return;
    const line = document.createElement("div");
    line.className = "term-line" + (cls ? " " + cls : "");
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  async function exec(cmd) {
    if (!cmd.trim()) return;
    history.unshift(cmd);
    histIdx = -1;
    appendLine("$ " + cmd, "term-cmd");
    try {
      const r = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, cwd: cwd || undefined }),
      });
      const d = await r.json();
      if (d.output) appendLine(d.output, d.ok ? "term-out" : "term-err");
      if (d.error) appendLine(d.error, "term-err");
      if (!d.ok && d.code) appendLine(`exit ${d.code}`, "term-meta");
    } catch (e) {
      appendLine("Terminal error: " + e.message, "term-err");
    }
  }

  function bind() {
    const input = el("terminal-input");
    if (!input || input._bound) return;
    input._bound = true;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value;
        input.value = "";
        exec(v);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length) {
          histIdx = Math.min(histIdx + 1, history.length - 1);
          input.value = history[histIdx] || "";
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        histIdx = Math.max(histIdx - 1, -1);
        input.value = histIdx < 0 ? "" : (history[histIdx] || "");
      }
    });
  }

  function setCwd(path) {
    cwd = path || "";
    const label = el("terminal-cwd");
    if (label) label.textContent = cwd || "(project root)";
  }

  function showTab(which) {
    const term = el("ide-panel-terminal");
    const out = el("ide-panel-output");
    const btnT = el("ide-tab-terminal");
    const btnO = el("ide-tab-output");
    if (term) term.style.display = which === "terminal" ? "flex" : "none";
    if (out) out.style.display = which === "output" ? "flex" : "none";
    if (btnT) btnT.classList.toggle("active", which === "terminal");
    if (btnO) btnO.classList.toggle("active", which === "output");
    if (which === "terminal") bind();
  }

  global.GrudaTerminal = { exec, appendLine, setCwd, showTab, bind };
})(typeof window !== "undefined" ? window : globalThis);
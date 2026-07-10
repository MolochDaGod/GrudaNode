/**
 * GRUDA Legion panel — agents + health from canonical AI hub.
 * On ai.grudge-studio.com, uses same-origin /v1/* (path worker).
 */
(function (global) {
  const CANONICAL = "https://ai.grudge-studio.com";

  function hubBase() {
    const h = location.hostname;
    if (h === "ai.grudge-studio.com" || h === "legion-ai.grudge-studio.com") {
      return location.origin;
    }
    return CANONICAL;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadHealth() {
    const badge = el("legion-health-badge");
    const detail = el("legion-health-detail");
    try {
      const h = await fetch(hubBase() + "/health", { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
      const ok = h.status === "ok";
      if (badge) {
        badge.textContent = ok ? "Online" : "Degraded";
        badge.className = "int-badge " + (ok ? "on" : "");
      }
      if (detail) {
        const g = h.providers?.gemini_byok || "—";
        const w = h.providers?.workers_ai || "—";
        detail.textContent = `${h.service || "hub"} v${h.version || "?"} · Gemini ${g} · Workers AI ${w}`;
      }
      return h;
    } catch (e) {
      if (badge) {
        badge.textContent = "Offline";
        badge.className = "int-badge";
      }
      if (detail) detail.textContent = e.message || "Health check failed";
      return null;
    }
  }

  async function loadAgents() {
    const grid = el("legion-agents-grid");
    if (!grid) return;
    grid.innerHTML = '<div class="asset-loading">Loading Legion agents…</div>';
    try {
      const data = await fetch(hubBase() + "/v1/agents", { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
      const agents = data.agents || [];
      if (!agents.length) {
        grid.innerHTML = '<div class="asset-loading">No agents returned</div>';
        return;
      }
      grid.innerHTML = "";
      agents.forEach((a) => {
        const card = document.createElement("div");
        card.className = "legion-agent-card";
        card.innerHTML = `
          <div class="legion-agent-role">${esc(a.role)}</div>
          <div class="legion-agent-name">${esc(a.name)}</div>
          <div class="legion-agent-desc">${esc(a.description)}</div>
          <div class="legion-agent-meta">${esc(a.model || "default")}</div>
          <button type="button" class="asset-dl-btn" data-role="${esc(a.role)}">Chat as ${esc(a.role)}</button>`;
        card.querySelector("button").onclick = () => pickAgent(a.role, a.name);
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = `<div class="asset-loading">Failed: ${esc(e.message)}</div>`;
    }
  }

  function pickAgent(role, name) {
    const sel = el("legion-role-select");
    if (sel) {
      let opt = [...sel.options].find((o) => o.value === role);
      if (!opt) {
        opt = document.createElement("option");
        opt.value = role;
        opt.textContent = name || role;
        sel.appendChild(opt);
      }
      sel.value = role;
    }
    const log = el("legion-chat-log");
    if (log) {
      const line = document.createElement("div");
      line.className = "legion-sys";
      line.textContent = `Selected agent: ${name || role} (${role})`;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
    el("legion-chat-input")?.focus();
  }

  function appendChat(role, text, cls) {
    const log = el("legion-chat-log");
    if (!log) return;
    const row = document.createElement("div");
    row.className = "legion-msg " + (cls || "");
    row.innerHTML = `<div class="legion-msg-role">${esc(role)}</div><div class="legion-msg-body">${esc(text)}</div>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function hubKey() {
    try {
      return (
        localStorage.getItem("grudge_ai_key") ||
        localStorage.getItem("LEGION_HUB_API_KEY") ||
        sessionStorage.getItem("grudge_ai_key") ||
        ""
      );
    } catch {
      return "";
    }
  }

  async function sendChat() {
    const input = el("legion-chat-input");
    const role = el("legion-role-select")?.value || "general";
    const text = (input?.value || "").trim();
    if (!text) return;
    if (input) input.value = "";
    appendChat("you", text, "legion-user");

    const key = hubKey();
    const placeholder = document.createElement("div");
    placeholder.className = "legion-msg legion-agent";
    placeholder.innerHTML = `<div class="legion-msg-role">${esc(role)}</div><div class="legion-msg-body">…</div>`;
    el("legion-chat-log")?.appendChild(placeholder);
    const bodyEl = placeholder.querySelector(".legion-msg-body");

    // 1) Direct hub chat when user stored a fleet API key (BYOK path)
    if (key) {
      try {
        const res = await fetch(`${hubBase()}/v1/agents/${encodeURIComponent(role)}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: text }],
            model: "google/gemini-3.5-flash",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Hub ${res.status}`);
        if (bodyEl) bodyEl.textContent = data.response || data.message || JSON.stringify(data);
        return;
      } catch (e) {
        if (bodyEl) bodyEl.textContent = "";
        appendChat("error", "Hub key chat failed: " + e.message + " — falling back to server stream…", "legion-err");
      }
    }

    // 2) Agent server stream (GRUDGE_AI_KEY / Puter)
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          model: "grudge:gemini-3.5-flash",
          system: `You are the Grudge Legion agent role: ${role}. Stay in character for that specialty.`,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Chat ${res.status}${t ? ": " + t.slice(0, 160) : ""}`);
      }
      let full = "";
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
            const j = JSON.parse(l.slice(6));
            if (j.type === "token") {
              full += j.content;
              if (bodyEl) bodyEl.textContent = full;
            }
            if (j.type === "error") throw new Error(j.message || "Stream error");
          } catch (e) {
            if (e.message && !String(e.message).includes("JSON")) throw e;
          }
        }
      }
      if (!full && bodyEl) {
        bodyEl.textContent =
          "(empty — set localStorage grudge_ai_key to your Legion API key, or GRUDGE_AI_KEY on the agent server / Puter sign-in)";
      }
    } catch (e) {
      if (bodyEl) bodyEl.textContent = "";
      appendChat(
        "error",
        e.message +
          " — store key: localStorage.setItem('grudge_ai_key','…') or configure server GRUDGE_AI_KEY.",
        "legion-err",
      );
    }
  }

  function init() {
    loadHealth();
    loadAgents();
    const input = el("legion-chat-input");
    if (input && !input._legionBound) {
      input._legionBound = true;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChat();
        }
      });
    }
    el("legion-chat-send")?.addEventListener("click", sendChat);
    el("legion-refresh")?.addEventListener("click", () => {
      loadHealth();
      loadAgents();
    });
  }

  global.GrudaLegion = {
    init,
    loadHealth,
    loadAgents,
    sendChat,
    hubBase,
  };
})(typeof window !== "undefined" ? window : globalThis);

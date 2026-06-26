/**
 * Grudge AI — browser client with login-aware fallback chain.
 * Hub (server key) → Puter (signed-in) → local Ollama → server /api/chat/stream
 */
(function (global) {
  const HUB = "https://ai.grudge-studio.com";
  const PUTER_MODELS = ["gemini-2.0-flash", "gpt-4o-mini", "claude-3-5-sonnet", "deepseek-chat"];

  function isGrudgeModel(m) {
    const s = String(m || "");
    return s.startsWith("grudge:") || s.startsWith("gemini:") || s === "google/gemini-3.5-flash";
  }

  function isPuterModel(m) {
    return String(m || "").indexOf("puter:") === 0;
  }

  function isGrokModel(m) {
    const s = String(m || "");
    return s.indexOf("grok:") === 0 || s.indexOf("xai:") === 0;
  }

  function loggedIn() {
    return !!(global.GrudgeAuth?.user?.grudgeId);
  }

  async function puterStream(msgs, model, bodyEl, render) {
    if (typeof puter === "undefined" || !puter.ai) throw new Error("Puter SDK not loaded");
    const mid = isPuterModel(model) ? model.slice(6) : model;
    let full = "";
    const resp = await puter.ai.chat(msgs, { model: mid, stream: true });
    for await (const part of resp) {
      const t = (part && part.text) || "";
      if (!t) continue;
      full += t;
      if (bodyEl && render) bodyEl.innerHTML = render(full);
    }
    return full;
  }

  async function serverStream(msgs, model, bodyEl, render) {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, model }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Server chat ${res.status}${t ? ": " + t.slice(0, 120) : ""}`);
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
            if (bodyEl && render) bodyEl.innerHTML = render(full);
          }
          if (j.type === "error") throw new Error(j.message || "Stream error");
        } catch (e) {
          if (e.message && !String(e.message).includes("JSON")) throw e;
        }
      }
    }
    return full;
  }

  const GrudgeAI = {
    hubOk: false,
    serverHub: false,

    isGrudgeModel,

    async probe() {
      try {
        const h = await fetch(HUB + "/health").then((r) => r.json());
        this.hubOk = h.status === "ok";
      } catch {
        this.hubOk = false;
      }
      try {
        const health = await fetch("/api/health").then((r) => r.json());
        this.serverHub = !!health.grudgeAi;
        global._serverGrudgeAi = this.serverHub;
      } catch {
        this.serverHub = false;
      }
      return {
        hubOk: this.hubOk,
        serverHub: this.serverHub,
        loggedIn: loggedIn(),
      };
    },

    /** Green when hub is up and user is signed in (Puter) or server has hub key */
    isReady() {
      return this.hubOk && (this.serverHub || loggedIn());
    },

    statusLabel() {
      if (this.isReady()) return "Grudge AI online";
      if (!loggedIn()) return "Sign in for Grudge AI";
      if (!this.hubOk) return "Grudge hub unreachable";
      return "Grudge AI — server key pending";
    },

    async streamChat({ messages, model, bodyEl, render }) {
      const sys = global.personaSystem ? [{ role: "system", content: global.personaSystem }] : [];
      const all = sys.length ? [...sys, ...messages] : messages;
      const errs = [];
      const hubModel = isGrudgeModel(model) ? model : "grudge:auto";
      const preferHub = isGrudgeModel(model) || !model || model === "auto";

      if (preferHub || this.serverHub) {
        try {
          return await serverStream(all, hubModel, bodyEl, render);
        } catch (e) {
          errs.push("hub:" + e.message);
        }
      }

      if (loggedIn() && typeof puter !== "undefined" && puter.ai) {
        try {
          const pm = isPuterModel(model) ? model : "puter:" + PUTER_MODELS[0];
          return await puterStream(all, pm, bodyEl, render);
        } catch (e) {
          errs.push("puter:" + e.message);
        }
      }

      if (global.GrudaOllama?.available && global._clientOllama && model && !isPuterModel(model) && !isGrokModel(model) && !isGrudgeModel(model)) {
        try {
          let full = "";
          return await GrudaOllama.streamChat(all, model, (_t, acc) => {
            full = acc;
            if (bodyEl && render) bodyEl.innerHTML = render(acc);
          });
        } catch (e) {
          errs.push("ollama:" + e.message);
        }
      }

      if (isPuterModel(model) && typeof puter !== "undefined" && puter.ai) {
        try {
          return await puterStream(all, model, bodyEl, render);
        } catch (e) {
          errs.push("puter:" + e.message);
        }
      }

      try {
        return await serverStream(all, model || hubModel, bodyEl, render);
      } catch (e) {
        errs.push("server:" + e.message);
      }

      throw new Error(
        "No AI backend available. Sign in for Grudge cloud AI, or select a Puter / Grok / local model.\n" +
          errs.join("; ")
      );
    },
  };

  global.GrudgeAI = GrudgeAI;
})(typeof window !== "undefined" ? window : globalThis);
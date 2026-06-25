/**
 * GRUDA Agent — browser-side Ollama (local AI on user's machine).
 * Vercel cannot reach 127.0.0.1; this probes the user's Ollama directly.
 */
(function (global) {
  const HOSTS = ["http://127.0.0.1:11434", "http://localhost:11434"];

  const OllamaClient = {
    host: null,
    available: false,
    models: [],

    async detect() {
      for (const h of HOSTS) {
        try {
          const r = await fetch(`${h}/api/tags`, { signal: AbortSignal.timeout(2500) });
          if (r.ok) {
            this.host = h;
            this.available = true;
            const d = await r.json();
            this.models = (d.models || []).map((m) => m.name).filter(Boolean);
            return { ok: true, host: h, models: this.models };
          }
        } catch {}
      }
      this.host = null;
      this.available = false;
      this.models = [];
      return { ok: false, models: [] };
    },

    isLocalModel(name) {
      if (!name || typeof name !== "string") return false;
      if (name.indexOf("puter:") === 0) return false;
      if (name.indexOf("grok:") === 0 || name.indexOf("xai:") === 0) return false;
      if (name.indexOf("allm:") === 0) return false;
      if (name.indexOf("grudge:") === 0) return false;
      return true;
    },

    async streamChat(allMessages, model, onToken) {
      if (!this.available || !this.host) throw new Error("Ollama not available on this machine");
      const r = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: allMessages, stream: true }),
      });
      if (!r.ok) throw new Error(`Ollama chat ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line);
            if (j.message?.content) {
              full += j.message.content;
              if (onToken) onToken(j.message.content, full);
            }
          } catch {}
        }
        buf = "";
      }
      return full;
    },

    async runAgentLoop(opts) {
      const {
        messages, model, system, tools, executeTool, onEvent, maxRounds = 12,
      } = opts || {};
      if (!this.available || !this.host) throw new Error("Ollama not available");
      let loopMsgs = [{ role: "system", content: system }, ...(messages || [])];
      let full = "";

      for (let round = 0; round < maxRounds; round++) {
        const r = await fetch(`${this.host}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: loopMsgs, tools, stream: false }),
          signal: AbortSignal.timeout(120000),
        });
        if (!r.ok) throw new Error(`Ollama agent ${r.status}`);
        const data = await r.json();
        const msg = data.message || {};
        loopMsgs.push(msg);

        if (!msg.tool_calls?.length) {
          full = msg.content || "";
          if (full && onEvent) {
            for (const w of full.split(/(?<= )/)) {
              onEvent({ type: "token", content: w });
              await new Promise((res) => setTimeout(res, 6));
            }
          }
          if (onEvent) onEvent({ type: "done" });
          return full;
        }

        for (const tc of msg.tool_calls) {
          const toolName = tc.function?.name;
          let toolArgs = {};
          try {
            toolArgs = typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
          } catch {}
          if (onEvent) onEvent({ type: "tool_call", tool: toolName, args: toolArgs });
          const result = await executeTool(toolName, toolArgs);
          if (onEvent) onEvent({ type: "tool_result", tool: toolName, result });
          loopMsgs.push({ role: "tool", content: JSON.stringify(result) });
        }
      }
      throw new Error("Agent reached max rounds");
    },
  };

  global.GrudaOllama = OllamaClient;
})(typeof window !== "undefined" ? window : globalThis);
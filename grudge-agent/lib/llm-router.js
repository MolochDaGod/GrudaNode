"use strict";

/**
 * Multi-backend LLM router — Ollama (local) → Grok (xAI) → Grudge AI Hub fallback.
 * Used by orchestrator workers and debugging endpoints.
 */

function createLlmRouter(deps) {
  const {
    ollamaHost = "http://127.0.0.1:11434",
    defaultModel = "mistral:latest",
    grokBuild,
    grudgeAiHub,
    isServerless = false,
  } = deps;

  async function ollamaComplete(model, system, user, ms = 60000) {
    const r = await fetch(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || defaultModel,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    return (await r.json()).message?.content || "";
  }

  async function grokComplete(model, system, user, ms = 90000) {
    if (!grokBuild?.hasGrokApi?.()) throw new Error("grok unavailable");
    const m = String(model || "").replace(/^grok:/, "").replace(/^xai:/, "") || "grok-3-mini";
    const text = await grokBuild.completeChat({
      model: m,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      timeout: ms,
    });
    return text || "";
  }

  async function hubComplete(model, system, user, ms = 90000) {
    if (!grudgeAiHub?.hubChat) throw new Error("hub unavailable");
    const data = await grudgeAiHub.hubChat({
      model: model || "grudge:gemini-3.5-flash",
      messages: [{ role: "user", content: user }],
      systemInstruction: system,
    });
    return data.response || data.text || "";
  }

  async function complete(opts = {}) {
    const { model, system, user, timeoutMs = 60000, prefer = ["ollama", "grok", "hub"] } = opts;
    const errors = [];
    const chain = prefer.filter((p) => {
      if (p === "ollama" && isServerless) return false;
      if (p === "grok" && !grokBuild?.hasGrokApi?.()) return false;
      if (p === "hub" && !grudgeAiHub?.listHubModels?.().length) return false;
      return true;
    });

    for (const backend of chain.length ? chain : ["grok", "hub"]) {
      try {
        if (backend === "ollama") {
          const out = await ollamaComplete(model, system, user, timeoutMs);
          return { text: out, backend: "ollama", model: model || defaultModel };
        }
        if (backend === "grok") {
          const out = await grokComplete(model, system, user, timeoutMs);
          return { text: out, backend: "grok", model: model || "grok-3-mini" };
        }
        if (backend === "hub") {
          const out = await hubComplete(model, system, user, timeoutMs);
          return { text: out, backend: "grudge-ai-hub", model: model || "grudge:gemini-3.5-flash" };
        }
      } catch (e) {
        errors.push(`${backend}: ${e.message}`);
      }
    }

    throw new Error(
      `No LLM backend reachable (${errors.join("; ")}). ` +
      (isServerless
        ? "On Vercel: set XAI_API_KEY or GRUDGE_AI_KEY, or run Ollama locally in the browser."
        : "Start Ollama (ollama serve) or set XAI_API_KEY / GRUDGE_AI_KEY.")
    );
  }

  async function probe() {
    const status = { ollama: false, grok: !!grokBuild?.hasGrokApi?.(), hub: !!grudgeAiHub?.listHubModels?.().length };
    if (!isServerless) {
      try {
        const r = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(3000) });
        status.ollama = r.ok;
      } catch {}
    }
    status.embedded = status.ollama;
    status.fallbackChain = [
      ...(status.ollama ? ["ollama"] : []),
      ...(status.grok ? ["grok"] : []),
      ...(status.hub ? ["hub"] : []),
    ];
    return status;
  }

  return { complete, probe, ollamaComplete, grokComplete, hubComplete };
}

module.exports = { createLlmRouter };
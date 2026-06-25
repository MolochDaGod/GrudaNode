"use strict";

/**
 * Grudge AI Hub client — Gemini via ai.grudge-studio.com
 * Use model prefix "grudge:" or "gemini:" to route chat through the hub.
 */

const HUB_URL = (process.env.GRUDGE_AI_HUB_URL || "https://ai.grudge-studio.com").replace(/\/$/, "");
const HUB_KEY = process.env.GRUDGE_AI_KEY || process.env.LEGION_HUB_API_KEY || process.env.INTERNAL_API_KEY || "";

function isHubModel(model) {
  if (!model) return !!HUB_KEY;
  const m = String(model);
  return m.startsWith("grudge:") || m.startsWith("gemini:") || m === "google/gemini-3.5-flash";
}

function hubModelId(model) {
  if (!model || model === "grudge:auto") return "google/gemini-3.5-flash";
  return String(model).replace(/^grudge:/, "").replace(/^gemini:/, "google/");
}

async function hubChat({ messages, message, model, role = "general", systemInstruction, generationConfig, images }) {
  if (!HUB_KEY) throw new Error("GRUDGE_AI_KEY not configured — set in .env or use Puter cloud models in the browser");
  const resp = await fetch(`${HUB_URL}/v1/agents/${role}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HUB_KEY}`,
    },
    body: JSON.stringify({
      messages,
      message,
      model: hubModelId(model),
      systemInstruction,
      generationConfig,
      images,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `AI Hub ${resp.status}`);
  return data;
}

/** Stream tokens from a hub response (non-streaming upstream — chunked for SSE UX) */
async function streamHubChat(res, opts) {
  try {
    const data = await hubChat(opts);
    const text = data.response || "";
    const words = text.split(/(?<= )/);
    for (const w of words) {
      res.write(`data: ${JSON.stringify({ type: "token", content: w })}\n\n`);
      await new Promise((r) => setTimeout(r, 6));
    }
    res.write(`data: ${JSON.stringify({ type: "done", provider: data.provider, model: data.model })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
  }
  res.end();
}

function listHubModels() {
  if (!HUB_KEY) return [];
  return [
    { name: "grudge:gemini-3.5-flash", provider: "grudge-ai-hub", label: "Gemini 3.5 Flash (Grudge AI)" },
    { name: "grudge:auto", provider: "grudge-ai-hub", label: "Grudge AI Auto" },
  ];
}

module.exports = { HUB_URL, isHubModel, hubModelId, hubChat, streamHubChat, listHubModels };
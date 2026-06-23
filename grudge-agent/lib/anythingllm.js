"use strict";

const BASE_URL = (process.env.ANYTHINGLLM_BASE_URL || "http://localhost:3001/api").replace(/\/$/, "");
const API_KEY = process.env.ANYTHINGLLM_API_KEY || "";
const DEFAULT_WORKSPACE = process.env.ANYTHINGLLM_DEFAULT_WORKSPACE || "grudge-fleet";

function isAllmModel(model) {
  if (!model) return !!API_KEY;
  const m = String(model);
  return m.startsWith("allm:") || m.startsWith("anythingllm:");
}

function allmWorkspace(model) {
  const m = String(model || "");
  const slug = m.replace(/^allm:/, "").replace(/^anythingllm:/, "");
  return slug && slug !== "auto" ? slug : DEFAULT_WORKSPACE;
}

function headers(json = true) {
  const h = { Authorization: `Bearer ${API_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function request(path, init) {
  if (!API_KEY) throw new Error("ANYTHINGLLM_API_KEY is not configured");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
    signal: init?.signal || AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AnythingLLM ${path} failed (${res.status}): ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

function getConfig() {
  return {
    baseUrl: BASE_URL,
    defaultWorkspace: DEFAULT_WORKSPACE,
    configured: Boolean(API_KEY),
    uiUrl: BASE_URL.replace(/\/api$/, ""),
  };
}

async function checkStatus() {
  if (!API_KEY) {
    return { online: false, authenticated: false, workspaces: [], error: "missing_api_key" };
  }
  try {
    const auth = await request("/v1/auth", { method: "GET" });
    const list = await request("/v1/workspaces", { method: "GET" });
    return {
      online: true,
      authenticated: !!auth.authenticated,
      workspaces: (list.workspaces || []).map((w) => w.slug),
      error: null,
    };
  } catch (err) {
    return { online: false, authenticated: false, workspaces: [], error: err.message };
  }
}

function resolveWorkspace(task) {
  switch (task) {
    case "game":
    case "crafting":
      return "grudge-game-data";
    case "supabase":
    case "database":
      return "grudge-supabase";
    case "debug":
    case "api":
    case "code":
      return "grudge-backend";
    case "telegram":
    case "bot":
      return "grudachainbot";
    case "fleet":
    case "mismatch":
    case "deploy":
      return "grudge-fleet";
    default:
      return DEFAULT_WORKSPACE;
  }
}

async function workspaceChat({ workspace, message, mode = "chat", sessionId }) {
  const slug = workspace || DEFAULT_WORKSPACE;
  return request(`/v1/workspace/${slug}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, mode, sessionId }),
  });
}

async function streamAllmChat(res, opts) {
  try {
    const data = await workspaceChat(opts);
    const text = data.textResponse || data.response || "";
    const words = String(text).split(/(?<= )/);
    for (const w of words) {
      res.write(`data: ${JSON.stringify({ type: "token", content: w })}\n\n`);
      await new Promise((r) => setTimeout(r, 6));
    }
    res.write(`data: ${JSON.stringify({ type: "done", provider: "anythingllm", workspace: opts.workspace })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
  }
  res.end();
}

function listAllmModels() {
  if (!API_KEY) return [];
  return [
    { name: "allm:grudge-fleet", provider: "anythingllm", label: "Fleet RAG (mismatch)" },
    { name: "allm:grudge-backend", provider: "anythingllm", label: "Backend debug RAG" },
    { name: "allm:grudge-game-data", provider: "anythingllm", label: "Game data RAG" },
    { name: "allm:grudachainbot", provider: "anythingllm", label: "Telegram bot RAG" },
    { name: "allm:auto", provider: "anythingllm", label: "AnythingLLM auto" },
  ];
}

module.exports = {
  BASE_URL,
  API_KEY,
  isAllmModel,
  allmWorkspace,
  getConfig,
  checkStatus,
  resolveWorkspace,
  workspaceChat,
  streamAllmChat,
  listAllmModels,
};
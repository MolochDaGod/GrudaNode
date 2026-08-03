"use strict";

/**
 * Grok Build alignment for GRUDA Agent:
 * - Grudge Studio resource knowledge
 * - Skills discovery (Grok Build pattern)
 * - xAI Grok tool-calling agent loop
 * - Agentic design theory (plan → act → verify)
 */

const fs = require("fs");
const path = require("path");

const XAI_BASE = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
const XAI_KEY  = process.env.XAI_API_KEY || "";

const GROK_MODELS = [
  { id: "grok-3-mini", label: "Grok 3 Mini (fast)" },
  { id: "grok-3", label: "Grok 3 (capable)" },
  { id: "grok-2-1212", label: "Grok 2" },
];

/** Canonical Grudge Studio platform map for agent context (fleet SSOT 2026-08) */
const GRUDGE_STUDIO_RESOURCES = `
## Grudge Studio Resource Map (use when planning game/studio work)

### Identity & player SSOT
| Resource | URL | Purpose |
|----------|-----|---------|
| Grudge ID | https://id.grudge-studio.com | Login / JWT mint |
| Player API | https://grudge-api-production-0d46.up.railway.app | Characters, bag, island, wallet (Railway Postgres) |
| Health | …/api/health | Always probe before claiming API down |

### Play surfaces
| Product | URL | Notes |
|---------|-----|-------|
| Warlords MMO | https://grudgewarlords.com | Full SPA — home island, sectors, craft, combat |
| Craft suite | https://grudgewarlords.com/craft/ | WCS lineage on Warlords deploy |
| Foundry create | https://character.grudge-studio.com/foundry?era=warlords | Create-only; handoff with characterId |
| Heroes hub | https://character.grudge-studio.com/?era=warlords | 4-slot select |
| Three training port | https://grudge-three-port.vercel.app | Lightweight sector client |
| Mine-Loader (voxel) | https://mineloader.grudge-studio.com | era=voxel only — not Warlords heroes |
| Forge editor | https://forge.grudge-studio.com | Scene/map editor |
| Coder / Vibe IDE | https://coder.grudge-studio.com | Agent IDE (separate from this AI hub) |

### Definitions, assets, docs
| Resource | URL | Purpose |
|----------|-----|---------|
| ObjectStore API | https://objectstore.grudge-studio.com/api/v1 | Recipes, items, biomes JSON |
| Info docs hub | https://info.grudge-studio.com/docs | Browse catalogs + API docs |
| CDN binaries | https://assets.grudge-studio.com | GLB, icons, nature, audio (R2) |
| Icon browser | https://info.grudge-studio.com/ICON_BROWSER.html | ICON-* search |

### AI & agents
| Resource | URL | Purpose |
|----------|-----|---------|
| **This hub** | https://ai.grudge-studio.com | GRUDA Legion UI + /v1 chat gateway |
| UI origin | https://grudaagent.vercel.app | Vercel Express (XAI + hub key) |
| Agent context | GET /api/agent/context | Fleet map + skills + asset rules (this app) |
| Hub agents | GET /v1/agents | Role list (public) |
| Rapier checklist | GET /v1/rapier/checklist | Physics deploy agent context |

### Ownership law (Warlords)
- **Per character:** attributes, class skills, weapon mastery, weapon skills, profession levels, equipment
- **Account-shared:** inventory, resources, claimed camps, one home island, island cNFT
- **Game truth = Railway**; cNFT mint is non-blocking
- Source: GrudgeBuilder docs/WARLORDS_ACCOUNT_CHARACTER_SSOT.md

### Stack patterns
React + Three.js/R3F · Rapier SI physics · Express/Workers · Railway Postgres player SSOT · Cloudflare D1 index only · R2 CDN binaries · Vercel SPAs · never invent alternate CDNs.
`.trim();

/** Grok Build TUI / agent apps surface — for development assistance */
const GROK_BUILD_APPS_SOURCE = `
## Grok Build apps & agent capabilities (embed in agent tasks)

Grok Build is the interactive agent CLI/TUI used for Grudge Studio engineering. When assisting development on ai.grudge-studio.com, treat these as first-class capabilities:

### Core agent modes
| Mode | Use for |
|------|---------|
| Agent mode | Multi-step implement + tool loop |
| Plan mode | Design before large changes |
| Headless | Scripted / CI agent runs |
| Subagents | explore, plan, general-purpose, code-reviewer |
| Skills | Domain playbooks (SKILL.md) — always load matching skill first |
| Memory | Cross-session decisions (MEMORY.md / memory_search) |
| MCP | External tools (Figma, GitHub, Vercel, Railway, Cloudflare) |

### User-guide modules (Grok Build docs index)
getting-started · authentication · keyboard-shortcuts · slash-commands · configuration · theming · mcp-servers · skills · plugins · hooks · custom-models · project-rules · memory · headless-mode · agent-mode · subagents · sessions · sandbox · plan-mode · background-tasks · terminal-support · permissions-and-safety · dashboard · monitoring-usage

### Asset recognition rules (when user asks for art/models/icons)
1. Prefer **assets.grudge-studio.com** paths and ObjectStore ICON-*/ITEM-* UUIDs — never invent CDN hosts.
2. Warlords 3D: grudge6 race kits, nature packs, weapon skills from fleet CDN (skill: grudge-warlords-assets).
3. UI icons: ICON_BROWSER + craftpix / Kenney packs when skill says so.
4. Player progress never lives in D1 — D1 is asset index only.
5. For generation: Imagine / image tools only when user requests new art; otherwise reuse library.

### Agentic development loop
1. Load skill (grudge-studio → leaf skill).
2. Probe health: game API, AI hub, ObjectStore.
3. Plan if multi-file or deploy.
4. Implement focused diffs; use tools (don't claim writes without calling them).
5. Verify: health, smoke URL, syntax.
6. Document decisions in memory / gruda.md when durable.

### Connections this hub can use
- Grudge JWT or GRUDGE_AI_KEY → /v1/agents/:role/chat
- XAI_API_KEY → Grok tool-calling agent loop (Agent mode)
- ObjectStore + R2 for asset list/search
- Railway characters/account for progress-aware tasks
- Puter (browser) as free cloud model fallback when signed in
`.trim();

/** Grok Build agentic design theory — embedded in every agent system prompt */
const GROK_BUILD_AGENT_PRINCIPLES = `
## Grok Build Agentic Design Theory

1. **Skills-first**: Before improvising, check if a skill applies (/design, /implement, grudge-studio). Follow skill workflows precisely.
2. **Plan before irreversible actions**: For multi-file changes, deployments, or deletes — outline steps, then execute.
3. **Tool-call discipline**: Every stated action must correspond to a tool call. Never claim a file was written without calling write_file.
4. **Design → implement → review**: For features, prefer a short design note in gruda.md, then implement, then self-check against requirements.
5. **Resource grounding**: Prefer ObjectStore, documented APIs, and known repo owners over guessing URLs or schemas.
6. **Memory persistence**: Save decisions, stack choices, and blockers to gruda.md via update_memory.
7. **Ask one clarifying question** when the request is ambiguous and the wrong path would waste significant effort.
8. **Focused diffs**: Only change code required by the task — no drive-by refactors.
`.trim();

function isGrokModel(model) {
  if (!model || typeof model !== "string") return false;
  return model.startsWith("grok:") || model.startsWith("xai:") || /^grok-/i.test(model);
}

function grokModelId(model) {
  if (!model) return "grok-3-mini";
  if (model.startsWith("grok:")) return model.slice(5);
  if (model.startsWith("xai:")) return model.slice(4);
  return model;
}

function hasGrokApi() {
  return !!XAI_KEY;
}

function listGrokModels() {
  if (!hasGrokApi()) return [];
  return GROK_MODELS.map(m => ({
    name: `grok:${m.id}`,
    label: m.label,
    provider: "xai",
  }));
}

/** Scan skills/ for SKILL.md files (Grok Build layout) */
function loadBundledSkills(skillsRoot) {
  const skills = [];
  if (!fs.existsSync(skillsRoot)) return skills;

  function walk(dir, depth) {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === "SKILL.md") {
        try {
          const raw = fs.readFileSync(full, "utf8");
          const nameMatch = raw.match(/^---[\s\S]*?name:\s*([^\n]+)/m);
          const descMatch = raw.match(/^---[\s\S]*?description:\s*>?-?\s*([\s\S]*?)(?:\n[a-z-]+:|\n---)/m);
          const name = nameMatch ? nameMatch[1].trim() : path.basename(path.dirname(full));
          let description = descMatch ? descMatch[1].replace(/\s+/g, " ").trim() : "";
          if (!description) {
            const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
            description = body.split("\n").find(l => l.trim() && !l.startsWith("#"))?.trim() || name;
          }
          skills.push({
            id: name,
            name,
            description: description.slice(0, 400),
            path: full.replace(/\\/g, "/"),
            body: raw.replace(/^---[\s\S]*?---\s*/, "").trim().slice(0, 6000),
          });
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(skillsRoot, 0);
  return skills;
}

function buildSkillsPrompt(skills) {
  if (!skills.length) return "";
  const index = skills.map(s => `- **${s.name}**: ${s.description}`).join("\n");
  return `## Available Skills (invoke when the user's task matches)\n${index}\n\nWhen a skill applies, follow its workflow before improvising.`;
}

function augmentSystemPrompt(base, skills) {
  const parts = [
    base,
    GROK_BUILD_AGENT_PRINCIPLES,
    GRUDGE_STUDIO_RESOURCES,
    GROK_BUILD_APPS_SOURCE,
  ];
  const skillsBlock = buildSkillsPrompt(skills);
  if (skillsBlock) parts.push(skillsBlock);
  return parts.filter(Boolean).join("\n\n");
}

/** JSON payload for GET /api/agent/context — UI + external agents */
function buildAgentContext(skills = []) {
  return {
    ok: true,
    version: "1.4.0",
    product: "GRUDA Legion / Grok Build aligned",
    hub: "https://ai.grudge-studio.com",
    ui: "https://grudaagent.vercel.app",
    principles: GROK_BUILD_AGENT_PRINCIPLES,
    fleet: GRUDGE_STUDIO_RESOURCES,
    grok_build_apps: GROK_BUILD_APPS_SOURCE,
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    assets: {
      cdn: "https://assets.grudge-studio.com",
      objectStore: "https://objectstore.grudge-studio.com/api/v1",
      infoDocs: "https://info.grudge-studio.com/docs",
      iconBrowser: "https://info.grudge-studio.com/ICON_BROWSER.html",
      rules: [
        "Never invent CDN hosts — use assets.grudge-studio.com",
        "ICON-* and catalog UUIDs from ObjectStore",
        "Player SSOT is Railway not D1",
        "Warlords heroes era=warlords only on grudgewarlords.com",
      ],
    },
    connections: {
      identity: "https://id.grudge-studio.com",
      gameApi: "https://grudge-api-production-0d46.up.railway.app",
      chat: "POST /v1/agents/:role/chat (Bearer hub key or Grudge JWT)",
      models: "GET /v1/models",
      agents: "GET /v1/agents",
      health: "GET /api/health or /health",
    },
    timestamp: new Date().toISOString(),
  };
}

/** Convert Ollama-style tools to OpenAI/xAI format (same shape, pass-through) */
function toolsForXai(tools) {
  return tools.map(t => ({
    type: "function",
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

/** Single non-streaming completion (orchestrator / fallback router) */
async function completeChat({ messages, model, timeout = 90000 }) {
  if (!XAI_KEY) throw new Error("XAI_API_KEY not set");
  const modelId = grokModelId(model);
  const resp = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_KEY}`,
    },
    body: JSON.stringify({ model: modelId, messages }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Grok API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Run agentic tool loop via xAI Grok (OpenAI-compatible chat completions).
 * emit: (obj) => void — SSE events
 */
async function runGrokAgentLoop({ emit, messages, model, tools, executeTool, projectDir, system }) {
  if (!XAI_KEY) {
    emit({ type: "error", message: "XAI_API_KEY not set. Add it in Vercel env vars for cloud Agent mode, or use Chat mode with Puter models." });
    return;
  }

  const modelId = grokModelId(model);
  let loopMsgs = [{ role: "system", content: system }, ...messages];
  const toolLog = [];
  let round = 0;

  while (round < 12) {
    round++;
    let resp;
    try {
      resp = await fetch(`${XAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${XAI_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: loopMsgs,
          tools: toolsForXai(tools),
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (err) {
      emit({ type: "error", message: `Grok API unreachable: ${err.message}` });
      return;
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      emit({ type: "error", message: `Grok API ${resp.status}: ${errText.slice(0, 300)}` });
      return;
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      emit({ type: "error", message: "Empty Grok response" });
      return;
    }

    loopMsgs.push(msg);

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      const content = msg.content || "";
      const words = content.split(/(?<= )/);
      for (const w of words) {
        emit({ type: "token", content: w });
        await new Promise(r => setTimeout(r, 6));
      }
      emit({ type: "done", toolCalls: toolLog });
      return;
    }

    for (const tc of toolCalls) {
      const toolName = tc.function?.name;
      let toolArgs = {};
      try {
        toolArgs = typeof tc.function?.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : (tc.function?.arguments || {});
      } catch { toolArgs = {}; }

      emit({ type: "tool_call", tool: toolName, args: toolArgs });
      emit({ type: "tool_start", tool: toolName, args: toolArgs });
      const result = await executeTool(toolName, toolArgs, projectDir);
      toolLog.push({ tool: toolName, args: toolArgs, result });
      emit({ type: "tool_result", tool: toolName, result });
      loopMsgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  emit({ type: "error", message: "Agent reached max rounds. Break the task into smaller steps." });
}

module.exports = {
  GRUDGE_STUDIO_RESOURCES,
  GROK_BUILD_APPS_SOURCE,
  GROK_BUILD_AGENT_PRINCIPLES,
  GROK_MODELS,
  isGrokModel,
  grokModelId,
  hasGrokApi,
  listGrokModels,
  loadBundledSkills,
  buildSkillsPrompt,
  augmentSystemPrompt,
  buildAgentContext,
  runGrokAgentLoop,
  completeChat,
};
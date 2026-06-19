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

/** Canonical Grudge Studio platform map for agent context */
const GRUDGE_STUDIO_RESOURCES = `
## Grudge Studio Resource Map (use when planning game/studio work)

| Resource | URL / Owner | Purpose |
|----------|-------------|---------|
| ObjectStore API | https://models.grudge-studio.com / MolochDaGod/ObjectStore | Weapons, armor, icons, sprites — public game data |
| Character models (D1) | grudge-character-creator Worker | GLTF character pipeline |
| Backend (VPS) | 74.208.155.229 — grudge-studio-backend (Docker/Coolify) | Accounts, APIs, MySQL grudge_game |
| Grudge-Studio-Game | MolochDaGod/Grudge-Studio-Game | Engine monorepo — vfx-sandbox, game artifacts |
| grudge-builder | grudgewarlords.com owner | Islands, world map, IslandEngine |
| GSC portal | grudge-character-creator.vercel.app/game/ | Character creator SPA |
| Fleet map | fleet.grudge-studio.com | Live infra topology |
| GRUDA Agent | gruda-agent.vercel.app | This workspace |
| GrudaNode | MolochDaGod/GrudaNode | GRUDA Agent source |
| Identity | id.grudge-studio.com | Grudge ID / accounts |

Stack patterns: React + Three.js/R3F for 3D games, Express backends, Cloudflare D1/R2 for edge data, Vercel for SPAs.
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
  const parts = [base, GROK_BUILD_AGENT_PRINCIPLES, GRUDGE_STUDIO_RESOURCES];
  const skillsBlock = buildSkillsPrompt(skills);
  if (skillsBlock) parts.push(skillsBlock);
  return parts.filter(Boolean).join("\n\n");
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
  GROK_BUILD_AGENT_PRINCIPLES,
  GROK_MODELS,
  isGrokModel,
  grokModelId,
  hasGrokApi,
  listGrokModels,
  loadBundledSkills,
  buildSkillsPrompt,
  augmentSystemPrompt,
  runGrokAgentLoop,
};
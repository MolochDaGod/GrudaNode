"use strict";

const FORGE_URL = (process.env.FORGE_URL || "https://forge.grudge-studio.com").replace(/\/$/, "");
const MINE_LOADER_PATH = process.env.MINE_LOADER_PATH || "F:\\GitHub\\voxgrudge\\Mine-Loader";
const OBJECTSTORE_URL = (process.env.GRUDGE_ASSET_API || "https://api.grudge-studio.com").replace(/\/$/, "");

const WORKERS = {
  code: {
    name: "Code Worker",
    scope: "Writes/edits code, configs, scripts; uses files + shell + Node.",
    system: "You are the Code Worker. Produce correct, minimal, working code and clear file/CLI steps. Prefer ES modules, Node 18+, and VS Code-style project layout.",
    tools: ["run_command", "read_file", "write_file", "terminal"],
  },
  art3d: {
    name: "3D / Art Worker",
    scope: "three.js scenes, Rapier physics, Forge scenes, game boards, visuals.",
    system: "You are the 3D/Art Worker. Design three.js scene graphs, materials, Forge-compatible layouts and game boards as concrete JSON/specs.",
    tools: ["forge_open", "env_scene", "assets_grudge"],
  },
  lore: {
    name: "Lore Worker",
    scope: "Story, world, NPCs, D&D character writing.",
    system: "You are the Lore Worker. Write vivid, consistent lore, NPCs and D&D characters that respect established truth.",
    tools: [],
  },
  balance: {
    name: "Balance Worker",
    scope: "Game balance: stats, economy, difficulty curves.",
    system: "You are the Balance Worker. Tune stats/economy/difficulty with concrete numbers and rationale.",
    tools: ["mineloader_blocks"],
  },
  campaign: {
    name: "Campaign Worker",
    scope: "D&D campaigns: acts, encounters, maps, quests.",
    system: "You are the Campaign Worker. Design campaign acts, encounters, maps and quest chains with clear structure.",
    tools: ["mineloader_dungeon"],
  },
  forge: {
    name: "Forge Worker",
    scope: "Grudge Studio Forge (forge.grudge-studio.com) — RTS-Grudge studio editor, ObjectStore scenes.",
    system: "You are the Forge Worker. Plan scene hierarchies, asset keys, and deployment steps for forge.grudge-studio.com. Reference ObjectStore asset UUIDs and Grudge CDN paths.",
    tools: ["forge_open", "forge_scene", "assets_grudge"],
  },
  voxel: {
    name: "Voxel / Mine-Loader Worker",
    scope: "Voxelcraft pipelines: blocks, dungeons, arenas, co-op, asset onboarding.",
    system: "You are the Voxel Worker for Mine-Loader / Voxelcraft. Use block catalogs, dungeon ASCII grids, arena maps, and Grudge auth patterns from the tool catalog.",
    tools: ["mineloader_blocks", "mineloader_dungeon", "mineloader_arena", "mineloader_assets"],
  },
  deploy: {
    name: "Deploy Worker",
    scope: "Vercel, Puter free workers, local npx gruda-agent, Forge preview.",
    system: "You are the Deploy Worker. Produce step-by-step deploy plans: Puter workers (user-pays), Vercel static, local auto-start with embedded Ollama fallback.",
    tools: ["deploy_puter_worker", "deploy_local", "deploy_vercel"],
  },
  codex: {
    name: "Codex Worker",
    scope: "Architecture docs, design specs, idea→implementation plans for Codex/agentic flows.",
    system: "You are the Codex Worker. Turn ideas into structured plans: goals, files to touch, risks, test steps, and worker assignments.",
    tools: ["orchestrate", "truth_update"],
  },
  qa: {
    name: "QA / Checks",
    scope: "Validates outputs against the shared truth; flags conflicts.",
    system: "You are the QA/Checks Worker. Rigorously compare artifacts to the goal and truth; list conflicts, gaps and contradictions plainly.",
    tools: [],
  },
};

const FORGE_TOOLS = [
  { id: "forge_open", name: "Open Forge Editor", url: FORGE_URL, desc: "Live Grudge Studio Forge — RTS-Grudge scene editor" },
  { id: "forge_scene", name: "Save Environment Scene", api: "/api/env/scenes", desc: "Persist Three.js scene JSON to project .gruda/scenes" },
  { id: "forge_objectstore", name: "ObjectStore API", url: `${OBJECTSTORE_URL}/api/v1`, desc: "Asset catalog search and metadata" },
];

const MINELLOADER_TOOLS = [
  { id: "mineloader_blocks", name: "Block Catalog", path: "artifacts/voxelcraft", memory: "voxel-block-catalog.md", desc: "Offline block generator → blockCatalogMeta + DB seed + /api/blocks" },
  { id: "mineloader_dungeon", name: "Modular Dungeons", memory: "voxel-dungeons.md", desc: "DungeonSpec ASCII grid, genDungeon branch, cracked mineable tiles" },
  { id: "mineloader_arena", name: "Boss Arenas", memory: "voxel-boss-arena.md", desc: "Team-vs-boss arenas with telegraphed attacks" },
  { id: "mineloader_assets", name: "Asset Onboarding", memory: "voxel-asset-onboarding.md", desc: "optimize_models.mjs meshopt pipeline for GLB props" },
  { id: "mineloader_coop", name: "Co-op P2P", memory: "voxel-coop.md", desc: "Trystero WebRTC host-authority multiplayer" },
  { id: "mineloader_forge", name: "Forge Pause Guards", memory: "voxel-forge-pause.md", desc: "Play pause input guards + VITE_ASSET_BASE_URL routing" },
  { id: "mineloader_api", name: "API Server", path: "artifacts/api-server", desc: "Runtime spine: worlds, blocks, dungeon, jobs, Grudge auth proxy" },
  { id: "mineloader_mockup", name: "Mockup Sandbox", path: "artifacts/mockup-sandbox", desc: "UI mockup preview plugin for rapid ideation" },
  { id: "mineloader_voxelcraft", name: "Voxelcraft Client", path: "artifacts/voxelcraft", desc: "Full voxel game client — Three.js, combat, inventory" },
];

const PUTER_WORKER_TEMPLATE = `// GRUDA Agent — Puter Serverless Worker (user-pays, free deploy)
// Deploy: await puter.workers.create("gruda-{{slug}}", "worker.js")
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "gruda-agent-worker", ts: Date.now() });
    }
    if (url.pathname === "/api/echo" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      return Response.json({ echo: body, worker: "gruda-{{slug}}" });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  },
};
`;

const TERMINAL_ALLOW = [
  /^npm(\s|$)/i, /^npx(\s|$)/i, /^node(\s|$)/i, /^pnpm(\s|$)/i,
  /^git(\s|$)/i, /^python(\s|$)/i, /^py(\s|$)/i,
  /^dir(\s|$)?/i, /^ls(\s|$)?/i, /^cd(\s|$)/i, /^pwd$/i,
  /^type(\s|$)/i, /^cat(\s|$)/i, /^echo(\s|$)/i,
  /^ollama(\s|$)/i, /^curl(\s|$)/i,
];

function isTerminalAllowed(cmd) {
  const c = String(cmd || "").trim();
  if (!c || c.length > 500) return false;
  if (/[;&|`$]/.test(c)) return false;
  return TERMINAL_ALLOW.some((re) => re.test(c));
}

function listWorkers() {
  return Object.entries(WORKERS).map(([id, w]) => ({
    id, name: w.name, scope: w.scope, tools: w.tools || [],
  }));
}

function orchestratorConfig() {
  return {
    forgeUrl: FORGE_URL,
    mineLoaderPath: MINE_LOADER_PATH,
    workers: listWorkers(),
    forgeTools: FORGE_TOOLS,
    mineLoaderTools: MINELLOADER_TOOLS,
    deploy: {
      local: { cmd: "npx gruda-agent@latest --port 3200", ollamaFallback: true },
      puterWorker: { free: true, userPays: true, template: "PUTER_WORKER_TEMPLATE" },
      vercel: { url: "https://grudaagent.vercel.app" },
    },
    autoAgentSignals: [
      "create", "build", "deploy", "fix", "implement", "write", "run",
      "npm", "git", "forge", "voxel", "game", "file", "terminal", "orchestrate",
    ],
  };
}

function localDeployScript(platform = "windows", port = 3200) {
  if (platform === "win32" || platform === "windows") {
    return [
      "@echo off",
      "title GRUDA Local Deploy",
      "curl -s http://127.0.0.1:11434/api/tags >nul 2>&1",
      "if %errorlevel% neq 0 (start \"\" ollama serve & timeout /t 3 /nobreak >nul)",
      `start \"\" http://127.0.0.1:${port}`,
      `npx --yes gruda-agent@latest --port ${port} --no-open`,
    ].join("\r\n");
  }
  return [
    "#!/usr/bin/env bash",
    "set -e",
    "curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 || (ollama serve >/dev/null 2>&1 & sleep 3)",
    `(sleep 2 && xdg-open http://127.0.0.1:${port} 2>/dev/null || open http://127.0.0.1:${port} 2>/dev/null || true) &`,
    `exec npx --yes gruda-agent@latest --port ${port} --no-open`,
  ].join("\n");
}

module.exports = {
  WORKERS,
  FORGE_URL,
  MINE_LOADER_PATH,
  FORGE_TOOLS,
  MINELLOADER_TOOLS,
  PUTER_WORKER_TEMPLATE,
  TERMINAL_ALLOW,
  isTerminalAllowed,
  listWorkers,
  orchestratorConfig,
  localDeployScript,
};
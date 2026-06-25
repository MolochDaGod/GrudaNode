"use strict";

/**
 * ═══════════════════════════════════════════════════════════════
 *  GRUDA Agent — Local Agentic AI Builder
 *  Grudge Studio — RacAlvin The Pirate King
 *
 *  Features:
 *    · Streaming chat + agentic tool loop (file, web, shell)
 *    · Project memory via gruda.md (persistent across sessions)
 *    · Voice input/output via browser Web Speech API
 *    · First-run AI onboarding wizard
 *    · Treaty Chat — live community chat via Grudge Studio
 *    · Session history with splash screen recaps
 * ═══════════════════════════════════════════════════════════════
 */

const http   = require("http");
const path   = require("path");
const fs     = require("fs");
const os     = require("os");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const express   = require("express");
const WebSocket = require("ws");
const multer    = require("multer");
const grokBuild = require("./lib/grok-build");
const grudgeAiHub = require("./lib/grudgeAiHub");
const anythingllm = require("./lib/anythingllm");
const fleetMismatch = require("./lib/fleet-mismatch");
const userInsights = require("./lib/user-insights");
const treatyChat = require("./lib/treaty-chat");

const SKILLS_DIR = path.join(__dirname, "skills");
let _bundledSkills = grokBuild.loadBundledSkills(SKILLS_DIR);

/* ── Platform data dirs (Windows AppData / XDG best practices) ─ */
function defaultDataDir() {
  if (process.env.VERCEL) return path.join(os.tmpdir(), "gruda-agent");
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const plat = process.platform;
  if (plat === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "GrudgeStudio", "gruda-agent");
  }
  if (plat === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "GrudgeStudio", "gruda-agent");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "gruda-agent");
}

function defaultProjectsDir() {
  if (process.env.VERCEL) return path.join(os.tmpdir(), "gruda-projects");
  if (process.env.PROJECTS_DIR) return process.env.PROJECTS_DIR;
  const plat = process.platform;
  if (plat === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "GrudgeStudio", "gruda-agent", "projects");
  }
  if (plat === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "GrudgeStudio", "gruda-agent", "projects");
  }
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(xdg, "gruda-agent", "projects");
}

function describeStoragePaths() {
  const web = {
    engine: "IndexedDB",
    db: "gruda-agent-local",
    note: "Primary persistence on Vercel — export workspace to sync with desktop",
  };
  if (process.env.VERCEL) {
    return {
      mode: "serverless",
      dataDir: DATA_DIR,
      projectsDir: PROJECTS_DIR,
      ephemeral: true,
      web,
    };
  }
  return {
    mode: "desktop",
    platform: process.platform,
    dataDir: DATA_DIR,
    projectsDir: PROJECTS_DIR,
    configFile: CONFIG_FILE,
    insightsDir: INSIGHTS_DIR,
    windows: process.platform === "win32" ? {
      appData: process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      localAppData: process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    } : null,
    web,
  };
}

/* ── Config ──────────────────────────────────────────────────── */
const PORT           = parseInt(process.env.PORT || "3200", 10);
const OLLAMA_HOST    = process.env.OLLAMA_HOST    || "http://127.0.0.1:11434";
const DEFAULT_MODEL  = process.env.DEFAULT_MODEL  || "mistral:latest";
const PROJECTS_DIR   = defaultProjectsDir();
const BRAVE_KEY      = process.env.BRAVE_SEARCH_KEY || "";
const SPLASH_GIF_1   = process.env.SPLASH_GIF_1  || "";
const SPLASH_GIF_2   = process.env.SPLASH_GIF_2  || "";
const MASTER_NODE    = process.env.MASTER_NODE_URL || "";
const TREATY_URL     = process.env.TREATY_CHAT_URL || MASTER_NODE || "https://master.grudge-studio.com";

/* ── Grudge R2 / asset CDN ───────────────────────────────────── */
const GRUDGE_R2_CDN    = (process.env.GRUDGE_R2_CDN    || "https://assets.grudge-studio.com").replace(/\/$/, "");
const GRUDGE_ASSET_API = (process.env.GRUDGE_ASSET_API || "https://api.grudge-studio.com").replace(/\/$/, "");

/* ── Grudge identity / SSO ──────────────────────────────────── */
const GRUDGE_AUTH_URL    = (process.env.GRUDGE_AUTH_URL    || "https://id.grudge-studio.com").replace(/\/$/, "");
const GRUDGE_ACCOUNT_URL = (process.env.GRUDGE_ACCOUNT_URL || "").replace(/\/$/, "");

/* ── Music (Mureka) ──────────────────────────────────────────── */
const MUREKA_KEY     = process.env.MUREKA_API_KEY || "";
const MUREKA_MODEL   = process.env.MUREKA_MODEL   || "auto";
const MUREKA_BASE    = process.env.MUREKA_BASE    || "https://api.mureka.ai";

/* ── Voice (ElevenLabs) ──────────────────────────────────────── */
const ELEVEN_KEY     = process.env.ELEVENLABS_API_KEY || "";
const ELEVEN_VOICE   = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)
const ELEVEN_BASE    = "https://api.elevenlabs.io";

/* ── Grok / xAI (cloud agent) ─────────────────────────────────── */
const XAI_KEY = process.env.XAI_API_KEY || "";

/* ── Data dirs ────────────────────────────────────── */
const DATA_DIR     = defaultDataDir();
const CONFIG_FILE  = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const INSIGHTS_DIR = path.join(DATA_DIR, "insights");
const TREATY_DIR   = path.join(DATA_DIR, "treaty");
const GRUDGE_SOCIAL_URL = (process.env.GRUDGE_SOCIAL_URL || "https://grudge-social.puter.site").replace(/\/$/, "");
// Best-effort: serverless hosts (Vercel) only allow writes under /tmp
try { fs.mkdirSync(PROJECTS_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(DATA_DIR,     { recursive: true }); } catch {}
try { fs.mkdirSync(INSIGHTS_DIR, { recursive: true }); } catch {}
try { fs.mkdirSync(TREATY_DIR, { recursive: true }); } catch {}

/* ── Config helpers ──────────────────────────────────────────── */
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  pgUpsertConfig(cfg);            // best-effort durable mirror (Postgres)
}

/* ── History helpers ─────────────────────────────────────────── */
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
  catch { return []; }
}
function appendSession(s) {
  const h = loadHistory();
  h.push({ ...s, savedAt: new Date().toISOString() });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h.slice(-50), null, 2), "utf8");
  if (pgReady) pgPool.query(
    "INSERT INTO gruda_sessions (title, project, summary, messages) VALUES ($1,$2,$3,$4)",
    [s.title||null, s.project||null, s.summary||null, JSON.stringify(s.messages||[])]
  ).catch(()=>{});
}

/* ── User insight files (onboarding + growing session memory) ─── */
function loadInsightMap() {
  const map = {};
  for (const slug of userInsights.INSIGHT_SLUGS) {
    const fp = path.join(INSIGHTS_DIR, userInsights.slugToFile(slug));
    if (fs.existsSync(fp)) map[slug] = fs.readFileSync(fp, "utf8");
  }
  return map;
}

function saveInsightFile(slug, content) {
  fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
  const fp = path.join(INSIGHTS_DIR, userInsights.slugToFile(slug));
  fs.writeFileSync(fp, content || "", "utf8");
  pgUpsertInsight(slug, content);
  return fp;
}

function writeInsightFiles(files) {
  const written = {};
  for (const [slug, content] of Object.entries(files || {})) {
    written[slug] = saveInsightFile(slug, content);
  }
  return written;
}

async function llmInsightExtract(prompt, model) {
  if (grokBuild.hasGrokApi()) {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${XAI_KEY}` },
      body: JSON.stringify({
        model: grokBuild.isGrokModel(model) ? model.replace(/^grok:/, "") : "grok-3-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (r.ok) {
      const d = await r.json();
      const text = d.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    }
  }
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.response?.trim()) return d.response.trim();
    }
  } catch {}
  return null;
}

/* ── Persona / system prompt builder ───────────────────────────── */
// Weaves the user's chosen AI name, generated persona, custom talk commands,
// project memory, and user insight files into one system prompt.
function buildPersona(cfg, memory, systemExtra, insightMap) {
  const aiName = (cfg && cfg.aiName) || "GRUDA Agent";
  const cmds  = (cfg && Array.isArray(cfg.talkCommands)) ? cfg.talkCommands.filter(c => c && c.phrase) : [];
  const rules = (cfg && Array.isArray(cfg.rules)) ? cfg.rules.filter(Boolean) : [];
  const insights = userInsights.compileInsightsForPrompt(insightMap || loadInsightMap());
  const base = (
    `You are ${aiName}, a personal agentic AI built on GRUDA Agent by Grudge Studio (RacAlvin The Pirate King). ` +
    `You align with Grok Build patterns: skills-first workflows, plan-before-act, tool-call discipline, and gruda.md memory.\n` +
    `You may run locally via Ollama, in the cloud via Grok (xAI), or chat via Puter. Tools: search/read/write files, folders, shell (npm/node/git), unzip, convert, web search, browse URLs, music (Mureka), and update_memory.\n\n` +
    `Operating principles:\n` +
    `- If a request is ambiguous or could be done multiple meaningfully different ways, ASK ONE concise clarifying question before acting.\n` +
    `- Prefer doing over describing: when asked to build/create/deploy, use your tools.\n` +
    `- Save important context to gruda.md — long-term memory.\n` +
    `- When you learn durable facts about the user, note them for user-insights growth.\n` +
    `- Slash-style intents: /design (architecture doc), /implement (build+review), grudge-studio (platform context).\n\n` +
    ((cfg && cfg.systemPrompt) ? `## Who you're helping\n${cfg.systemPrompt}\n\n` : "") +
    (insights ? `## User Insight Files\n${insights}\n\n` : "") +
    (rules.length ? `## User rules (always follow)\n` + rules.map(r => `- ${r}`).join("\n") + `\n\n` : "") +
    (cmds.length ? `## Custom talk / vocal commands the user may type or say\n` + cmds.map(c => `- "${c.phrase}" → ${c.action || c.prompt || "custom action"}`).join("\n") + `\n\n` : "") +
    (memory ? `## Project Memory (gruda.md)\n${memory}\n\n` : "No project memory yet.\n\n") +
    (systemExtra || "") +
    `Be direct and helpful.`
  );
  return grokBuild.augmentSystemPrompt(base, _bundledSkills);
}

/* ── Express + WS ────────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PUBLIC_DIR = path.join(__dirname, "public");

const BRAND_ICON_TYPES = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendPublicAsset(res, name) {
  const file = path.join(PUBLIC_DIR, name);
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(name).toLowerCase();
  res.setHeader("Content-Type", BRAND_ICON_TYPES[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.sendFile(file);
  return true;
}

// Browsers probe /favicon.ico on every origin; always answer from brand assets.
function serveBrandIcon(req, res, next) {
  for (const name of ["favicon.ico", "gruda-king.png", "gruda-king.svg"]) {
    if (sendPublicAsset(res, name)) return;
  }
  next();
}

app.use(express.json({ limit: "10mb" }));
app.get("/favicon.ico", serveBrandIcon);
app.get("/favicon.svg", (req, res, next) => {
  if (sendPublicAsset(res, "gruda-king.svg") || sendPublicAsset(res, "favicon.ico")) return;
  next();
});
app.get("/apple-touch-icon.png", (req, res, next) => {
  if (sendPublicAsset(res, "gruda-king.png")) return;
  next();
});
app.get("/install-linux.sh", (req, res) => {
  res.type("application/x-sh");
  res.sendFile(path.join(PUBLIC_DIR, "install-linux.sh"));
});
app.get("/install-windows.bat", (req, res) => {
  res.type("application/octet-stream");
  res.sendFile(path.join(PUBLIC_DIR, "install-windows.bat"));
});
app.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json");
  res.sendFile(path.join(PUBLIC_DIR, "manifest.webmanifest"));
});
app.get("/sw.js", (req, res) => {
  res.type("application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(PUBLIC_DIR, "sw.js"));
});
app.use(express.static(PUBLIC_DIR));

/* ── Uploads (multipart) ─────────────────────────────────────── */
const UPLOAD_TMP = path.join(os.tmpdir(), "gruda-uploads");
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
const upload = multer({ dest: UPLOAD_TMP, limits: { fileSize: 100 * 1024 * 1024 } });

function broadcast(data) {
  const m = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(m); });
}

/* ── Treaty Chat relay ───────────────────────────────────────── */
let treatyWs = null;
let treatyReconnectTimer = null;

function connectTreaty() {
  if (treatyWs && treatyWs.readyState === WebSocket.OPEN) return;
  const wsUrl = TREATY_URL.replace(/^http/, "ws") + (TREATY_URL.includes("/ws") ? "" : "/ws");
  try {
    treatyWs = new WebSocket(wsUrl);
    treatyWs.on("open",    ()  => { broadcast({ type: "treaty_status", online: true }); });
    treatyWs.on("message", (d) => { broadcast({ type: "treaty_msg", data: JSON.parse(d.toString()) }); });
    treatyWs.on("close",   ()  => {
      broadcast({ type: "treaty_status", online: false });
      treatyReconnectTimer = setTimeout(connectTreaty, 8000);
    });
    treatyWs.on("error",   ()  => { /* silently retry */ });
  } catch { /* treaty is optional */ }
}

// Treaty relay needs a persistent process — skip eager connect on serverless
if (TREATY_URL && !process.env.VERCEL) setTimeout(connectTreaty, 2000);

/* ── Tool Definitions ────────────────────────────────────────── */
const TOOLS = [
  { type:"function", function:{ name:"search_files",
    description:"Search for files by name or content on the local filesystem",
    parameters:{ type:"object", properties:{
      query:     { type:"string" },
      directory: { type:"string", description:"Directory to search (default: project dir)" },
      type:      { type:"string", enum:["name","content"] }
    }, required:["query"] }
  }},
  { type:"function", function:{ name:"read_file",
    description:"Read the contents of a file",
    parameters:{ type:"object", properties:{ path:{ type:"string" } }, required:["path"] }
  }},
  { type:"function", function:{ name:"write_file",
    description:"Create or overwrite a file with the given content",
    parameters:{ type:"object", properties:{ path:{ type:"string" }, content:{ type:"string" } }, required:["path","content"] }
  }},
  { type:"function", function:{ name:"list_directory",
    description:"List files and folders in a directory",
    parameters:{ type:"object", properties:{ path:{ type:"string" } } }
  }},
  { type:"function", function:{ name:"create_folder",
    description:"Create a new folder (including any missing parents)",
    parameters:{ type:"object", properties:{ path:{ type:"string" } }, required:["path"] }
  }},
  { type:"function", function:{ name:"update_memory",
    description:"Update the project gruda.md memory file. Always use this to save important facts, decisions, and context for future sessions.",
    parameters:{ type:"object", properties:{ content:{ type:"string" }, append:{ type:"boolean" } }, required:["content"] }
  }},
  { type:"function", function:{ name:"web_search",
    description:"Search the web for current information",
    parameters:{ type:"object", properties:{ query:{ type:"string" } }, required:["query"] }
  }},
  { type:"function", function:{ name:"run_command",
    description:"Run a shell command and return output (npm, node, git, etc. — allow-listed)",
    parameters:{ type:"object", properties:{ command:{ type:"string" }, cwd:{ type:"string" } }, required:["command"] }
  }},
  { type:"function", function:{ name:"unzip",
    description:"Extract a .zip archive to a destination folder",
    parameters:{ type:"object", properties:{ path:{ type:"string" }, dest:{ type:"string" } }, required:["path"] }
  }},
  { type:"function", function:{ name:"convert_file",
    description:"Convert a file: json<->csv, any->base64, base64->text, or read as text",
    parameters:{ type:"object", properties:{ path:{ type:"string" }, to:{ type:"string", enum:["csv","json","base64","text"] }, out:{ type:"string" } }, required:["path","to"] }
  }},
  { type:"function", function:{ name:"open_url",
    description:"Fetch and read the text content of a web page (lightweight browsing)",
    parameters:{ type:"object", properties:{ url:{ type:"string" } }, required:["url"] }
  }}
];

/* ── Tool Executor ───────────────────────────────────────────── */
async function executeTool(name, args, projectDir) {
  const dir = projectDir || PROJECTS_DIR;
  try {
    switch (name) {
      case "search_files": {
        const searchDir = args.directory || dir;
        const results = [];
        const walk = (d, depth=0) => {
          if (depth > 6 || results.length >= 100) return;
          let entries; try { entries = fs.readdirSync(d, { withFileTypes:true }); } catch { return; }
          for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") { walk(full, depth+1); }
            else if (e.isFile()) {
              if (args.type === "content") {
                try { if (fs.readFileSync(full,"utf8").toLowerCase().includes(args.query.toLowerCase())) results.push(full); } catch {}
              } else {
                if (e.name.toLowerCase().includes(args.query.toLowerCase())) results.push(full);
              }
            }
          }
        };
        walk(searchDir);
        return { found: results.length, files: results };
      }
      case "read_file": {
        if (!fs.existsSync(args.path)) return { error: `Not found: ${args.path}` };
        const content = fs.readFileSync(args.path, "utf8");
        return { path: args.path, content, lines: content.split("\n").length };
      }
      case "write_file": {
        fs.mkdirSync(path.dirname(args.path), { recursive: true });
        fs.writeFileSync(args.path, args.content, "utf8");
        return { ok: true, path: args.path, bytes: Buffer.byteLength(args.content) };
      }
      case "list_directory": {
        const target = args.path || dir;
        if (!fs.existsSync(target)) return { error: `Not found: ${target}` };
        return { path: target, entries: fs.readdirSync(target, { withFileTypes:true }).map(e => ({
          name: e.name, type: e.isDirectory() ? "folder" : "file",
          ...(e.isFile() ? { size: fs.statSync(path.join(target,e.name)).size } : {})
        }))};
      }
      case "create_folder": {
        fs.mkdirSync(args.path, { recursive: true });
        return { ok: true, path: args.path };
      }
      case "update_memory": {
        const memPath = path.join(dir, "gruda.md");
        let content = args.content;
        if (args.append && fs.existsSync(memPath)) {
          content = fs.readFileSync(memPath, "utf8") + "\n\n---\n\n" + args.content;
        }
        fs.writeFileSync(memPath, content, "utf8");
        return { ok: true, path: memPath };
      }
      case "web_search": {
        if (BRAVE_KEY) {
          const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}&count=5`, {
            headers:{ "Accept":"application/json","X-Subscription-Token":BRAVE_KEY }, signal:AbortSignal.timeout(8000)
          });
          const d = await r.json();
          return { query:args.query, results:(d.web?.results||[]).slice(0,5).map(x=>({title:x.title,url:x.url,snippet:x.description})) };
        } else {
          const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`, { signal:AbortSignal.timeout(8000) });
          const d = await r.json();
          const results = [];
          if (d.AbstractText) results.push({ title:d.Heading, snippet:d.AbstractText, url:d.AbstractURL });
          for (const t of (d.RelatedTopics||[]).slice(0,4)) if (t.Text) results.push({ title:t.Text.split(" - ")[0], snippet:t.Text, url:t.FirstURL });
          return { query:args.query, results, note:"Add BRAVE_SEARCH_KEY in .env for richer results" };
        }
      }
      case "run_command": {
        const cwd = args.cwd || dir;
        const out = execSync(args.command, { cwd, timeout:30000, encoding:"utf8", stdio:"pipe" });
        return { ok:true, output: out.slice(0,8000) };
      }
      case "unzip": {
        const AdmZip = require("adm-zip");
        if (!fs.existsSync(args.path)) return { error: `Not found: ${args.path}` };
        const dest = args.dest || path.join(path.dirname(args.path), path.basename(args.path, path.extname(args.path)));
        fs.mkdirSync(dest, { recursive: true });
        new AdmZip(args.path).extractAllTo(dest, true);
        return { ok:true, dest, files: fs.readdirSync(dest).slice(0, 200) };
      }
      case "convert_file": {
        if (!fs.existsSync(args.path)) return { error: `Not found: ${args.path}` };
        const raw = fs.readFileSync(args.path);
        const ext = path.extname(args.path).toLowerCase();
        const outPath = args.out || (args.path + "." + args.to);
        let outData;
        if (args.to === "base64")      outData = raw.toString("base64");
        else if (args.to === "text")   outData = raw.toString("utf8");
        else if (args.to === "json" && ext === ".csv") {
          const [head, ...rows] = raw.toString("utf8").split(/\r?\n/).filter(Boolean);
          const cols = head.split(",");
          outData = JSON.stringify(rows.map(r => { const v = r.split(","); return Object.fromEntries(cols.map((c,i)=>[c, v[i]])); }), null, 2);
        }
        else if (args.to === "csv" && ext === ".json") {
          const arr = JSON.parse(raw.toString("utf8"));
          const cols = Object.keys(arr[0] || {});
          outData = [cols.join(","), ...arr.map(o => cols.map(c => o[c]).join(","))].join("\n");
        }
        else outData = raw.toString("utf8");
        fs.writeFileSync(outPath, outData, "utf8");
        return { ok:true, out: outPath, bytes: Buffer.byteLength(outData) };
      }
      case "open_url": {
        const r = await fetch(args.url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "gruda-agent" } });
        const text = (await r.text())
          .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return { ok:r.ok, status:r.status, url:args.url, text: text.slice(0, 6000) };
      }
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch(err) { return { error: err.message }; }
}

/* ── Agent SSE stream (Ollama local · Grok cloud) ───────────── */
app.post("/api/agent/stream", async (req, res) => {
  const { messages, model, projectDir, systemExtra } = req.body;
  if (!messages) return res.status(400).json({ error:"messages required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const pDir = projectDir || PROJECTS_DIR;
  const memPath = path.join(pDir, "gruda.md");
  const memory  = fs.existsSync(memPath) ? fs.readFileSync(memPath, "utf8") : "";
  const cfg     = loadConfig();
  const system  = buildPersona(cfg, memory, systemExtra);

  const useGrok = grokBuild.isGrokModel(model) || (!model && grokBuild.hasGrokApi()) ||
    (process.env.VERCEL && grokBuild.hasGrokApi() && !String(model || "").startsWith("puter:"));
  const grokModel = grokBuild.isGrokModel(model) ? model : (grokBuild.hasGrokApi() ? "grok:grok-3-mini" : null);

  if (useGrok && grokBuild.hasGrokApi()) {
    await grokBuild.runGrokAgentLoop({
      emit, messages, model: grokModel, tools: TOOLS,
      executeTool, projectDir: pDir, system,
    });
    return res.end();
  }

  const ollamaModel = model || DEFAULT_MODEL;
  if (String(ollamaModel).startsWith("puter:")) {
    emit({ type:"error", message:"Agent mode needs Ollama (local) or Grok (set XAI_API_KEY on Vercel). Use Chat mode with Puter models for conversational replies." });
    return res.end();
  }

  let loopMsgs = [{ role:"system", content:system }, ...messages];
  const toolLog = [];
  let round = 0;

  while (round < 12) {
    round++;
    let ollamaRes;
    try {
      ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:ollamaModel, messages:loopMsgs, tools:TOOLS, stream:false }),
        signal: AbortSignal.timeout(120000),
      });
    } catch(err) {
      const hint = grokBuild.hasGrokApi()
        ? "Ollama unreachable. Select a Grok model for cloud agent mode."
        : "Ollama unreachable. Run locally or set XAI_API_KEY for Grok agent on Vercel.";
      emit({ type:"error", message:`${hint} (${err.message})` });
      return res.end();
    }

    if (!ollamaRes.ok) { emit({ type:"error", message:`Ollama ${ollamaRes.status}` }); return res.end(); }

    const data = await ollamaRes.json();
    const msg  = data.message;
    loopMsgs.push(msg);

    if (!msg.tool_calls || !msg.tool_calls.length) {
      const words = (msg.content || "").split(/(?<= )/);
      for (const w of words) { emit({ type:"token", content:w }); await new Promise(r=>setTimeout(r,8)); }
      emit({ type:"done", toolCalls:toolLog });
      return res.end();
    }

    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name;
      const toolArgs = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.function.arguments||{});
      emit({ type:"tool_call", tool:toolName, args:toolArgs });
      emit({ type:"tool_start", tool:toolName, args:toolArgs });
      const result = await executeTool(toolName, toolArgs, pDir);
      toolLog.push({ tool:toolName, args:toolArgs, result });
      emit({ type:"tool_result", tool:toolName, result });
      loopMsgs.push({ role:"tool", content:JSON.stringify(result) });
    }
  }
  emit({ type:"error", message:"Agent reached max rounds. Break the task into smaller steps." });
  res.end();
});

app.get("/api/agent/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

// Single tool execution — used by browser-side Ollama agent loop on Vercel/cloud
app.post("/api/agent/tool", async (req, res) => {
  const { tool, args, projectDir, projectName } = req.body || {};
  if (!tool) return res.status(400).json({ error: "tool required" });
  const pDir = projectDir || (projectName ? path.join(PROJECTS_DIR, projectName) : PROJECTS_DIR);
  try {
    const result = await executeTool(tool, args || {}, pDir);
    res.json({ ok: true, tool, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Chat stream (no tools) ──────────────────────────────────── */
app.post("/api/chat/stream", async (req, res) => {
  const { messages, model, system } = req.body;
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  const cfg = loadConfig();
  const sysContent = system || buildPersona(cfg, "", "");
  const allMsgs = sysContent ? [{ role:"system", content:sysContent }, ...messages] : messages;

  if (grudgeAiHub.isHubModel(model)) {
    return grudgeAiHub.streamHubChat(res, {
      messages: allMsgs,
      model,
      role: "general",
      generationConfig: { maxOutputTokens: 2048 },
    });
  }

  if (anythingllm.isAllmModel(model)) {
    const lastUser = [...allMsgs].reverse().find(m => m.role === "user");
    let msg = lastUser?.content || "";
    if (/mismatch|fleet audit|url drift/i.test(msg)) {
      try {
        const audit = await fleetMismatch.fetchFleetMismatch();
        msg = `Fleet mismatch audit (${audit.issueCount} issues):\n${JSON.stringify(audit.issues, null, 2)}\n\n${msg}`;
      } catch (e) { msg = `[mismatch fetch failed: ${e.message}]\n\n${msg}`; }
    }
    return anythingllm.streamAllmChat(res, {
      workspace: anythingllm.allmWorkspace(model),
      message: msg,
      mode: /mismatch|debug|audit/i.test(msg) ? "query" : "chat",
    });
  }

  let r;
  try {
    r = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model, messages:allMsgs, stream:true }),
      signal: AbortSignal.timeout(120000),
    });
  } catch(err) { res.write(`data: ${JSON.stringify({type:"error",message:err.message})}\n\n`); return res.end(); }
  for await (const chunk of r.body) {
    for (const line of Buffer.from(chunk).toString().split("\n").filter(Boolean)) {
      try {
        const j = JSON.parse(line);
        if (j.message?.content) res.write(`data: ${JSON.stringify({type:"token",content:j.message.content})}\n\n`);
        if (j.done) res.write(`data: ${JSON.stringify({type:"done"})}\n\n`);
      } catch {}
    }
  }
  res.end();
});

/* ── Onboarding ──────────────────────────────────────────────── */
app.get("/api/onboarding", (_req, res) => {
  const cfg = loadConfig();
  res.json({ complete: !!cfg.onboarded, config: cfg });
});

app.post("/api/onboarding/complete", async (req, res) => {
  const { userName, aiName, voiceId, talkCommands, qa, answers, model } = req.body;
  // Accept either a structured qa[] (new 30-question wizard) or a flat answers{} (legacy)
  const items = Array.isArray(qa)
    ? qa.filter(x => x && x.answer != null && String(x.answer).trim())
    : (answers ? Object.entries(answers).map(([k, v]) => ({ category:"Profile", question:k, answer:v })) : []);
  const name = (userName || (answers && answers.name) || "Friend").toString().trim() || "Friend";
  const aiN  = (aiName || "GRUDA").toString().trim() || "GRUDA";
  const cmds = Array.isArray(talkCommands) ? talkCommands.filter(c => c && c.phrase) : [];

  // Compact profile summary — doubles as the fallback persona when no model is reachable
  const summary = items.map(i => `${String(i.question).replace(/\?$/,"")}: ${i.answer}`).join("; ").slice(0, 1200);
  let systemPrompt =
    `You are ${aiN}, the personal AI for ${name}. Address them by name when natural and adapt to their context. ` +
    `Profile — ${summary || "no details provided yet"}.`;

  // Optionally upgrade the persona with the local model (ignored if Ollama is unavailable — e.g. on Railway)
  try {
    const prompt = `Write a concise (3-5 sentence) system prompt for an AI assistant named "${aiN}" helping a user named "${name}". Personalize using this profile and return ONLY the prompt text.\n\n${summary}`;
    const r = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, stream:false }),
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) { const d = await r.json(); if (d.response?.trim()) systemPrompt = d.response.trim(); }
  } catch {}

  const cfg = loadConfig();
  cfg.onboarded    = true;
  cfg.onboardedAt  = new Date().toISOString();
  cfg.userName     = name;
  cfg.displayName  = name;
  cfg.aiName       = aiN;
  cfg.voiceId      = voiceId || "";
  cfg.talkCommands = cmds;
  cfg.answers      = items;
  cfg.systemPrompt = systemPrompt;
  saveConfig(cfg);

  // Build a rich gruda.md grouped by category
  const byCat = {};
  for (const i of items) { const c = i.category || "Profile"; (byCat[c] = byCat[c] || []).push(i); }
  let mem = `# ${name}'s Workspace\n\nYour AI: **${aiN}**\nCreated: ${new Date().toISOString()}\n`;
  for (const [cat, list] of Object.entries(byCat)) {
    mem += `\n## ${cat}\n` + list.map(i => `- **${String(i.question).replace(/\*/g,"")}** ${i.answer}`).join("\n") + "\n";
  }
  if (cmds.length) {
    mem += `\n## Custom Talk Commands\n` + cmds.map(c => `- "${c.phrase}" → ${c.action || c.prompt || ""}`).join("\n") + "\n";
  }
  mem += `\n## Generated Persona\n${systemPrompt}\n`;

  const flatAnswers = answers || {
    name, role: items.find(i => /role|craft/i.test(i.question))?.answer || "",
    goals: items.find(i => /goal|hoping/i.test(i.question))?.answer || "",
    projects: items.find(i => /project/i.test(i.question))?.answer || "",
    preferences: items.find(i => /preference/i.test(i.question))?.answer || "",
  };
  const { files: insightFiles } = userInsights.buildInsightFilesFromAnswers(flatAnswers, { aiName: aiN });
  writeInsightFiles(insightFiles);
  mem += `\n## User Insight Files\n` +
    userInsights.INSIGHT_SLUGS.map(s => `- **${userInsights.slugToFile(s)}** — saved locally`).join("\n") + "\n";

  const projName = (name.replace(/[^a-z0-9_\- ]/gi,"").replace(/\s+/g, "-") || "My") + "-workspace";
  const projPath = path.join(PROJECTS_DIR, projName);
  fs.mkdirSync(projPath, { recursive: true });
  fs.writeFileSync(path.join(projPath, "gruda.md"), mem, "utf8");
  pgUpsertProject(projName);
  pgUpsertMemory(projName, mem);
  pgUpsertOnboarding(cfg);

  res.json({
    ok: true, aiName: aiN, systemPrompt,
    defaultProject: { name: projName, path: projPath },
    insights: insightFiles,
  });
});

/* ── Models ──────────────────────────────────────────────────── */
app.get("/api/models", async (_req, res) => {
  const grok = grokBuild.listGrokModels();
  const hub = grudgeAiHub.listHubModels();
  const allm = anythingllm.listAllmModels();
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal:AbortSignal.timeout(5000) });
    const d = await r.json();
    const ollama = (d.models || []).map(m => ({ name: m.name, provider: "ollama" }));
    return res.json({
      models: [...allm, ...hub, ...grok, ...ollama],
      anythingllm: allm.length > 0, grudgeAi: hub.length > 0, grok: grokBuild.hasGrokApi(), ollama: ollama.length > 0,
    });
  } catch {
    res.json({
      models: [...allm, ...hub, ...grok],
      anythingllm: allm.length > 0, grudgeAi: hub.length > 0, grok: grokBuild.hasGrokApi(), ollama: false,
    });
  }
});

app.get("/api/ai/rag/status", async (_req, res) => {
  try {
    res.json({ ...anythingllm.getConfig(), ...(await anythingllm.checkStatus()) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/ai/rag/chat", async (req, res) => {
  try {
    const { message, workspace, task, mode, sessionId, includeMismatch } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });
    let msg = String(message);
    if (includeMismatch || task === "mismatch") {
      const audit = await fleetMismatch.fetchFleetMismatch();
      msg = `Fleet mismatch (${audit.issueCount}):\n${JSON.stringify(audit.issues)}\n\n${msg}`;
    }
    const slug = workspace || anythingllm.resolveWorkspace(task);
    const result = await anythingllm.workspaceChat({ workspace: slug, message: msg, mode, sessionId });
    res.json({ workspace: slug, ...result });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get("/api/fleet/mismatch", async (_req, res) => {
  try {
    res.json(await fleetMismatch.fetchFleetMismatch());
  } catch (err) { res.status(502).json({ error: err.message }); }
});

/* ── Skills (Grok Build pattern) ─────────────────────────────── */
app.get("/api/skills", (_req, res) => {
  _bundledSkills = grokBuild.loadBundledSkills(SKILLS_DIR);
  res.json({ skills: _bundledSkills.map(s => ({ id: s.id, name: s.name, description: s.description })) });
});

app.get("/api/skills/:id", (req, res) => {
  const skill = _bundledSkills.find(s => s.id === req.params.id || s.name === req.params.id);
  if (!skill) return res.status(404).json({ error: "skill not found" });
  res.json(skill);
});

app.post("/api/models/pull", async (req, res) => {
  const { name } = req.body;
  res.setHeader("Content-Type","text/event-stream");
  const r = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ name, stream:true }), signal:AbortSignal.timeout(600000),
  });
  for await (const chunk of r.body) res.write(Buffer.from(chunk).toString());
  res.end();
});

/* ── Projects ────────────────────────────────────────────────── */
app.get("/api/projects", (_req, res) => {
  const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes:true })
    .filter(e => e.isDirectory() && !e.name.startsWith("."))
    .map(e => {
      const p = path.join(PROJECTS_DIR, e.name);
      const mem = fs.existsSync(path.join(p,"gruda.md")) ? fs.readFileSync(path.join(p,"gruda.md"),"utf8") : "";
      return { name:e.name, path:p, hasMemory:!!mem, memoryPreview:mem.slice(0,180) };
    });
  res.json({ projects, dir:PROJECTS_DIR });
});

app.post("/api/projects", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error:"name required" });
  const p = path.join(PROJECTS_DIR, name.replace(/[^a-z0-9_\-. ]/gi,"_"));
  fs.mkdirSync(p, { recursive:true });
  const safeName = path.basename(p);
  const mem = path.join(p,"gruda.md");
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Notes\n\n`,"utf8");
  pgUpsertProject(safeName);
  pgUpsertMemory(safeName, fs.readFileSync(mem, "utf8"));
  res.json({ ok:true, name, path:p });
});

app.get("/api/projects/:name/memory", (req, res) => {
  const m = path.join(PROJECTS_DIR, req.params.name, "gruda.md");
  res.json({ content: fs.existsSync(m) ? fs.readFileSync(m,"utf8") : "" });
});

// Save / edit a project's gruda.md from the UI (also mirrored to Postgres)
app.post("/api/projects/:name/memory", (req, res) => {
  const safe = req.params.name.replace(/[^a-z0-9_\-. ]/gi, "_");
  const dir  = path.join(PROJECTS_DIR, safe);
  fs.mkdirSync(dir, { recursive: true });
  const content = req.body.content || "";
  fs.writeFileSync(path.join(dir, "gruda.md"), content, "utf8");
  pgUpsertProject(safe);
  pgUpsertMemory(safe, content);
  res.json({ ok:true });
});

/* ── User insight files ──────────────────────────────────────── */
app.get("/api/insights", (_req, res) => {
  const map = loadInsightMap();
  const files = userInsights.INSIGHT_SLUGS.map(slug => ({
    slug,
    file: userInsights.slugToFile(slug),
    content: map[slug] || "",
    hasContent: !!(map[slug] && map[slug].trim()),
  }));
  res.json({ insights: files, dir: INSIGHTS_DIR, slugs: userInsights.INSIGHT_SLUGS });
});

app.get("/api/insights/:slug", (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9_-]/gi, "");
  if (!userInsights.INSIGHT_SLUGS.includes(slug)) return res.status(404).json({ error: "unknown insight slug" });
  const fp = path.join(INSIGHTS_DIR, userInsights.slugToFile(slug));
  res.json({ slug, file: userInsights.slugToFile(slug), content: fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "" });
});

app.post("/api/insights/:slug", (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9_-]/gi, "");
  if (!userInsights.INSIGHT_SLUGS.includes(slug)) return res.status(404).json({ error: "unknown insight slug" });
  const content = req.body.content || "";
  saveInsightFile(slug, content);
  res.json({ ok: true, slug, file: userInsights.slugToFile(slug) });
});

app.post("/api/insights/sync", (req, res) => {
  const { insights } = req.body || {};
  if (!insights || typeof insights !== "object") return res.status(400).json({ error: "insights object required" });
  writeInsightFiles(insights);
  res.json({ ok: true, slugs: Object.keys(insights) });
});

app.post("/api/insights/grow", async (req, res) => {
  const { messages, model, extracted } = req.body || {};
  const growthPath = path.join(INSIGHTS_DIR, userInsights.slugToFile("growth"));
  const existing = fs.existsSync(growthPath) ? fs.readFileSync(growthPath, "utf8") : "";

  let block = (extracted && String(extracted).trim()) || null;
  if (!block && Array.isArray(messages) && messages.length) {
    block = await llmInsightExtract(userInsights.buildGrowthPrompt(messages, existing), model);
  }
  if (!block) return res.json({ ok: false, reason: "no insights extracted", growth: existing });

  const updated = userInsights.appendGrowthInsight(existing, block);
  saveInsightFile("growth", updated);
  res.json({ ok: true, added: block, growth: updated });
});

/* ── History ─────────────────────────────────────────────────── */
app.get("/api/history", async (_req, res) => {
  if (pgReady) {
    try {
      const r = await pgPool.query('SELECT title, project, summary, messages, saved_at AS "savedAt" FROM gruda_sessions ORDER BY saved_at DESC LIMIT 20');
      return res.json({ sessions: r.rows });
    } catch {}
  }
  res.json({ sessions: loadHistory().slice(-20).reverse() });
});
app.post("/api/history", (req, res) => { appendSession(req.body); res.json({ ok:true }); });

/* ── Config ──────────────────────────────────────────────────── */
app.get("/api/config",       (_req, res) => res.json(loadConfig()));
app.patch("/api/config", (req, res) => {
  const cfg = { ...loadConfig(), ...req.body };
  saveConfig(cfg);
  res.json({ ok:true, config:cfg });
});

/* ── Grudge auth config ── the SPA reads where to link a Puter ID to a Grudge ID */
app.get("/api/auth/config", (_req, res) => res.json({
  authUrl: GRUDGE_AUTH_URL,
  accountUrl: GRUDGE_ACCOUNT_URL,
  linkEnabled: !!GRUDGE_ACCOUNT_URL,
}));

/* ── Treaty Chat — light account-linked shareable rooms ──────── */
async function socialRelaySend(roomId, fromUuid, text) {
  if (!GRUDGE_SOCIAL_URL) return null;
  try {
    const r = await fetch(`${GRUDGE_SOCIAL_URL}/api/chat/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUuid, roomId, text, type: "text" }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return await r.json();
  } catch {}
  return null;
}

async function socialRelayFetch(roomId, limit = 80) {
  if (!GRUDGE_SOCIAL_URL) return null;
  try {
    const r = await fetch(`${GRUDGE_SOCIAL_URL}/api/chat/room?roomId=${encodeURIComponent(roomId)}&limit=${limit}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      return (d.messages || []).map((m) => ({
        id: m.id,
        roomId,
        from: { username: m.from, displayName: m.from },
        text: m.text,
        ts: m.timestamp || m.ts,
      }));
    }
  } catch {}
  return null;
}

app.get("/api/treaty/config", (req, res) => {
  const room = treatyChat.normalizeRoomId(req.query.room || "general");
  res.json({
    mode: "account-room",
    rooms: treatyChat.DEFAULT_ROOMS,
    room,
    shareUrl: treatyChat.shareUrl(`${req.protocol}://${req.get("host")}`, room),
    socialUrl: GRUDGE_SOCIAL_URL,
    serverless: !!process.env.VERCEL,
  });
});

app.get("/api/treaty/rooms", (_req, res) => {
  res.json({ rooms: treatyChat.DEFAULT_ROOMS });
});

app.get("/api/treaty/room/:id/messages", async (req, res) => {
  const roomId = treatyChat.normalizeRoomId(req.params.id);
  let messages = treatyChat.readRoomMessages(fs, TREATY_DIR, roomId);
  const social = await socialRelayFetch(roomId);
  if (social?.length) {
    const seen = new Set(messages.map((m) => m.id));
    for (const m of social) if (!seen.has(m.id)) messages.push(m);
    messages.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    messages = messages.slice(-200);
  }
  res.json({ roomId, messages });
});

app.post("/api/treaty/room/:id/send", async (req, res) => {
  const roomId = treatyChat.normalizeRoomId(req.params.id);
  const sender = treatyChat.normalizeSender(req.body);
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text required" });
  const msg = treatyChat.makeMessage(roomId, sender, text);
  treatyChat.appendMessage(fs, TREATY_DIR, roomId, msg);
  pgAppendTreaty(msg);
  if (sender.grudgeId) await socialRelaySend(roomId, sender.grudgeId, text);
  broadcast({ type: "treaty_msg", data: msg });
  res.json({ ok: true, message: msg });
});

// Legacy endpoint — same as room send (default room: general)
app.post("/api/treaty/send", async (req, res) => {
  const roomId = treatyChat.normalizeRoomId(req.body?.roomId || req.body?.room || "general");
  const sender = treatyChat.normalizeSender(req.body);
  const text = String(req.body?.text || req.body?.message || "").trim();
  if (!text) return res.status(400).json({ error: "text required" });
  const msg = treatyChat.makeMessage(roomId, sender, text);
  treatyChat.appendMessage(fs, TREATY_DIR, roomId, msg);
  pgAppendTreaty(msg);
  if (sender.grudgeId) await socialRelaySend(roomId, sender.grudgeId, text);
  broadcast({ type: "treaty_msg", data: msg });
  res.json({ ok: true, message: msg, relayed: true });
});

app.get("/api/treaty/status", (_req, res) => {
  res.json({
    connected: true,
    mode: "poll",
    rooms: treatyChat.DEFAULT_ROOMS.length,
    socialUrl: GRUDGE_SOCIAL_URL,
    legacyWs: TREATY_URL,
    serverless: !!process.env.VERCEL,
  });
});

app.get("/api/treaty/messages", (req, res) => {
  const roomId = treatyChat.normalizeRoomId(req.query.room || "general");
  const messages = treatyChat.readRoomMessages(fs, TREATY_DIR, roomId).slice(-50);
  res.json({ messages, roomId });
});

/* ── Splash media ────────────────────────────────────────────── */
app.get("/api/splash", (_req, res) => res.json({ gif1:SPLASH_GIF_1?"/api/splash/gif1":null, gif2:SPLASH_GIF_2?"/api/splash/gif2":null }));
app.get("/api/splash/gif1", (req, res) => {
  if (!SPLASH_GIF_1 || !require("fs").existsSync(SPLASH_GIF_1)) return res.status(404).json({error:"GIF1 not found"});
  res.setHeader("Content-Type","image/gif");
  require("fs").createReadStream(SPLASH_GIF_1).pipe(res);
});
app.get("/api/splash/gif2", (req, res) => {
  if (!SPLASH_GIF_2 || !require("fs").existsSync(SPLASH_GIF_2)) return res.status(404).json({error:"GIF2 not found"});
  res.setHeader("Content-Type","image/gif");
  require("fs").createReadStream(SPLASH_GIF_2).pipe(res);
});

/* ── Health ──────────────────────────────────────────────────── */
app.get("/api/health", async (_req, res) => {
  let ollama = false;
  let ollamaHost = OLLAMA_HOST;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(4000) });
    ollama = r.ok;
  } catch {}
  res.json({
    ok: true,
    ollama,
    ollamaHost,
    ollamaNote: process.env.VERCEL
      ? "Server cannot reach your PC — browser probes 127.0.0.1:11434 when you run Ollama locally"
      : null,
    treaty: true,
    treatyMode: "account-room",
    grok: grokBuild.hasGrokApi(),
    grudgeAi: grudgeAiHub.listHubModels().length > 0,
    skills: _bundledSkills.length,
    serverless: !!process.env.VERCEL,
    storage: describeStoragePaths(),
    pwa: true,
    db: pgReady,
    music: !!MUREKA_KEY,
    voice: !!ELEVEN_KEY,
  });
});

app.get("/api/app/paths", (_req, res) => {
  res.json(describeStoragePaths());
});


/* ═══════════════════════════════════════════════════════════════
   CLOUD INTEGRATIONS — Puter · Google Drive · GitHub · Vercel
   Tokens stored in ~/.gruda-agent/config.json (local only, never sent to us)
   ═══════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════
   IDE — Monaco code execution + file tree
   ═══════════════════════════════════════════════════════════════ */

// Confine a requested path within PROJECTS_DIR (prevents arbitrary filesystem
// access via ?dir= / ?path=). Returns the resolved absolute path, or null if it
// would escape the projects root. ?dir=C:\... or ../ traversal resolves outside
// the base and is rejected.
function safeProjectPath(rel) {
  const base = path.resolve(PROJECTS_DIR);
  const resolved = path.resolve(base, rel || "");
  return (resolved === base || resolved.startsWith(base + path.sep)) ? resolved : null;
}

/* ── Run code (Node.js sandbox) ──────────────────────────────── */
app.post("/api/ide/run", (req, res) => {
  let { code, path: filePath, lang = "javascript" } = req.body;
  if (!code && filePath) {
    const safe = safeProjectPath(filePath);
    if (safe && fs.existsSync(safe)) code = fs.readFileSync(safe, "utf8");
  }
  if (!code) return res.status(400).json({ error: "code or path required" });

  const { spawn } = require("child_process");
  const tmp = path.join(os.tmpdir(), `gruda_run_${Date.now()}.js`);
  fs.writeFileSync(tmp, code, "utf8");

  let out = "", err = "";
  const proc = spawn("node", [tmp], { timeout: 10000 });
  proc.stdout.on("data", d => { out += d.toString(); });
  proc.stderr.on("data", d => { err += d.toString(); });
  proc.on("close", code => {
    fs.unlinkSync(tmp);
    res.json({ ok: code === 0, stdout: out.slice(0, 8000), stderr: err.slice(0, 2000), exitCode: code });
  });
  proc.on("error", e => { res.status(500).json({ error: e.message }); });
});

/* ── File tree for IDE ───────────────────────────────────────── */
app.get("/api/ide/tree", (req, res) => {
  const proj = req.query.project || req.query.proj;
  const requested = safeProjectPath(req.query.dir || proj || "") || path.resolve(PROJECTS_DIR);
  const dir = fs.existsSync(requested) ? requested : path.resolve(PROJECTS_DIR);
  const SKIP = new Set(["node_modules",".git","dist","build",".next","__pycache__",".DS_Store"]);
  function walk(d, depth=0) {
    if (depth > 6) return [];
    return fs.readdirSync(d, { withFileTypes:true })
      .filter(e => !SKIP.has(e.name) && !e.name.startsWith("."))
      .map(e => {
        const full = path.join(d, e.name);
        const isDir = e.isDirectory();
        return {
          name: e.name, path: full, type: isDir ? "dir" : "file",
          ext: isDir ? null : path.extname(e.name).slice(1),
          children: isDir ? walk(full, depth+1) : undefined,
        };
      });
  }
  try { res.json({ tree: walk(dir), root: dir }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Read/write file for IDE ────────────────────────────────── */
app.get("/api/ide/file", (req, res) => {
  const p = safeProjectPath(req.query.path || req.query.p);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "not found" });
  res.json({ content: fs.readFileSync(p, "utf8"), path: p });
});

app.post("/api/ide/file", (req, res) => {
  const p = safeProjectPath(req.body.path || req.body.p);
  const { content } = req.body;
  if (!p) return res.status(400).json({ error: "invalid or missing path" });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content || "", "utf8");
  res.json({ ok: true });
});

/* ── AI snippet generation ───────────────────────────────────── */
app.post("/api/ide/snippet", async (req, res) => {
  const prompt = req.body.prompt || req.body.context;
  const lang = req.body.lang || req.body.language || "javascript";
  const model = req.body.model;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  const m = model || DEFAULT_MODEL;
  const systemMsg = `You are an expert ${lang} developer. Return ONLY clean, working code with no explanation and no markdown fences. Just the raw code.`;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, stream: false,
        messages: [{ role:"system", content: systemMsg }, { role:"user", content: prompt }]
      })
    });
    const d = await r.json();
    const code = d.message?.content || "";
    res.json({ code, snippet: code, lang });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   ASSET BROWSER — Poly Haven · Poly Pizza · Grudge Studio
   ═══════════════════════════════════════════════════════════════ */

/* ── Poly Haven (free, no key needed) ───────────────────────── */
app.get("/api/assets/polyhaven", async (req, res) => {
  const { type = "all", q = "" } = req.query;
  // type: 0=hdri, 1=texture, 2=model, all=all
  const typeMap = { hdri:"0", texture:"1", model:"2", all:"" };
  const t = typeMap[type] || "";
  const url = `https://api.polyhaven.com/assets${t ? `?type=${t}` : ""}`;
  try {
    const d = await fetch(url).then(r => r.json());
    let assets = Object.entries(d).map(([slug, meta]) => ({
      slug, name: meta.name, type: meta.type,
      thumb: `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png?width=200&height=200`,
      tags: meta.tags || [], categories: meta.categories || [],
      polycount: meta.polycount || null
    }));
    if (q) {
      const ql = q.toLowerCase();
      assets = assets.filter(a => a.name.toLowerCase().includes(ql) || a.tags.some(t => t.includes(ql)));
    }
    res.json({ assets: assets.slice(0, 60), total: assets.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/assets/polyhaven/:slug", async (req, res) => {
  const { slug } = req.params;
  const { resolution = "1k", format = "gltf" } = req.query;
  try {
    const files = await fetch(`https://api.polyhaven.com/files/${slug}`).then(r => r.json());
    // For models: find gltf download URL
    const gltf = files.gltf?.[resolution]?.gltf?.url || files.gltf?.["1k"]?.gltf?.url || null;
    const fbx  = files.fbx?.[resolution]?.fbx?.url  || null;
    const blend= files.blend?.[resolution]?.blend?.url || null;
    res.json({ slug, gltf, fbx, blend, files: Object.keys(files) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Poly Pizza (needs API key from user) ───────────────────── */
app.get("/api/assets/polypizza", async (req, res) => {
  const { q = "sword" } = req.query;
  const cfg = loadConfig();
  const key = process.env.POLY_PIZZA_KEY || cfg.integrations?.polypizza?.key;
  if (!key) return res.status(401).json({ error: "Poly Pizza API key required. Add it in Cloud & Deploy > Integrations.", keyRequired: true });
  try {
    const r = await fetch(`https://api.poly.pizza/v1/search?q=${encodeURIComponent(q)}&limit=24`, {
      headers: { "X-Auth-Token": key }
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Grudge Studio assets ────────────────────────────────────── */
app.get("/api/assets/grudge", async (_req, res) => {
  try {
    const r = await fetch("https://info.grudge-studio.com/api/assets").catch(() => null);
    if (r?.ok) return res.json(await r.json());
  } catch {}
  // Fallback: curated list
  res.json({ assets: [
    { name:"Character Pack", type:"model", url:"https://grudge-studio.com/assets/characters", thumb:"https://grudge-studio.com/favicon.ico" },
    { name:"Weapon Pack",    type:"model", url:"https://grudge-studio.com/assets/weapons",    thumb:"https://grudge-studio.com/favicon.ico" },
    { name:"Environment",    type:"texture", url:"https://grudge-studio.com/assets/env",      thumb:"https://grudge-studio.com/favicon.ico" },
  ]});
});

/* ── Grudge R2 assets (asset-api registry + R2 CDN) ──────────── */
// Lists real Grudge assets from the asset-api Worker and normalizes them to the
// card shape the Assets tab already renders. URLs resolve to the R2 CDN.
app.get("/api/assets/r2", async (req, res) => {
  const { q = "", category = "", limit = "60" } = req.query;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category && category !== "all") params.set("category", category);
  params.set("limit", String(Math.min(parseInt(limit, 10) || 60, 120)));
  try {
    const r = await fetch(`${GRUDGE_ASSET_API}/assets?${params}`, { signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const d = await r.json();
      const rows = d.assets || d.results || d.rows || (Array.isArray(d) ? d : []);
      const cdn = (k) => (k ? `${GRUDGE_R2_CDN}/${String(k).replace(/^\//, "")}` : "");
      const assets = rows.map((a) => {
        const key = a.r2_key || a.r2Key || a.key || a.path || "";
        return {
          name: a.name || (key.split("/").pop() || "asset"),
          type: a.type || a.category || "model",
          category: a.category || "",
          tier: a.tier || a.iteration || "",
          url: a.url || cdn(key) || a.download || "",
          thumbnail: a.thumb || a.thumbnail || cdn(a.thumb_key || a.thumbKey),
          r2Key: key,
        };
      });
      return res.json({ assets, total: d.total || assets.length, source: "asset-api" });
    }
  } catch {}
  res.json({ assets: [], total: 0, source: "fallback",
    note: `Grudge asset-api unreachable. Set GRUDGE_ASSET_API (now ${GRUDGE_ASSET_API}) or check connectivity.` });
});

// CORS-safe passthrough so the sandboxed Environment iframe can fetch GLB/FBX/
// textures from the R2 CDN without CORS issues. Read-only, key-validated.
function r2Cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
}
app.options(/^\/api\/r2\/(.*)/, (_req, res) => { r2Cors(res); res.end(); });
app.get(/^\/api\/r2\/(.*)/, async (req, res) => {
  const key = (req.params[0] || "").replace(/^\/+/, "");
  if (!key || key.includes("..")) return res.status(400).json({ error: "bad asset key" });
  try {
    const upstreamHeaders = {};
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;  // pass Range through for large GLB/FBX
    const r = await fetch(`${GRUDGE_R2_CDN}/${key}`, { headers: upstreamHeaders, signal: AbortSignal.timeout(20000) });
    r2Cors(res);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/octet-stream");
    const cl = r.headers.get("content-length"); if (cl) res.setHeader("Content-Length", cl);
    const cr = r.headers.get("content-range"); if (cr) res.setHeader("Content-Range", cr);
    if (!r.ok) return res.status(r.status).end();
    res.status(r.status);
    // Stream the upstream body instead of buffering the whole asset into memory
    if (r.body) { const { Readable } = require("stream"); Readable.fromWeb(r.body).pipe(res); }
    else res.end();
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   ENVIRONMENT — agentic Three.js / Rapier / Phaser / Node studio
   Scene generation (LLM) + per-project save/load of scene code.
   ═══════════════════════════════════════════════════════════════ */
function stripFences(s) {
  return String(s || "").replace(/^\s*```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
}
function envSystemPrompt(engine) {
  const base = "You are the GRUDA Environment Worker. Return ONLY runnable code with NO markdown fences and NO prose. " +
    "Load Grudge assets via the global assetUrl('/models/...') helper (it resolves to the R2 CDN). " +
    "Always clean up: stop the loop and dispose geometries/materials/renderer on teardown.";
  if (engine === "rapier") return base + " Target: an ES module using bare imports 'three', 'three/addons/...', and '@dimforge/rapier3d-compat'. await RAPIER.init() before using physics; step the world at a fixed timestep inside the animation loop; sync mesh transforms from rigid bodies.";
  if (engine === "phaser") return base + " Target: an ES module using a bare import of 'phaser'. Create a Phaser.Game with a Scene (preload/create/update). Keep the canvas sized to the window.";
  if (engine === "node")  return base + " Target: a self-contained Node.js script (CommonJS or ESM) that logs output to stdout. No browser/DOM APIs.";
  return base + " Target: an ES module using bare imports 'three' and 'three/addons/...'. Set up renderer, scene, a PerspectiveCamera and OrbitControls, lights, and a requestAnimationFrame loop. Handle window resize.";
}

app.post("/api/env/scene", async (req, res) => {
  const { prompt, engine = "three", model } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  try {
    const code = await llmComplete(model || DEFAULT_MODEL, envSystemPrompt(engine), prompt, 90000);
    res.json({ ok: true, engine, code: stripFences(code) });
  } catch (e) {
    res.status(500).json({ error: `Scene generation failed (${e.message}). Run Ollama/set OLLAMA_HOST, or pick a Puter cloud model (generated in-browser).` });
  }
});

function scenesDir(project) {
  const safe = (project || "_default").replace(/[^a-z0-9_\-. ]/gi, "_");
  return path.join(PROJECTS_DIR, safe, ".gruda", "scenes");
}
app.get("/api/env/scenes", (req, res) => {
  const dir = scenesDir(req.query.project);
  let scenes = [];
  try {
    scenes = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => {
      try { const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        return { id: f.replace(/\.json$/, ""), name: j.name || f, engine: j.engine || "three", savedAt: j.savedAt }; }
      catch { return null; }
    }).filter(Boolean);
  } catch {}
  res.json({ scenes });
});
app.get("/api/env/scenes/:id", (req, res) => {
  const f = path.join(scenesDir(req.query.project), req.params.id.replace(/[^a-z0-9_\-.]/gi, "_") + ".json");
  if (!fs.existsSync(f)) return res.status(404).json({ error: "not found" });
  try { res.json(JSON.parse(fs.readFileSync(f, "utf8"))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/env/scenes", (req, res) => {
  const { project, name, engine = "three", code = "" } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const dir = scenesDir(project); fs.mkdirSync(dir, { recursive: true });
  const id = name.replace(/[^a-z0-9_\-.]/gi, "_");
  fs.writeFileSync(path.join(dir, id + ".json"),
    JSON.stringify({ name, engine, code, savedAt: new Date().toISOString() }, null, 2), "utf8");
  res.json({ ok: true, id });
});

/* ═══════════════════════════════════════════════════════════════
   MUSIC — Mureka (song · instrumental · lyrics) — async + polling
   ═══════════════════════════════════════════════════════════════ */
function murekaHeaders() { return { Authorization: `Bearer ${MUREKA_KEY}`, "Content-Type": "application/json" }; }
const MUSIC_OFF = { error: "Music not configured. Set MUREKA_API_KEY in your environment.", configured: false };

app.post("/api/music/song", async (req, res) => {
  if (!MUREKA_KEY) return res.status(501).json(MUSIC_OFF);
  const { lyrics, prompt, model } = req.body;
  if (!lyrics) return res.status(400).json({ error: "lyrics required" });
  try {
    const r = await fetch(`${MUREKA_BASE}/v1/song/generate`, {
      method: "POST", headers: murekaHeaders(),
      body: JSON.stringify({ lyrics, prompt: prompt || "", model: model || MUREKA_MODEL }),
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Mureka error", detail: d });
    pgSaveMusic({ kind:"song", taskId: d.id, prompt, lyrics, model: d.model, status: d.status });
    res.json({ ok:true, kind:"song", id: d.id, status: d.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/music/instrumental", async (req, res) => {
  if (!MUREKA_KEY) return res.status(501).json(MUSIC_OFF);
  const { prompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  try {
    const r = await fetch(`${MUREKA_BASE}/v1/instrumental/generate`, {
      method: "POST", headers: murekaHeaders(),
      body: JSON.stringify({ prompt, model: model || MUREKA_MODEL }),
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Mureka error", detail: d });
    pgSaveMusic({ kind:"instrumental", taskId: d.id, prompt, model: d.model, status: d.status });
    res.json({ ok:true, kind:"instrumental", id: d.id, status: d.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/music/lyrics", async (req, res) => {
  if (!MUREKA_KEY) return res.status(501).json(MUSIC_OFF);
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  try {
    const r = await fetch(`${MUREKA_BASE}/v1/lyrics/generate`, {
      method: "POST", headers: murekaHeaders(),
      body: JSON.stringify({ prompt }), signal: AbortSignal.timeout(30000),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Mureka error", detail: d });
    res.json({ ok:true, title: d.title || "", lyrics: d.lyrics || d.response || "" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Poll a generation task. kind = song | instrumental
app.get("/api/music/task/:kind/:id", async (req, res) => {
  if (!MUREKA_KEY) return res.status(501).json(MUSIC_OFF);
  const kind = req.params.kind === "instrumental" ? "instrumental" : "song";
  try {
    const r = await fetch(`${MUREKA_BASE}/v1/${kind}/query/${encodeURIComponent(req.params.id)}`, {
      headers: murekaHeaders(), signal: AbortSignal.timeout(20000),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Mureka error", detail: d });
    const data = d.data || d;   // official API returns flat; some gateways wrap in {data}
    res.json({ ok:true, status: data.status, choices: data.choices || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   VOICE — ElevenLabs TTS (frontend falls back to browser speech)
   ═══════════════════════════════════════════════════════════════ */
app.get("/api/tts/voices", async (_req, res) => {
  if (!ELEVEN_KEY) return res.json({ enabled:false, voices: [] });
  try {
    const r = await fetch(`${ELEVEN_BASE}/v1/voices`, { headers: { "xi-api-key": ELEVEN_KEY }, signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    res.json({ enabled:true, defaultVoice: ELEVEN_VOICE, voices: (d.voices||[]).map(v => ({ id: v.voice_id, name: v.name, category: v.category })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/tts", async (req, res) => {
  if (!ELEVEN_KEY) return res.status(501).json({ error: "ElevenLabs not configured", configured: false });
  const { text, voiceId } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  const vid = (voiceId || ELEVEN_VOICE).toString().trim();
  try {
    const r = await fetch(`${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(vid)}`, {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({ text: String(text).slice(0, 5000), model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) { let msg; try { msg = (await r.json()).detail?.message; } catch {} return res.status(r.status).json({ error: msg || `ElevenLabs ${r.status}` }); }
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   AGENT UTILITIES — uploads · cache clear · GrudaChain proxy
   ═══════════════════════════════════════════════════════════════ */
// Upload files into a project's uploads/ folder so the agent can read/unzip/convert them
app.post("/api/upload", upload.array("files", 20), (req, res) => {
  const proj = (req.body.project || "").replace(/[^a-z0-9_\-. ]/gi, "_");
  const destDir = path.join(PROJECTS_DIR, proj || "_uploads", "uploads");
  fs.mkdirSync(destDir, { recursive: true });
  const saved = [];
  for (const f of (req.files || [])) {
    const target = path.join(destDir, (f.originalname || "file").replace(/[^a-z0-9_\-. ]/gi, "_"));
    try { fs.renameSync(f.path, target); } catch { fs.copyFileSync(f.path, target); fs.unlinkSync(f.path); }
    saved.push({ name: f.originalname, path: target, size: f.size });
  }
  res.json({ ok:true, files: saved, dir: destDir });
});

// Clear temp/run/upload caches (resource hygiene)
app.post("/api/cache/clear", (_req, res) => {
  const tmp = os.tmpdir();
  let removed = 0;
  try {
    for (const n of fs.readdirSync(tmp)) {
      if (/^gruda_run_/.test(n) || n === "gruda-uploads") {
        try { fs.rmSync(path.join(tmp, n), { recursive:true, force:true }); removed++; } catch {}
      }
    }
  } catch {}
  try { fs.mkdirSync(UPLOAD_TMP, { recursive: true }); } catch {}
  res.json({ ok:true, removed });
});

// GrudaChain / master node passthrough (set MASTER_NODE_URL to enable)
app.all(/^\/api\/grudachain\/(.*)/, async (req, res) => {
  if (!MASTER_NODE) return res.status(501).json({ error: "GrudaChain not configured (set MASTER_NODE_URL)" });
  const sub = req.params[0] || "";
  try {
    const r = await fetch(`${MASTER_NODE.replace(/\/$/, "")}/${sub}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: ["GET","HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(15000),
    });
    const txt = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(txt);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════════════
   AI WORKER ORCHESTRATOR — communal truth + checks (debuggable)
   A team of focused workers share ONE truth store per project. The
   orchestrator plans → dispatches workers → runs a QA/checks pass.
   Every step is appended to orchestrator.log.jsonl for inspection.
   ═══════════════════════════════════════════════════════════════ */
const WORKERS = {
  code:     { name:"Code Worker",     scope:"Writes/edits code, configs, scripts; uses files + shell.",
             system:"You are the Code Worker. Produce correct, minimal, working code and clear file/CLI steps. Note risky actions." },
  art3d:    { name:"3D / Art Worker", scope:"three.js scenes, models, materials, game boards, visuals.",
             system:"You are the 3D/Art Worker. Design three.js scene graphs, materials, layouts and game boards as concrete JSON/specs." },
  lore:     { name:"Lore Worker",     scope:"Story, world, NPCs, D&D character writing.",
             system:"You are the Lore Worker. Write vivid, consistent lore, NPCs and D&D characters that respect established truth." },
  balance:  { name:"Balance Worker",  scope:"Game balance: stats, economy, difficulty curves.",
             system:"You are the Balance Worker. Tune stats/economy/difficulty with concrete numbers and rationale." },
  campaign: { name:"Campaign Worker", scope:"D&D campaigns: acts, encounters, maps, quests.",
             system:"You are the Campaign Worker. Design campaign acts, encounters, maps and quest chains with clear structure." },
  qa:       { name:"QA / Checks",     scope:"Validates outputs against the shared truth; flags conflicts.",
             system:"You are the QA/Checks Worker. Rigorously compare artifacts to the goal and truth; list conflicts, gaps and contradictions plainly." },
};

function truthPaths(project) {
  const safe = (project || "_default").replace(/[^a-z0-9_\-. ]/gi, "_");
  const base = path.join(PROJECTS_DIR, safe, ".gruda");
  return { base, truth: path.join(base, "truth.json"), log: path.join(base, "orchestrator.log.jsonl") };
}
function readTruth(project) {
  try { return JSON.parse(fs.readFileSync(truthPaths(project).truth, "utf8")); }
  catch { return { facts: [], artifacts: [], decisions: [], openQuestions: [], updatedAt: null }; }
}
function writeTruth(project, t) {
  const { base, truth } = truthPaths(project);
  fs.mkdirSync(base, { recursive: true });
  t.updatedAt = new Date().toISOString();
  fs.writeFileSync(truth, JSON.stringify(t, null, 2), "utf8");
  return t;
}
function logStep(project, entry) {
  const { base, log } = truthPaths(project);
  try { fs.mkdirSync(base, { recursive: true }); fs.appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8"); } catch {}
}
// Single non-streaming completion via Ollama (used by orchestrator workers)
async function llmComplete(model, system, user, ms = 60000) {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model, stream:false, messages:[{role:"system",content:system},{role:"user",content:user}] }),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`model ${r.status}`);
  return (await r.json()).message?.content || "";
}

app.get("/api/workers", (_req, res) => {
  res.json({ workers: Object.entries(WORKERS).map(([id, w]) => ({ id, name: w.name, scope: w.scope })) });
});

app.get("/api/truth", (req, res) => {
  const project = req.query.project || "_default";
  let recent = [];
  try { recent = fs.readFileSync(truthPaths(project).log, "utf8").trim().split("\n").filter(Boolean).slice(-50).map(l => JSON.parse(l)); } catch {}
  res.json({ project, truth: readTruth(project), log: recent });
});
app.post("/api/truth", (req, res) => {
  if (!req.body.truth) return res.status(400).json({ error: "truth required" });
  res.json({ ok:true, truth: writeTruth(req.body.project, req.body.truth) });
});

// Orchestrate a goal across the worker team (SSE; every step streamed for debugging)
app.post("/api/orchestrate", async (req, res) => {
  const { goal, project, model } = req.body;
  res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache"); res.setHeader("Connection","keep-alive");
  const emit = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  if (!goal) { emit({ type:"error", message:"goal required" }); return res.end(); }
  const m = model || DEFAULT_MODEL;
  const proj = project || "_default";
  logStep(proj, { type:"run_start", goal });
  emit({ type:"truth", truth: readTruth(proj) });

  // 1) Plan
  let tasks = [];
  try {
    const planSys = `You are the Orchestrator AI. Decompose the goal into 2-5 ordered tasks, each assigned to ONE worker from: ${Object.keys(WORKERS).join(", ")}. Return ONLY JSON: {"tasks":[{"worker":"<id>","task":"<what to do>"}]}.`;
    const raw = await llmComplete(m, planSys, `Goal: ${goal}\n\nCurrent truth:\n${JSON.stringify(readTruth(proj)).slice(0,2000)}`);
    tasks = (JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).tasks || []).filter(t => WORKERS[t.worker]).slice(0, 6);
  } catch (e) {
    emit({ type:"error", message:`Planning failed (is a model backend reachable? ${e.message}). Run Ollama or set OLLAMA_HOST.` });
    logStep(proj, { type:"error", phase:"plan", message:e.message });
    return res.end();
  }
  emit({ type:"plan", tasks }); logStep(proj, { type:"plan", tasks });

  // 2) Dispatch workers — each reads + writes the communal truth
  for (const t of tasks) {
    const w = WORKERS[t.worker];
    emit({ type:"worker_start", worker:t.worker, name:w.name, task:t.task });
    logStep(proj, { type:"worker_start", worker:t.worker, task:t.task });
    let out = "";
    try {
      const sys = `${w.system}\nYour scope: ${w.scope}\nYou share a communal truth with other workers. Do your task and return a concise result. Truth:\n${JSON.stringify(readTruth(proj)).slice(0,3000)}`;
      out = await llmComplete(m, sys, t.task);
    } catch (e) { out = `(worker error: ${e.message})`; }
    const cur = readTruth(proj);
    cur.artifacts.push({ worker:t.worker, task:t.task, result: out.slice(0,4000), at: new Date().toISOString() });
    writeTruth(proj, cur);
    emit({ type:"worker_done", worker:t.worker, result: out.slice(0,4000) });
    logStep(proj, { type:"worker_done", worker:t.worker });
  }

  // 3) QA / checks pass — validate artifacts against goal + truth
  let findings = "";
  try {
    findings = await llmComplete(m, `${WORKERS.qa.system}`, `Goal: ${goal}\n\nValidate these against the goal; list conflicts, gaps, contradictions.\n\nTruth:\n${JSON.stringify(readTruth(proj)).slice(0,4000)}`);
  } catch (e) { findings = `(qa error: ${e.message})`; }
  const finalT = readTruth(proj);
  finalT.decisions.push({ type:"qa_check", findings: findings.slice(0,4000), at: new Date().toISOString() });
  writeTruth(proj, finalT);
  emit({ type:"check", findings }); logStep(proj, { type:"check" });

  emit({ type:"done", truth: finalT }); logStep(proj, { type:"run_done" });
  res.end();
});

/* ═══════════════════════════════════════════════════════════════
   POSTGRES (optional) — durable store; falls back to JSON/files
   when DATABASE_URL is not set. Write-through + boot hydrate.
   ═══════════════════════════════════════════════════════════════ */
let pgPool = null;
let pgReady = false;

async function pgInit() {
  if (!process.env.DATABASE_URL) return;
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS gruda_sessions (
        id SERIAL PRIMARY KEY, title TEXT, project TEXT, summary TEXT,
        messages JSONB, saved_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_config (
        key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_projects (
        name TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_memory (
        project TEXT PRIMARY KEY, content TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_onboarding (
        id INT PRIMARY KEY DEFAULT 1, user_name TEXT, ai_name TEXT, voice_id TEXT,
        talk_commands JSONB, answers JSONB, system_prompt TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_insights (
        slug TEXT PRIMARY KEY, content TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_treaty_messages (
        id TEXT PRIMARY KEY, room_id TEXT, sender JSONB, text TEXT, ts TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_music (
        id SERIAL PRIMARY KEY, kind TEXT, task_id TEXT, prompt TEXT, lyrics TEXT,
        model TEXT, status TEXT, result JSONB, created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    pgReady = true;
    console.log("[gruda] Postgres connected");
    await pgHydrate();
  } catch (e) { console.warn("[gruda] Postgres init failed:", e.message); pgPool = null; pgReady = false; }
}

// Restore config + project memory onto the local FS (for ephemeral hosts like Railway)
async function pgHydrate() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      const c = await pgPool.query("SELECT value FROM gruda_config WHERE key='main'");
      if (c.rows[0]?.value) fs.writeFileSync(CONFIG_FILE, JSON.stringify(c.rows[0].value, null, 2), "utf8");
    }
    const m = await pgPool.query("SELECT project, content FROM gruda_memory");
    for (const row of m.rows) {
      const pdir = path.join(PROJECTS_DIR, row.project);
      fs.mkdirSync(pdir, { recursive: true });
      const mp = path.join(pdir, "gruda.md");
      if (!fs.existsSync(mp)) fs.writeFileSync(mp, row.content || "", "utf8");
    }
    const ins = await pgPool.query("SELECT slug, content FROM gruda_insights");
    fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
    for (const row of ins.rows) {
      const fp = path.join(INSIGHTS_DIR, userInsights.slugToFile(row.slug));
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, row.content || "", "utf8");
    }
  } catch (e) { console.warn("[gruda] hydrate failed:", e.message); }
}

// Best-effort write-through helpers (no-op until Postgres is ready)
function pgUpsertConfig(cfg) {
  if (!pgReady) return;
  pgPool.query(
    "INSERT INTO gruda_config (key,value,updated_at) VALUES ('main',$1,NOW()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()",
    [JSON.stringify(cfg)]
  ).catch(()=>{});
}
function pgUpsertProject(name) {
  if (!pgReady) return;
  pgPool.query("INSERT INTO gruda_projects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]).catch(()=>{});
}
function pgUpsertMemory(project, content) {
  if (!pgReady) return;
  pgPool.query(
    "INSERT INTO gruda_memory (project,content,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (project) DO UPDATE SET content=$2, updated_at=NOW()",
    [project, content]
  ).catch(()=>{});
}
function pgUpsertOnboarding(cfg) {
  if (!pgReady) return;
  pgPool.query(
    `INSERT INTO gruda_onboarding (id,user_name,ai_name,voice_id,talk_commands,answers,system_prompt,updated_at)
     VALUES (1,$1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (id) DO UPDATE SET user_name=$1, ai_name=$2, voice_id=$3, talk_commands=$4, answers=$5, system_prompt=$6, updated_at=NOW()`,
    [cfg.userName||null, cfg.aiName||null, cfg.voiceId||null, JSON.stringify(cfg.talkCommands||[]), JSON.stringify(cfg.answers||[]), cfg.systemPrompt||null]
  ).catch(()=>{});
}
function pgUpsertInsight(slug, content) {
  if (!pgReady) return;
  pgPool.query(
    "INSERT INTO gruda_insights (slug,content,updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (slug) DO UPDATE SET content=$2, updated_at=NOW()",
    [slug, content || ""]
  ).catch(()=>{});
}
function pgAppendTreaty(msg) {
  if (!pgReady || !msg) return;
  pgPool.query(
    "INSERT INTO gruda_treaty_messages (id,room_id,sender,text,ts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
    [msg.id, msg.roomId, JSON.stringify(msg.from || {}), msg.text, msg.ts || new Date().toISOString()]
  ).catch(()=>{});
}
function pgSaveMusic(rec) {
  if (!pgReady) return;
  pgPool.query(
    "INSERT INTO gruda_music (kind,task_id,prompt,lyrics,model,status,result) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [rec.kind||null, rec.taskId||null, rec.prompt||null, rec.lyrics||null, rec.model||null, rec.status||null, JSON.stringify(rec.result||null)]
  ).catch(()=>{});
}

pgInit();

/* DB-backed history endpoints (replaces JSON when pg available) */
app.get("/api/history/pg", async (_req, res) => {
  if (!pgReady) return res.json({ sessions: loadHistory().slice(-20).reverse(), source:"file" });
  const r = await pgPool.query("SELECT * FROM gruda_sessions ORDER BY saved_at DESC LIMIT 20");
  res.json({ sessions: r.rows, source:"postgres" });
});

app.post("/api/history/pg", async (req, res) => {
  if (!pgReady) { appendSession(req.body); return res.json({ ok:true, source:"file" }); }
  const { title, project, summary, messages } = req.body;
  await pgPool.query(
    "INSERT INTO gruda_sessions (title, project, summary, messages) VALUES ($1,$2,$3,$4)",
    [title, project, summary, JSON.stringify(messages)]
  );
  res.json({ ok:true, source:"postgres" });
});

/* ── Integration token store ─────────────────────────────────── */
app.get("/api/integrations", (_req, res) => {
  const cfg = loadConfig();
  const integrations = cfg.integrations || {};
  // Return status only — never expose raw tokens over the wire
  res.json({
    github:  { connected: !!(integrations.github?.token),  user: integrations.github?.user  || null },
    vercel:  { connected: !!(integrations.vercel?.token),  user: integrations.vercel?.user  || null },
    google:  { connected: !!(integrations.google?.clientId), clientId: integrations.google?.clientId || null },
    puter:   { connected: !!(integrations.puter?.username), user: integrations.puter?.username || null },
  });
});

app.post("/api/integrations/:service", async (req, res) => {
  const { service } = req.params;
  const { token, clientId, username } = req.body;
  const cfg = loadConfig();
  if (!cfg.integrations) cfg.integrations = {};

  try {
    if (service === "github") {
      // Validate token with GitHub API
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "gruda-agent" }
      });
      if (!r.ok) return res.status(401).json({ error: "Invalid GitHub token" });
      const user = await r.json();
      cfg.integrations.github = { token, user: user.login, avatar: user.avatar_url };
      saveConfig(cfg);
      return res.json({ ok: true, user: user.login, avatar: user.avatar_url });
    }
    if (service === "vercel") {
      const r = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) return res.status(401).json({ error: "Invalid Vercel token" });
      const d = await r.json();
      const user = d.user?.username || d.user?.email || "vercel-user";
      cfg.integrations.vercel = { token, user };
      saveConfig(cfg);
      return res.json({ ok: true, user });
    }
    if (service === "google") {
      // Google OAuth is client-side; we just store the client ID for config
      cfg.integrations.google = { clientId };
      saveConfig(cfg);
      return res.json({ ok: true });
    }
    if (service === "puter") {
      // Puter auth is entirely client-side via puter.js; we just record username
      cfg.integrations.puter = { username };
      saveConfig(cfg);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "Unknown service" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/integrations/:service", (req, res) => {
  const cfg = loadConfig();
  if (cfg.integrations) delete cfg.integrations[req.params.service];
  saveConfig(cfg);
  res.json({ ok: true });
});

/* ── GitHub deploy (push project files to a repo) ────────────── */
app.post("/api/deploy/github", async (req, res) => {
  const { repoName, branch = "main", files, createRepo = false, isPrivate = false } = req.body;
  const cfg = loadConfig();
  const ghToken = cfg.integrations?.github?.token;
  const ghUser  = cfg.integrations?.github?.user;
  if (!ghToken) return res.status(401).json({ error: "GitHub not connected" });
  if (!repoName) return res.status(400).json({ error: "repoName required" });

  const headers = { Authorization: `Bearer ${ghToken}`, "User-Agent": "gruda-agent", "Content-Type": "application/json" };

  try {
    // Optionally create repo
    if (createRepo) {
      const cr = await fetch("https://api.github.com/user/repos", {
        method: "POST", headers,
        body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false })
      });
      if (!cr.ok && cr.status !== 422) { // 422 = already exists
        const e = await cr.json();
        return res.status(cr.status).json({ error: e.message });
      }
    }

    // Push each file via Contents API
    const results = [];
    for (const { filePath, content } of (files || [])) {
      const apiPath = `https://api.github.com/repos/${ghUser}/${repoName}/contents/${filePath}`;
      // Check if file exists (for SHA)
      let sha;
      const existing = await fetch(apiPath, { headers });
      if (existing.ok) { const d = await existing.json(); sha = d.sha; }

      const body = { message: `gruda-agent: update ${filePath}`, content: Buffer.from(content).toString("base64"), branch };
      if (sha) body.sha = sha;

      const put = await fetch(apiPath, { method: "PUT", headers, body: JSON.stringify(body) });
      results.push({ file: filePath, ok: put.ok, status: put.status });
    }
    res.json({ ok: true, repo: `${ghUser}/${repoName}`, url: `https://github.com/${ghUser}/${repoName}`, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GitHub: list user repos ─────────────────────────────────── */
app.get("/api/deploy/github/repos", async (_req, res) => {
  const cfg = loadConfig();
  const token = cfg.integrations?.github?.token;
  if (!token) return res.status(401).json({ error: "GitHub not connected" });
  try {
    const r = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "gruda-agent" }
    });
    const repos = await r.json();
    res.json({ repos: repos.map(r => ({ name: r.name, fullName: r.full_name, private: r.private, url: r.html_url, updatedAt: r.updated_at })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Vercel deploy ───────────────────────────────────────────── */
app.post("/api/deploy/vercel", async (req, res) => {
  const { projectName, files } = req.body;
  const cfg = loadConfig();
  const token = cfg.integrations?.vercel?.token;
  if (!token) return res.status(401).json({ error: "Vercel not connected" });
  if (!files?.length) return res.status(400).json({ error: "files required" });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const body = {
      name: projectName || "gruda-agent-deploy",
      files: files.map(({ filePath, content }) => ({
        file: filePath,
        data: content,
        encoding: "utf-8"
      })),
      projectSettings: { framework: null },
      target: "production"
    };
    const r = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST", headers, body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || "Deploy failed" });
    res.json({ ok: true, url: `https://${d.url}`, id: d.id, state: d.readyState });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Vercel: list deployments ────────────────────────────────── */
app.get("/api/deploy/vercel/list", async (_req, res) => {
  const cfg = loadConfig();
  const token = cfg.integrations?.vercel?.token;
  if (!token) return res.status(401).json({ error: "Vercel not connected" });
  try {
    const r = await fetch("https://api.vercel.com/v6/deployments?limit=10", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json();
    res.json({ deployments: (d.deployments || []).map(dep => ({
      id: dep.uid, name: dep.name, url: `https://${dep.url}`,
      state: dep.readyState, createdAt: dep.createdAt
    }))});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Generate desktop launcher .bat / .sh ────────────────────── */
app.post("/api/generate/launcher", (req, res) => {
  const { platform = "windows", port = 3200, projectName = "" } = req.body;
  const installDir = req.body.installDir || "C:\\gruda-agent";

  if (platform === "windows") {
    const bat = [
      `@echo off`,
      `title GRUDA Agent${projectName ? " — " + projectName : ""}`,
      `color 0E`,
      `cd /d "${installDir}"`,
      ``,
      `echo  Starting GRUDA Agent...`,
      ``,
      `:: Start Ollama if not running`,
      `curl -s http://127.0.0.1:11434/api/tags >nul 2>&1`,
      `if %errorlevel% neq 0 (`,
      `    start "" ollama serve`,
      `    timeout /t 3 /nobreak >nul`,
      `)`,
      ``,
      `start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:${port}"`,
      `node server.js`,
      `pause`,
    ].join("\r\n");

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="START-GRUDA${projectName ? "-" + projectName.replace(/\s+/g,"-") : ""}.bat"`);
    return res.send(bat);
  }

  // Mac/Linux .sh
  const sh = [
    `#!/usr/bin/env bash`,
    `cd "${installDir}"`,
    `if ! curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then`,
    `  ollama serve &>/dev/null & sleep 3`,
    `fi`,
    `(sleep 2 && (command -v xdg-open && xdg-open http://localhost:${port} || open http://localhost:${port})) &`,
    `node server.js`,
  ].join("\n");

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="start-gruda${projectName ? "-" + projectName.toLowerCase().replace(/\s+/g,"-") : ""}.sh"`);
  res.send(sh);
});

/* ── Read project files for deploy ──────────────────────────────
   Returns all text files in a project dir as [{filePath, content}]
   ─────────────────────────────────────────────────────────────── */
app.get("/api/projects/:name/files", (req, res) => {
  const projDir = path.join(PROJECTS_DIR, req.params.name);
  if (!fs.existsSync(projDir)) return res.status(404).json({ error: "Project not found" });

  const MAX_FILE_SIZE = 512 * 1024; // 512 KB
  const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__"]);
  const TEXT_EXTS = new Set([".js",".ts",".jsx",".tsx",".py",".rb",".go",".rs",".html",".css",
    ".json",".md",".txt",".sh",".bat",".env.example",".yaml",".yml",".toml",".xml",".sql"]);

  const results = [];
  function walk(dir, base = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel  = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(full, rel); }
      else if (TEXT_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = fs.statSync(full);
          if (stat.size < MAX_FILE_SIZE) {
            results.push({ filePath: rel, content: fs.readFileSync(full, "utf8") });
          }
        } catch {}
      }
    }
  }
  walk(projDir);
  res.json({ files: results, count: results.length, project: req.params.name });
});

/* ── SPA fallback (deep links hit index.html) ─────────────────── */
app.get("*", (req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  const index = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

/* ── WebSocket (browser clients) ─────────────────────────────── */
wss.on("connection", (ws) => {
  const cfg = loadConfig();
  ws.send(JSON.stringify({ type:"connected", displayName: cfg.displayName || null }));
  ws.on("error", ()=>{});
});

/* ── Start ────────────────────────────────── */
// On Vercel (and other serverless hosts) we export the Express app instead of
// binding a port. Locally and via the `gruda-agent` CLI, VERCEL is unset so the
// HTTP + WebSocket server starts normally.
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`[gruda-agent] Running at http://localhost:${PORT}`);
  });
}

module.exports = app;

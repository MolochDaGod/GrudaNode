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

/* ── Config ──────────────────────────────────────────────────── */
const PORT           = parseInt(process.env.PORT || "3200", 10);
const OLLAMA_HOST    = process.env.OLLAMA_HOST    || "http://127.0.0.1:11434";
const DEFAULT_MODEL  = process.env.DEFAULT_MODEL  || "mistral:latest";
const PROJECTS_DIR   = process.env.PROJECTS_DIR   || path.join(os.homedir(), "gruda-projects");
const BRAVE_KEY      = process.env.BRAVE_SEARCH_KEY || "";
const SPLASH_GIF_1   = process.env.SPLASH_GIF_1  || "";
const SPLASH_GIF_2   = process.env.SPLASH_GIF_2  || "";
const MASTER_NODE    = process.env.MASTER_NODE_URL || "";
const TREATY_URL     = process.env.TREATY_CHAT_URL || MASTER_NODE || "https://master.grudge-studio.com";

/* ── Data dirs ───────────────────────────────────────────────── */
const DATA_DIR     = path.join(os.homedir(), ".gruda-agent");
const CONFIG_FILE  = path.join(DATA_DIR, "config.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR,     { recursive: true });

/* ── Config helpers ──────────────────────────────────────────── */
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
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
}

/* ── Express + WS ────────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

if (TREATY_URL) setTimeout(connectTreaty, 2000);

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
    description:"Run a shell command and return output",
    parameters:{ type:"object", properties:{ command:{ type:"string" }, cwd:{ type:"string" } }, required:["command"] }
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
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch(err) { return { error: err.message }; }
}

/* ── Agent SSE stream ────────────────────────────────────────── */
app.post("/api/agent/stream", async (req, res) => {
  const { messages, model, projectDir, systemExtra } = req.body;
  if (!messages || !model) return res.status(400).json({ error:"messages and model required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const pDir = projectDir || PROJECTS_DIR;
  const memPath = path.join(pDir, "gruda.md");
  const memory  = fs.existsSync(memPath) ? fs.readFileSync(memPath, "utf8") : "";
  const cfg     = loadConfig();

  const system =
    `You are GRUDA Agent, a local AI assistant built by Grudge Studio (RacAlvin The Pirate King). ` +
    `You run entirely on the user's machine — no cloud, no API keys.\n\n` +
    `You have tools: search files, read/write files, create folders, run shell commands, search the web, update gruda.md memory.\n\n` +
    `Always save important context to gruda.md. This is your long-term memory.\n\n` +
    (cfg.systemPrompt ? `## User Context\n${cfg.systemPrompt}\n\n` : "") +
    (memory ? `## Project Memory (gruda.md)\n${memory}\n\n` : "No project memory yet.\n\n") +
    (systemExtra || "") +
    `Be direct. When asked to build or create something — do it, don't describe it.`;

  let loopMsgs = [{ role:"system", content:system }, ...messages];
  const toolLog = [];
  let round = 0;

  while (round < 12) {
    round++;
    let ollamaRes;
    try {
      ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model, messages:loopMsgs, tools:TOOLS, stream:false }),
        signal: AbortSignal.timeout(120000),
      });
    } catch(err) { emit({ type:"error", message:`Ollama unreachable: ${err.message}` }); return res.end(); }

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

/* ── Chat stream (no tools) ──────────────────────────────────── */
app.post("/api/chat/stream", async (req, res) => {
  const { messages, model, system } = req.body;
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  const cfg = loadConfig();
  const sysContent = system || cfg.systemPrompt || "";
  const allMsgs = sysContent ? [{ role:"system", content:sysContent }, ...messages] : messages;
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
  const { answers, model } = req.body;
  /* Ask local AI to generate a personalized system prompt from the answers */
  let systemPrompt = "";
  try {
    const prompt =
      `Based on this user profile, write a concise AI assistant system prompt (3-5 sentences) that personalizes the assistant for them. Be specific. Return only the system prompt text, nothing else.\n\nUser profile:\n${JSON.stringify(answers, null, 2)}`;
    const r = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model: model || DEFAULT_MODEL, prompt, stream:false }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) { const d = await r.json(); systemPrompt = d.response?.trim() || ""; }
  } catch {}

  const cfg = loadConfig();
  cfg.onboarded    = true;
  cfg.onboardedAt  = new Date().toISOString();
  cfg.answers      = answers;
  cfg.systemPrompt = systemPrompt;
  cfg.displayName  = answers.name || "Agent";
  saveConfig(cfg);

  /* Create a default project with the answers saved in gruda.md */
  const projName = (answers.name || "My").replace(/\s+/g, "-") + "-workspace";
  const projPath = path.join(PROJECTS_DIR, projName);
  fs.mkdirSync(projPath, { recursive: true });
  const memContent =
    `# ${answers.name || "My"} Workspace\n\nCreated: ${new Date().toISOString()}\n\n` +
    `## About Me\n${answers.role || ""}\n\n` +
    `## Goals\n${answers.goals || ""}\n\n` +
    `## Projects I Work On\n${answers.projects || ""}\n\n` +
    `## AI Preferences\n${answers.preferences || ""}\n\n` +
    (systemPrompt ? `## Generated System Prompt\n${systemPrompt}\n` : "");
  fs.writeFileSync(path.join(projPath, "gruda.md"), memContent, "utf8");

  res.json({ ok:true, systemPrompt, defaultProject:{ name:projName, path:projPath } });
});

/* ── Models ──────────────────────────────────────────────────── */
app.get("/api/models", async (_req, res) => {
  try { const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal:AbortSignal.timeout(5000) }); res.json(await r.json()); }
  catch { res.json({ models:[] }); }
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
  const mem = path.join(p,"gruda.md");
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, `# ${name}\n\nCreated: ${new Date().toISOString()}\n\n## Notes\n\n`,"utf8");
  res.json({ ok:true, name, path:p });
});

app.get("/api/projects/:name/memory", (req, res) => {
  const m = path.join(PROJECTS_DIR, req.params.name, "gruda.md");
  res.json({ content: fs.existsSync(m) ? fs.readFileSync(m,"utf8") : "" });
});

/* ── History ─────────────────────────────────────────────────── */
app.get("/api/history", (_req,  res) => res.json({ sessions: loadHistory().slice(-20).reverse() }));
app.post("/api/history", (req, res) => { appendSession(req.body); res.json({ ok:true }); });

/* ── Config ──────────────────────────────────────────────────── */
app.get("/api/config",       (_req, res) => res.json(loadConfig()));
app.patch("/api/config", (req, res) => {
  const cfg = { ...loadConfig(), ...req.body };
  saveConfig(cfg);
  res.json({ ok:true, config:cfg });
});

/* ── Treaty Chat relay endpoint ──────────────────────────────── */
app.post("/api/treaty/send", (req, res) => {
  if (!treatyWs || treatyWs.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error:"Treaty Chat not connected" });
  }
  try { treatyWs.send(JSON.stringify(req.body)); res.json({ ok:true }); }
  catch(err) { res.status(500).json({ error:err.message }); }
});

app.get("/api/treaty/status", (_req, res) => {
  res.json({ connected: !!(treatyWs && treatyWs.readyState === WebSocket.OPEN), url: TREATY_URL });
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
  try { const r = await fetch(`${OLLAMA_HOST}/api/tags`); ollama = r.ok; } catch {}
  const treaty = !!(treatyWs && treatyWs.readyState === WebSocket.OPEN);
  res.json({ ok:true, ollama, treaty });
});


/* ═══════════════════════════════════════════════════════════════
   CLOUD INTEGRATIONS — Puter · Google Drive · GitHub · Vercel
   Tokens stored in ~/.gruda-agent/config.json (local only, never sent to us)
   ═══════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════
   IDE — Monaco code execution + file tree
   ═══════════════════════════════════════════════════════════════ */

/* ── Run code (Node.js sandbox) ──────────────────────────────── */
app.post("/api/ide/run", (req, res) => {
  const { code, lang = "javascript" } = req.body;
  if (!code) return res.status(400).json({ error: "code required" });

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
  const dir = req.query.dir || (activeProject ? path.join(PROJECTS_DIR, activeProject) : PROJECTS_DIR);
  const SKIP = new Set(["node_modules",".git","dist","build",".next","__pycache__",".DS_Store"]);
  function walk(d, depth=0) {
    if (depth > 6) return [];
    return fs.readdirSync(d, { withFileTypes:true })
      .filter(e => !SKIP.has(e.name) && !e.name.startsWith("."))
      .map(e => {
        const full = path.join(d, e.name);
        const isDir = e.isDirectory();
        return { name: e.name, path: full, isDir,
          ext: isDir ? null : path.extname(e.name).slice(1),
          children: isDir ? walk(full, depth+1) : null };
      });
  }
  let activeProject = null;
  try { res.json({ tree: walk(dir), root: dir }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Read/write file for IDE ────────────────────────────────── */
app.get("/api/ide/file", (req, res) => {
  const { p } = req.query;
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "not found" });
  res.json({ content: fs.readFileSync(p, "utf8"), path: p });
});

app.post("/api/ide/file", (req, res) => {
  const { p, content } = req.body;
  if (!p) return res.status(400).json({ error: "path required" });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content || "", "utf8");
  res.json({ ok: true });
});

/* ── AI snippet generation ───────────────────────────────────── */
app.post("/api/ide/snippet", async (req, res) => {
  const { prompt, lang = "javascript", model } = req.body;
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
    res.json({ code: d.message?.content || "", lang });
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

/* ═══════════════════════════════════════════════════════════════
   POSTGRES (optional) — falls back to JSON files when no DATABASE_URL
   ═══════════════════════════════════════════════════════════════ */
let pgPool = null;

if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    pgPool.query(`
      CREATE TABLE IF NOT EXISTS gruda_sessions (
        id SERIAL PRIMARY KEY, title TEXT, project TEXT, summary TEXT,
        messages JSONB, saved_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS gruda_config (
        key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).then(() => console.log("[gruda] Postgres connected")).catch(e => {
      console.warn("[gruda] Postgres init failed:", e.message); pgPool = null;
    });
  } catch(e) { console.warn("[gruda] pg not installed:", e.message); }
}

/* DB-backed history endpoints (replaces JSON when pg available) */
app.get("/api/history/pg", async (_req, res) => {
  if (!pgPool) return res.json({ sessions: loadHistory().slice(-20).reverse(), source:"file" });
  const r = await pgPool.query("SELECT * FROM gruda_sessions ORDER BY saved_at DESC LIMIT 20");
  res.json({ sessions: r.rows, source:"postgres" });
});

app.post("/api/history/pg", async (req, res) => {
  if (!pgPool) { appendSession(req.body); return res.json({ ok:true, source:"file" }); }
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

/* ── Static ──────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname,"public")));

/* ── WebSocket (browser clients) ─────────────────────────────── */
wss.on("connection", (ws) => {
  const cfg = loadConfig();
  ws.send(JSON.stringify({ type:"connected", displayName: cfg.displayName || null }));
  ws.on("error", ()=>{});
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

/* ── Start ───────────────────────────────────────────────────── */
server.listen(PORT, () => {
  console.log(`[gruda-agent] Running at http://localhost:${PORT}`);
});

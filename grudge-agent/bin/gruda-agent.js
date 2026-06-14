#!/usr/bin/env node
/**
 * GRUDA Agent CLI
 * Usage: npx gruda-agent [--port 3200] [--no-open]
 * Grudge Studio — RacAlvin The Pirate King
 */
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs   = require("fs");

const args    = process.argv.slice(2);
const PORT    = (() => { const i = args.indexOf("--port"); return i > -1 ? parseInt(args[i+1]) : 3200; })();
const NO_OPEN = args.includes("--no-open");

const ROOT = path.join(__dirname, "..");

// Ensure .env exists
const envFile = path.join(ROOT, ".env");
const envEx   = path.join(ROOT, ".env.example");
if (!fs.existsSync(envFile) && fs.existsSync(envEx)) {
  fs.copyFileSync(envEx, envFile);
  console.log("[gruda-agent] Created .env from .env.example");
}

console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   GRUDA AGENT  v${require(path.join(ROOT,"package.json")).version.padEnd(8)}                  ║
  ║   Grudge Studio · Local AI · No Cloud         ║
  ╚═══════════════════════════════════════════════╝

  Starting on http://localhost:${PORT}
  Press Ctrl+C to stop.
`);

// Check Ollama
let ollamaRunning = false;
try {
  execSync("curl -sf http://127.0.0.1:11434/api/tags", { stdio: "ignore" });
  ollamaRunning = true;
} catch {}

if (!ollamaRunning) {
  console.log("  [!] Ollama not running. Starting...");
  try {
    const o = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
    o.unref();
    // give it a moment
    execSync("node -e \"setTimeout(()=>{},3000)\"");
  } catch {
    console.log("  [!] Could not start Ollama. Install from https://ollama.com");
    console.log("      Then run: ollama pull mistral");
  }
}

// Open browser after a short delay
if (!NO_OPEN) {
  setTimeout(() => {
    const url = `http://localhost:${PORT}`;
    const open = process.platform === "win32"  ? ["cmd",  ["/c", "start", url]]
               : process.platform === "darwin" ? ["open", [url]]
               : ["xdg-open", [url]];
    try { spawn(open[0], open[1], { detached: true, stdio: "ignore" }).unref(); } catch {}
  }, 2000);
}

// Start the server
process.env.PORT = String(PORT);
require(path.join(ROOT, "server.js"));

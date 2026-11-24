#!/usr/bin/env node
/**
 * GRUDA Agent CLI
 * Usage: npx gruda-agent [--port 3200] [--no-open]
 * Grudge Studio — RacAlvin The Pirate King
 */
const { spawn } = require("child_process");
const path = require("path");
const fs   = require("fs");
const os   = require("os");

const args    = process.argv.slice(2);
const PORT    = (() => { const i = args.indexOf("--port"); return i > -1 ? parseInt(args[i + 1], 10) : 3200; })();
const NO_OPEN = args.includes("--no-open");

const ROOT = path.join(__dirname, "..");

function defaultDataDir() {
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

const homeEnv = path.join(defaultDataDir(), ".env");
const legacyEnv = path.join(os.homedir(), ".gruda-agent", ".env");
const envFile = path.join(ROOT, ".env");
const envEx   = path.join(ROOT, ".env.example");
if (fs.existsSync(homeEnv)) {
  require("dotenv").config({ path: homeEnv });
} else if (fs.existsSync(legacyEnv)) {
  require("dotenv").config({ path: legacyEnv });
} else if (!fs.existsSync(envFile) && fs.existsSync(envEx)) {
  fs.copyFileSync(envEx, envFile);
  console.log("[gruda-agent] Created .env from .env.example");
}

async function ollamaUp() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   GRUDA AGENT  v${require(path.join(ROOT, "package.json")).version.padEnd(8)}                  ║
  ║   Grudge Studio · Local + Cloud AI            ║
  ╚═══════════════════════════════════════════════╝

  Starting on http://localhost:${PORT}
  Press Ctrl+C to stop.
`);

  if (!(await ollamaUp())) {
    console.log("  [!] Ollama not running — trying to start...");
    try {
      const o = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
      o.unref();
      await new Promise((r) => setTimeout(r, 3000));
      if (!(await ollamaUp())) {
        console.log("  [!] Ollama unavailable. Use Puter models in-browser or set GRUDGE_AI_KEY in " + defaultDataDir() + "/.env");
      }
    } catch {
      console.log("  [!] Ollama not installed. Install from https://ollama.com or use cloud models.");
    }
  }

  if (!NO_OPEN) {
    setTimeout(() => {
      const url = `http://127.0.0.1:${PORT}`;
      const open = process.platform === "win32"  ? ["cmd",  ["/c", "start", url]]
                 : process.platform === "darwin" ? ["open", [url]]
                 : ["xdg-open", [url]];
      try { spawn(open[0], open[1], { detached: true, stdio: "ignore" }).unref(); } catch {}
    }, 2000);
  }

  process.env.PORT = String(PORT);
  // The CLI is the owner's own machine: trust loopback requests as the local
  // owner (opt-in; server.js never does this on its own). The server binds
  // 127.0.0.1 unless GRUDA_HOST says otherwise.
  if (process.env.GRUDA_LOCAL_TRUST == null) process.env.GRUDA_LOCAL_TRUST = "1";
  require(path.join(ROOT, "server.js"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
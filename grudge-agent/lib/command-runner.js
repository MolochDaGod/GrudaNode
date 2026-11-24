/**
 * Local-only command runner for the gruda-agent CLI (never on the cloud host).
 * Parses the command into argv and runs it with execFileSync (no shell), so
 * ; && | ` $( ) and redirects are plain arguments, not shell syntax.
 * On Windows, npm/npx/pnpm are .cmd shims that Node only starts through cmd.exe,
 * so there every argument is also checked against cmd metacharacters.
 */
"use strict";
const { execFileSync } = require("child_process");

const ALLOWED_BINS = new Set(["npm", "npx", "pnpm", "node", "git", "python", "python3", "py", "ollama", "ls"]);
const WIN_CMD_SHIMS = new Set(["npm", "npx", "pnpm"]);
const WIN_META = /[&|<>^%!"`;()\r\n]/;

function splitArgv(command) {
  const out = [];
  let cur = "", quote = null, had = false;
  const s = String(command || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; else cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; had = true; continue; }
    if (/\s/.test(c)) { if (had) out.push(cur); cur = ""; had = false; continue; }
    cur += c; had = true;
  }
  if (quote) throw new Error("unterminated quote");
  if (had) out.push(cur);
  return out;
}

function checkCommand(command) {
  const c = String(command || "").trim();
  if (!c || c.length > 500) throw new Error("command required (max 500 chars)");
  if (/[\r\n\0]/.test(c)) throw new Error("multi-line commands are not allowed");
  const argv = splitArgv(c);
  const bin = (argv[0] || "").toLowerCase();
  if (!ALLOWED_BINS.has(bin)) throw new Error(`not allowed: ${argv[0]} (allowed: ${[...ALLOWED_BINS].join(", ")})`);
  if (process.platform === "win32" && WIN_CMD_SHIMS.has(bin) && argv.some((a) => WIN_META.test(a))) {
    throw new Error("shell characters are not allowed in arguments");
  }
  return argv;
}

function runCommand(command, opts) {
  opts = opts || {};
  if (process.env.VERCEL) throw new Error("commands are disabled on the cloud host; run `npx gruda-agent` locally");
  const argv = checkCommand(command);
  const bin = argv[0].toLowerCase();
  const useCmdShim = process.platform === "win32" && WIN_CMD_SHIMS.has(bin);
  return execFileSync(useCmdShim ? `${bin}.cmd` : argv[0], argv.slice(1), {
    cwd: opts.cwd,
    timeout: opts.timeout || 30000,
    encoding: "utf8",
    stdio: "pipe",
    shell: useCmdShim, // Windows .cmd shims only; arguments were checked above
    windowsHide: true,
  });
}

module.exports = { runCommand, checkCommand, splitArgv, ALLOWED_BINS };

// Run: npm test   (node --test test/)
// Boots the real Express app in cloud mode (VERCEL=1) against a temp dir and a
// fake Puter whoami server, then checks findings #2–#4 stay fixed.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gruda-sec-"));
const ADMIN_KEY = "test-admin-key-" + crypto.randomBytes(8).toString("hex");
const JWT_SECRET = "test-jwt-secret";
const JWT_ISSUER = "https://id.test.invalid";
const USERS = {
  "tok-alice": { uuid: "uuid-alice", username: "alice" },
  "tok-boss": { uuid: "uuid-boss", username: "boss" },
};

let whoami, server, base;
const relayed = [];

function jwt(payload, { alg = "HS256", secret = JWT_SECRET } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg, typ: "JWT" });
  const body = enc({ iss: JWT_ISSUER, ...payload });
  const sig = alg === "none" ? "" : crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function call(method, url, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const tool = (token, tool, args, extra) => call("POST", "/api/agent/tool", { token, body: { tool, args, ...(extra || {}) } });

before(async () => {
  whoami = http.createServer((req, res) => {
    if (!req.url.startsWith("/whoami")) { relayed.push(req.url); res.writeHead(404); return res.end("{}"); }
    const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const u = USERS[tok];
    res.writeHead(u ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(u || { error: "bad token" }));
  });
  await new Promise((r) => whoami.listen(0, "127.0.0.1", r));
  Object.assign(process.env, {
    VERCEL: "1",
    TMPDIR: TMP, TMP: TMP, TEMP: TMP,
    PUTER_WHOAMI_URL: `http://127.0.0.1:${whoami.address().port}/whoami`,
    // Keep the test hermetic: Treaty relays go to the local fake, never a real service.
    GRUDGE_SOCIAL_URL: `http://127.0.0.1:${whoami.address().port}`,
    TREATY_CHAT_URL: `http://127.0.0.1:${whoami.address().port}`,
    MASTER_NODE_URL: "",
    GRUDA_AGENT_ADMIN_KEY: ADMIN_KEY,
    GRUDGE_JWT_SECRET: JWT_SECRET,
    GRUDGE_JWT_ISSUER: JWT_ISSUER,
    GRUDA_ADMIN_PUTER_USERS: "boss",
    DATABASE_URL: "",
    XAI_API_KEY: "",
  });
  const app = require("../server.js");
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server && server.close();
  whoami && whoami.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test("#2 agent tools need sign-in", async () => {
  const r = await tool(null, "read_file", { path: "/proc/self/environ" });
  assert.equal(r.status, 401);
  assert.equal((await tool("tok-nobody", "list_directory", {})).status, 401);
});

test("#2 read_file cannot leave the workspace", async () => {
  for (const p of ["/proc/self/environ", "/etc/passwd", "../../../../etc/passwd", ".env", "sub/.git/config", "prod.env", "id_rsa"]) {
    const r = await tool("tok-alice", "read_file", { path: p });
    assert.equal(r.status, 200, p);
    assert.ok(r.json.result.error, `${p} should be refused, got ${JSON.stringify(r.json.result).slice(0, 80)}`);
    assert.equal(r.json.result.content, undefined, p);
  }
});

test("#2 write_file stays inside; normal files work", async () => {
  const w = await tool("tok-alice", "write_file", { path: "demo/hello.txt", content: "hi" });
  assert.equal(w.json.result.ok, true);
  const r = await tool("tok-alice", "read_file", { path: "demo/hello.txt" });
  assert.equal(r.json.result.content, "hi");
  for (const p of ["/tmp/pwned.txt", "../escape.txt", ".bashrc", "x/.env"]) {
    const bad = await tool("tok-alice", "write_file", { path: p, content: "x" });
    assert.ok(bad.json.result.error, p);
  }
  assert.ok(!fs.existsSync(path.join(TMP, "escape.txt")));
});

test("#2 symlinks cannot escape the workspace", async () => {
  const root = path.join(TMP, "gruda-projects");
  fs.mkdirSync(root, { recursive: true });
  try { fs.symlinkSync("/etc", path.join(root, "etc-link")); } catch {}
  const r = await tool("tok-alice", "read_file", { path: "etc-link/hostname" });
  assert.ok(r.json.result.error);
  assert.match(r.json.result.error, /outside workspace/);
});

test("#2 projectDir in the body is ignored", async () => {
  const r = await tool("tok-alice", "list_directory", {}, { projectDir: "/etc" });
  assert.ok(!r.json.result.entries.some((e) => e.name === "passwd"));
});

test("#2 commands and terminal are off on the cloud host, even for admins", async () => {
  const r = await tool(ADMIN_KEY, "run_command", { command: "node -e 1" });
  assert.match(r.json.result.error, /only available in the local agent/);
  const t = await call("POST", "/api/terminal/exec", { token: ADMIN_KEY, body: { command: "node -v" } });
  assert.equal(t.status, 503);
  assert.equal((await call("POST", "/api/terminal/exec", { body: { command: "node -v" } })).status, 401);
});

test("#2 open_url blocks private and metadata addresses", async () => {
  for (const url of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:1/", "http://localhost/", "file:///etc/passwd", "http://10.0.0.1/"]) {
    const r = await tool("tok-alice", "open_url", { url });
    assert.ok(r.json.result.error, url);
  }
});

test("#3 write routes need sign-in", async () => {
  const cases = [
    ["PATCH", "/api/config", { x: 1 }],
    ["POST", "/api/ide/file", { path: "a.txt", content: "x" }],
    ["GET", "/api/ide/file?path=a.txt"],
    ["GET", "/api/ide/tree"],
    ["POST", "/api/projects", { name: "p" }],
    ["POST", "/api/projects/p/memory", { content: "x" }],
    ["POST", "/api/insights/growth", { content: "x" }],
    ["POST", "/api/insights/sync", { insights: {} }],
    ["POST", "/api/history", { title: "x" }],
    ["POST", "/api/integrations/github", { token: "x" }],
    ["DELETE", "/api/integrations/github"],
    ["POST", "/api/deploy/github", {}],
    ["POST", "/api/upload"],
    ["GET", "/api/config"],
  ];
  for (const [m, u, b] of cases) {
    const r = await call(m, u, { body: b });
    assert.equal(r.status, 401, `${m} ${u}`);
  }
});

test("#3 shared config and stored tokens are admin-only", async () => {
  assert.equal((await call("PATCH", "/api/config", { token: "tok-alice", body: { x: 1 } })).status, 403);
  assert.equal((await call("POST", "/api/integrations/github", { token: "tok-alice", body: { token: "x" } })).status, 403);
  const ok = await call("PATCH", "/api/config", { token: "tok-boss", body: { integrations: { github: { token: "ghp_secret", user: "boss" } }, apiToken: "zzz" } });
  assert.equal(ok.status, 200);
  const asUser = await call("GET", "/api/config", { token: "tok-alice" });
  assert.equal(asUser.status, 200);
  assert.equal(asUser.json.integrations.github.token, undefined);
  assert.equal(asUser.json.integrations.github.connected, true);
  assert.equal(asUser.json.apiToken, undefined);
  const asAdmin = await call("GET", "/api/config", { token: ADMIN_KEY });
  assert.equal(asAdmin.json.integrations.github.token, "ghp_secret");
});

test("#3 signed-in users can still use project routes", async () => {
  const r = await call("POST", "/api/projects", { token: "tok-alice", body: { name: "alpha" } });
  assert.equal(r.status, 200);
  const f = await call("POST", "/api/ide/file", { token: "tok-alice", body: { path: "alpha/x.js", content: "1" } });
  assert.equal(f.status, 200);
  const bad = await call("POST", "/api/ide/file", { token: "tok-alice", body: { path: "/proc/self/environ", content: "1" } });
  assert.equal(bad.status, 400);
  const rd = await call("GET", "/api/ide/file?path=" + encodeURIComponent("/proc/self/environ"), { token: "tok-alice" });
  assert.equal(rd.status, 404);
});

test("#4 Treaty send needs sign-in and ignores the body's sender", async () => {
  assert.equal((await call("POST", "/api/treaty/room/general/send", { body: { text: "hi", grudgeId: "victim", username: "victim" } })).status, 401);
  assert.equal((await call("POST", "/api/treaty/send", { body: { text: "hi", grudgeId: "victim" } })).status, 401);
  const r = await call("POST", "/api/treaty/room/general/send", {
    token: "tok-alice", body: { text: "hello", grudgeId: "victim", uuid: "victim", username: "victim", displayName: "Victim" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.message.from.username, "alice");
  assert.equal(r.json.message.from.puterUuid, "uuid-alice");
  assert.equal(r.json.message.from.grudgeId, null);
  assert.equal(r.json.message.from.verified, true);
  assert.ok(relayed.some((u) => u.startsWith("/api/chat/send")), "relay went to the local fake");
});

test("#4 Treaty sender from a GrudgeID token", async () => {
  const tok = jwt({ grudge_id: "GRD-42", username: "warchief", exp: Math.floor(Date.now() / 1000) + 600 });
  const r = await call("POST", "/api/treaty/send", { token: tok, body: { text: "for the clan", grudgeId: "someone-else" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.message.from.grudgeId, "GRD-42");
  assert.equal(r.json.message.from.username, "warchief");
});

test("GrudgeID JWT rules: needs exp, HS256, right secret", async () => {
  const now = Math.floor(Date.now() / 1000);
  const send = (t) => call("POST", "/api/treaty/send", { token: t, body: { text: "x" } });
  assert.equal((await send(jwt({ grudge_id: "a" }))).status, 401, "no exp");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now - 10 }))).status, 401, "expired");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now + 60 }, { alg: "none" }))).status, 401, "alg none");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now + 60 }, { secret: "wrong" }))).status, 401, "bad sig");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now + 60, iss: "https://evil.example" }))).status, 401, "wrong issuer");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now + 60, iss: undefined }))).status, 401, "no issuer");
  assert.equal((await send(jwt({ grudge_id: "a", exp: now + 60 }))).status, 200, "valid");
});

test("public reads still work without sign-in", async () => {
  assert.equal((await call("GET", "/api/treaty/rooms")).status, 200);
  assert.equal((await call("GET", "/api/treaty/room/general/messages")).status, 200);
  assert.equal((await call("GET", "/api/agent/tools")).status, 200);
});

test("Builder/GrudgeID admin claims are not gruda-agent admin; admin key and Puter list are", async () => {
  // Jonathan, Nov 24 2026: Builder admins do NOT become Gruda agent admins.
  const exp = Math.floor(Date.now() / 1000) + 600;
  const claims = [{ role: "admin" }, { role: "master" }, { isAdmin: true }, { role: "master_admin", isAdmin: true }, { tier: "admin" }];
  for (const extra of claims) {
    const tok = jwt({ userId: "u-9", grudgeId: "GRD-9", username: "builder-boss", exp, ...extra });
    const label = JSON.stringify(extra);
    assert.equal((await call("PATCH", "/api/config", { token: tok, body: { displayName: "nope" } })).status, 403, "PATCH config " + label);
    assert.equal((await call("POST", "/api/integrations/github", { token: tok, body: { token: "x" } })).status, 403, "integrations " + label);
    assert.equal((await call("GET", "/api/deploy/github/repos", { token: tok })).status, 403, "repo list " + label);
    // still a signed-in user
    assert.equal((await call("GET", "/api/config", { token: tok })).status, 200, "user route " + label);
    const t = await tool(tok, "list_directory", {});
    assert.equal(t.status, 200, "agent tool " + label);
  }
  const cfg = await call("GET", "/api/config", { token: ADMIN_KEY });
  assert.notEqual(cfg.json && cfg.json.displayName, "nope", "config unchanged");
  // the two real admin paths still work
  assert.equal((await call("PATCH", "/api/config", { token: ADMIN_KEY, body: {} })).status, 200, "admin key");
  assert.equal((await call("PATCH", "/api/config", { token: "tok-boss", body: {} })).status, 200, "Puter admin list");
  assert.equal((await call("PATCH", "/api/config", { token: "tok-alice", body: {} })).status, 403, "Puter non-admin");
});

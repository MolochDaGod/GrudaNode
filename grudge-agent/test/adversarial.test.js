// Verdict's adversarial checks (verdict-adv/adv.test.js, review of 7673f817),
// adapted into asserting tests for B1, B2, B3, M1, M2, M5 and L1. Boots the
// real app in cloud mode against a temp dir and a fake Puter whoami server.
// No network: every outbound call goes to 127.0.0.1 fakes.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gruda-adv-"));
const ADMIN_KEY = "adv-admin-" + crypto.randomBytes(6).toString("hex");
const USERS = {
  "tok-alice": { uuid: "uuid-alice", username: "alice" },
  "tok-temp": { uuid: "uuid-temp", username: "temp_123", is_temp: true },
  "tok-BOSSCASE": { uuid: "u-b2", username: "Boss" },
  "tok-bossy": { uuid: "u-b3", username: "bossy" },
};
let whoami, server, base;
const unhandled = [];
const onUnhandled = (r) => unhandled.push(String(r && r.message || r));

async function call(method, url, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(4000) });
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, json };
  } catch (e) { return { status: "ERR:" + e.name, json: null }; }
}

/** Raw request path, untouched by fetch()/URL normalization (needed for %2e%2e). */
function raw(method, rawPath, token) {
  return new Promise((ok) => {
    const u = new URL(base);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const q = http.request({ host: u.hostname, port: u.port, method, path: rawPath, headers }, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(d); } catch {} ok({ status: res.statusCode, json: j, text: d }); });
    });
    q.on("error", (e) => ok({ status: "ERR:" + e.code, json: null, text: "" }));
    q.setTimeout(4000, () => q.destroy());
    q.end();
  });
}

const tool = (token, name, args) => call("POST", "/api/agent/tool", { token, body: { tool: name, args } }).then((r) => r.json && r.json.result);

before(async () => {
  process.on("unhandledRejection", onUnhandled);
  whoami = http.createServer((req, res) => {
    const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const u = req.url.startsWith("/whoami") ? USERS[tok] : null;
    res.writeHead(u ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(u || {}));
  });
  await new Promise((r) => whoami.listen(0, "127.0.0.1", r));
  const p = whoami.address().port;
  Object.assign(process.env, {
    VERCEL: "1", TMPDIR: TMP, TMP, TEMP: TMP,
    PUTER_WHOAMI_URL: `http://127.0.0.1:${p}/whoami`,
    GRUDGE_SOCIAL_URL: `http://127.0.0.1:${p}`, TREATY_CHAT_URL: `http://127.0.0.1:${p}`, MASTER_NODE_URL: "",
    GRUDA_AGENT_ADMIN_KEY: ADMIN_KEY, GRUDGE_JWT_SECRET: "adv-jwt", GRUDGE_JWT_ISSUER: "https://id.test.invalid",
    GRUDA_ADMIN_PUTER_USERS: " boss ", DATABASE_URL: "", XAI_API_KEY: "",
  });
  const app = require("../server.js");
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  process.off("unhandledRejection", onUnhandled);
  server && server.close();
  whoami && whoami.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* ── B1: case / slash variants can't skip the gate ───────────────── */
test("A1/B1 case-variant paths need sign-in (agent tool)", async () => {
  for (const u of ["/api/agent/tool", "/API/agent/tool", "/api/Agent/Tool", "/Api/AGENT/tool"]) {
    const r = await call("POST", u, { body: { tool: "write_file", args: { path: "pwn.txt", content: "x" } } });
    assert.equal(r.status, 401, u);
  }
  const root = path.join(TMP, "gruda-projects");
  assert.equal(fs.existsSync(path.join(root, "pwn.txt")), false, "nothing written");
});

test("A2/B1 PATCH /API/CONFIG without a token is refused and config is unchanged", async () => {
  const r = await call("PATCH", "/API/CONFIG", { body: { displayName: "pwned-by-verdict" } });
  assert.equal(r.status, 401);
  const g = await call("GET", "/api/config", { token: "tok-alice" });
  assert.equal(g.status, 200);
  assert.notEqual(g.json && g.json.displayName, "pwned-by-verdict");
  // a signed-in non-admin with a case variant still gets 403, not through
  assert.equal((await call("PATCH", "/Api/Config", { token: "tok-alice", body: { displayName: "x" } })).status, 403);
});

test("A4/B1 trailing slash, double slash and encoded slash variants", async () => {
  const body = { tool: "list_directory", args: {} };
  assert.equal((await call("POST", "/api/agent/tool/", { body })).status, 401);
  assert.equal((await call("POST", "/API/AGENT/TOOL/", { body })).status, 401);
  const dbl = await raw("POST", "//api//agent/tool");
  assert.ok(dbl.status === 401 || dbl.status === 404, "double slash: " + dbl.status);
  assert.equal((await raw("POST", "/api/agent/tool%2f")).status, 400);
  assert.equal((await raw("POST", "/api/agent%2ftool")).status, 400);
  assert.equal((await raw("GET", "/api/%zz")).status, 400, "bad escape");
});

test("B1 deny by default: an unlisted /api route needs sign-in", async () => {
  // GET /api/history and /api/projects are not on the public list
  assert.equal((await call("GET", "/api/history")).status, 401);
  assert.equal((await call("GET", "/api/projects")).status, 401);
  assert.equal((await call("GET", "/api/no-such-route")).status, 401);
  assert.equal((await call("GET", "/api/no-such-route", { token: "tok-alice" })).status, 404);
  // listed public routes still work, in any case the gate sees
  assert.equal((await call("GET", "/api/health")).status, 200);
});

test("B1 case-sensitive + strict routing: variants never reach a handler", async () => {
  const r = await call("POST", "/API/agent/tool", { token: "tok-alice", body: { tool: "list_directory", args: {} } });
  assert.equal(r.status, 404, "authenticated case variant falls through to 404");
  const s = await call("POST", "/api/agent/tool/", { token: "tok-alice", body: { tool: "list_directory", args: {} } });
  assert.equal(s.status, 404, "trailing slash does not match the route");
});

/* ── B3: Treaty send never crashes or hangs ───────────────────────── */
test("A3/B3 Treaty send with no identity returns 401, no hang, no unhandled rejection", async () => {
  const before = unhandled.length;
  for (const u of ["/api/Treaty/Send", "/api/treaty/send", "/api/treaty/room/general/send", "/API/TREATY/ROOM/general/SEND"]) {
    const r = await call("POST", u, { body: { text: "hi", grudgeId: "victim", username: "jonathan" } });
    assert.equal(r.status, 401, u);
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(unhandled.length, before, "no unhandledRejection: " + unhandled.slice(before).join(", "));
  assert.equal((await call("GET", "/api/health")).status, 200, "server still up");
});

test("B3 a throwing async handler becomes a JSON 5xx, not a hang", async () => {
  const { installAsyncGuard, errorHandler } = require("../lib/async-guard");
  const express = require("express");
  const app = express();
  installAsyncGuard(app);
  app.get("/boom", async () => { throw new Error("kaboom"); });
  app.get("/sync", () => { const e = new Error("bad"); e.status = 400; throw e; });
  app.use(errorHandler);
  const s = http.createServer(app);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const orig = console.error; console.error = () => {};
  try {
    const r1 = await fetch(b + "/boom", { signal: AbortSignal.timeout(3000) });
    assert.equal(r1.status, 500);
    assert.deepEqual(await r1.json(), { error: "internal error" }, "no message leak on 5xx");
    const r2 = await fetch(b + "/sync", { signal: AbortSignal.timeout(3000) });
    assert.equal(r2.status, 400);
  } finally { console.error = orig; s.close(); }
});

/* ── B2: project id traversal ───────────────────────────────────── */
test("T1/B2 GET /api/projects/%2e%2e/files can't read config.json (raw path)", async () => {
  await call("PATCH", "/api/config", { token: ADMIN_KEY, body: { integrations: { github: { token: "DUMMY_GH_TOKEN_FOR_TEST", user: "x" } } } });
  for (const tok of [undefined, "tok-alice", ADMIN_KEY]) {
    for (const p of ["/api/projects/%2e%2e/files", "/api/projects/%2E%2E/files", "/api/projects/..%2f..%2f..%2fetc/files",
                     "/api/projects/%2e%2e/memory", "/api/projects/%252e%252e/files", "/api/projects/..%5c..%5cetc/files"]) {
      const r = await raw("GET", p, tok);
      assert.ok([400, 401, 404].includes(r.status), `${p} (${tok ? "auth" : "anon"}) → ${r.status}`);
      assert.ok(!r.text.includes("DUMMY_GH_TOKEN_FOR_TEST"), `${p} leaked the stored token`);
    }
  }
  // plain .. in the raw path (not normalized by a client) is refused too
  const dots = await raw("GET", "/api/projects/../files", "tok-alice");
  assert.ok([400, 404].includes(dots.status), "raw .. → " + dots.status);
  assert.ok(!dots.text.includes("DUMMY_GH_TOKEN_FOR_TEST"));
});

test("B2 project names are confined: dot names refused, normal names work", async () => {
  for (const bad of ["..", ".", "...", ".hidden", "a/..", "con fig."]) {
    const r = await call("POST", "/api/projects/" + encodeURIComponent(bad) + "/memory", { token: "tok-alice", body: { content: "x" } });
    assert.ok([400, 404].includes(r.status), `${bad} → ${r.status}`);
  }
  const mk = await call("POST", "/api/projects", { token: "tok-alice", body: { name: ".." } });
  assert.equal(mk.status, 200, "unsafe name is sanitized into a safe folder");
  assert.notEqual(mk.json.name, "..");
  assert.equal(fs.existsSync(path.join(TMP, "gruda.md")), false, "nothing written above the projects root");
  const ok = await call("POST", "/api/projects/my-game/memory", { token: "tok-alice", body: { content: "hello" } });
  assert.equal(ok.status, 200);
  const rd = await call("GET", "/api/projects/my-game/memory", { token: "tok-alice" });
  assert.equal(rd.json.content, "hello");
  const files = await call("GET", "/api/projects/my-game/files", { token: "tok-alice" });
  assert.equal(files.status, 200);
  assert.equal((await call("GET", "/api/projects/my-game/files")).status, 401, "project reads need sign-in");
});

/* ── P1 / L1: workspace jail and symlinks ───────────────────────── */
test("P1 jail: prefix sibling, absolute, NUL, backslash, env and git files, /proc", async () => {
  const root = path.join(TMP, "gruda-projects");
  fs.mkdirSync(root + "-evil", { recursive: true });
  fs.writeFileSync(path.join(root + "-evil", "s.txt"), "secret");
  const cases = {
    sibling: await tool("tok-alice", "read_file", { path: "../gruda-projects-evil/s.txt" }),
    abs: await tool("tok-alice", "read_file", { path: "/etc/passwd" }),
    nul: await tool("tok-alice", "read_file", { path: "a\u0000.txt" }),
    backslash: await tool("tok-alice", "read_file", { path: "..\\..\\..\\etc\\passwd" }),
    envLocal: await tool("tok-alice", "write_file", { path: "app/.env.local", content: "x" }),
    envPlain: await tool("tok-alice", "write_file", { path: "prod.env", content: "x" }),
    gitcfg: await tool("tok-alice", "write_file", { path: ".git/config", content: "x" }),
    procSelf: await tool("tok-alice", "read_file", { path: "/proc/self/environ" }),
  };
  for (const [k, v] of Object.entries(cases)) {
    assert.ok(v && v.error, `${k} should be refused: ${JSON.stringify(v)}`);
    assert.ok(!JSON.stringify(v).includes("secret"), k);
  }
});

test("P2/L1 symlinks: dangling link write and link to .env read are refused", async () => {
  const root = path.join(TMP, "gruda-projects");
  fs.mkdirSync(root, { recursive: true });
  const outside = path.join(TMP, "outside-target.txt");
  fs.symlinkSync(outside, path.join(root, "dangling"));
  fs.writeFileSync(path.join(root, ".env"), "SECRET=1");
  fs.symlinkSync(".env", path.join(root, "innocent.txt"));
  fs.mkdirSync(path.join(TMP, "outside-dir"), { recursive: true });
  fs.symlinkSync(path.join(TMP, "outside-dir"), path.join(root, "linkdir"));
  const w = await tool("tok-alice", "write_file", { path: "dangling", content: "ESCAPED" });
  assert.ok(w && w.error, "dangling write refused: " + JSON.stringify(w));
  assert.equal(fs.existsSync(outside), false, "nothing written outside the workspace");
  const w2 = await tool("tok-alice", "write_file", { path: "linkdir/x.txt", content: "ESCAPED" });
  assert.ok(w2 && w2.error, "write through a dir link refused");
  assert.equal(fs.existsSync(path.join(TMP, "outside-dir", "x.txt")), false);
  const rd = await tool("tok-alice", "read_file", { path: "innocent.txt" });
  assert.ok(rd && rd.error, "link to .env refused: " + JSON.stringify(rd));
  assert.ok(!JSON.stringify(rd).includes("SECRET=1"));
  const ide = await call("POST", "/api/ide/file", { token: "tok-alice", body: { path: "dangling", content: "ESCAPED" } });
  assert.equal(ide.status, 400, "IDE write through a link refused");
  assert.equal(fs.existsSync(outside), false);
});

/* ── M1: URL guard ───────────────────────────────────────────────── */
test("U1/M1 url guard blocks mapped IPv6, fec0, nip.io-style and DNS-private hosts", async () => {
  const { checkPublicUrl, assertPublicUrl } = require("../lib/url-guard");
  const blocked = (u) => { try { checkPublicUrl(u); return false; } catch { return true; } };
  for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://127.0.0.1.nip.io/",
                   "http://2130706433/", "http://[fec0::1]/", "http://[fd12::1]/", "http://[fe80::1]/", "http://[::1]/",
                   "http://10-0-0-1.sslip.io/", "http://169.254.169.254/latest/meta-data", "http://metadata.google.internal/",
                   "http://[64:ff9b::a9fe:a9fe]/", "http://0x7f000001/", "http://user:pw@example.com/", "file:///etc/passwd"]) {
    assert.ok(blocked(u), "should block " + u);
  }
  assert.equal(blocked("https://example.com/"), false);
  const fake = (addrs) => (h, o, cb) => cb(null, addrs.map((a) => ({ address: a, family: a.includes(":") ? 6 : 4 })));
  await assert.rejects(assertPublicUrl("http://rebind.example/", { lookup: fake(["93.184.216.34", "10.0.0.5"]) }), /blocked/, "any private address blocks");
  await assert.rejects(assertPublicUrl("http://v6.example/", { lookup: fake(["::ffff:7f00:1"]) }), /blocked/);
  await assert.rejects(assertPublicUrl("http://ula.example/", { lookup: fake(["fd00::1"]) }), /blocked/);
  assert.equal(await assertPublicUrl("http://ok.example/", { lookup: fake(["93.184.216.34"]) }), "http://ok.example/");
});

test("M1 open_url refuses a hostname that resolves to loopback (real DNS for localhost names)", async () => {
  const r = await tool("tok-alice", "open_url", { url: base.replace("127.0.0.1", "localhost") + "/api/health" });
  assert.ok(r && r.error, JSON.stringify(r));
  const r2 = await tool("tok-alice", "open_url", { url: base + "/api/health" });
  assert.ok(r2 && r2.error, JSON.stringify(r2));
});

/* ── M2: temp Puter accounts ─────────────────────────────────────── */
test("I1/M2 temp Puter users are not signed in; admin allowlist is exact", async () => {
  const tmp = await call("POST", "/api/agent/tool", { token: "tok-temp", body: { tool: "list_directory", args: {} } });
  assert.equal(tmp.status, 401, "temp user");
  assert.equal((await call("POST", "/api/treaty/send", { token: "tok-temp", body: { text: "hi" } })).status, 401);
  assert.equal((await call("PATCH", "/api/config", { token: "tok-BOSSCASE", body: {} })).status, 200, "Boss matches boss");
  assert.equal((await call("PATCH", "/api/config", { token: "tok-bossy", body: {} })).status, 403, "no substring match");
});

/* ── M5: token-backed lists and history ─────────────────────────── */
test("M5 GitHub/Vercel lists are admin-only; history needs sign-in", async () => {
  for (const u of ["/api/deploy/github/repos", "/api/deploy/vercel/list"]) {
    assert.equal((await call("GET", u)).status, 401, u + " anon");
    assert.equal((await call("GET", u, { token: "tok-alice" })).status, 403, u + " user");
    assert.equal((await call("GET", "/API" + u.slice(4))).status, 401, u + " case variant");
  }
  for (const u of ["/api/history", "/api/history/pg"]) {
    assert.equal((await call("GET", u)).status, 401, u);
    assert.equal((await call("GET", u, { token: "tok-alice" })).status, 200, u + " signed in");
  }
});

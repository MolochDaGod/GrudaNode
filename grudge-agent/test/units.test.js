"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveInside } = require("../lib/safe-path");
const { checkCommand, splitArgv } = require("../lib/command-runner");
const { policyFor } = require("../lib/route-policy");
const auth = require("../lib/auth");

test("safe-path: inside ok, escapes refused, system roots refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sp-"));
  assert.equal(resolveInside(root, "a/b.txt"), path.join(fs.realpathSync(root), "a/b.txt"));
  for (const p of ["../x", "/etc/passwd", ".env", "a/.git/config", "a/b.env", "id_ed25519", "x\0y"]) {
    assert.throws(() => resolveInside(root, p), undefined, p);
  }
  for (const r of ["/", "/proc", "/proc/self", "/etc", os.homedir()]) assert.throws(() => resolveInside(r, "x"), undefined, r);
  fs.rmSync(root, { recursive: true, force: true });
});

test("command-runner: argv only, allowlist, no shell syntax", () => {
  assert.deepEqual(splitArgv('git commit -m "a; rm -rf /"'), ["git", "commit", "-m", "a; rm -rf /"]);
  assert.deepEqual(checkCommand("npm run build"), ["npm", "run", "build"]);
  for (const c of ["cat /etc/passwd", "curl http://x", "bash -c id", "rm -rf /", "sh", "echo hi\nid"]) {
    assert.throws(() => checkCommand(c), undefined, c);
  }
});

test("route policy", () => {
  assert.equal(policyFor("PATCH", "/api/config"), "admin");
  assert.equal(policyFor("POST", "/api/agent/tool"), "user");
  assert.equal(policyFor("POST", "/api/treaty/room/general/send"), "user");
  assert.equal(policyFor("GET", "/api/treaty/rooms"), "public");
  assert.equal(policyFor("POST", "/api/chat"), "public");
});

test("local trust: opt-in only, loopback without proxy headers, never on cloud", async () => {
  const saved = process.env.VERCEL, savedTrust = process.env.GRUDA_LOCAL_TRUST;
  delete process.env.VERCEL;
  const req = (addr, headers) => ({ headers: headers || {}, socket: { remoteAddress: addr } });
  delete process.env.GRUDA_LOCAL_TRUST;
  assert.equal(await auth.identify(req("127.0.0.1")), null, "off unless GRUDA_LOCAL_TRUST=1");
  process.env.GRUDA_LOCAL_TRUST = "true";
  assert.equal(await auth.identify(req("127.0.0.1")), null, "only the exact value 1 opts in");
  process.env.GRUDA_LOCAL_TRUST = "1";
  assert.equal((await auth.identify(req("127.0.0.1"))).kind, "local");
  assert.equal(await auth.identify(req("192.168.1.5")), null);
  assert.equal(await auth.identify(req("127.0.0.1", { "x-forwarded-for": "1.2.3.4" })), null);
  assert.equal(await auth.identify(req("127.0.0.1", { "cf-connecting-ip": "1.2.3.4" })), null);
  process.env.VERCEL = "1";
  assert.equal(await auth.identify(req("127.0.0.1")), null);
  if (saved === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved;
  if (savedTrust === undefined) delete process.env.GRUDA_LOCAL_TRUST; else process.env.GRUDA_LOCAL_TRUST = savedTrust;
});

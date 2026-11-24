// Unit checks for the second hardening round: path normalization (B1),
// JWT fail-closed (M4), safe-path symlinks (L1), url-guard parsing (M1).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { policyFor, normalizeApiPath } = require("../lib/route-policy");
const auth = require("../lib/auth");
const { resolveInside } = require("../lib/safe-path");
const { isPrivateIp, v6Bytes } = require("../lib/url-guard");

test("normalizeApiPath: decode, lowercase, collapse, strip; refuse encoded traversal", () => {
  assert.deepEqual(normalizeApiPath("/API//Agent/Tool/?x=1"), { ok: true, path: "/api/agent/tool" });
  assert.deepEqual(normalizeApiPath("/api/treaty/room/G%20R/send"), { ok: true, path: "/api/treaty/room/g r/send" });
  for (const bad of ["/api/projects/%2e%2e/files", "/api/a%2Fb", "/api/a%5cb", "/api/a%00", "/api/%zz", "/api/../config", "/api/./config", "/api/%252e%252e"]) {
    assert.equal(normalizeApiPath(bad).ok, false, bad);
  }
});

test("policyFor: deny by default, case and slash insensitive, never public on bad paths", () => {
  assert.equal(policyFor("POST", "/API/agent/tool"), "user");
  assert.equal(policyFor("PATCH", "/Api/Config/"), "admin");
  assert.equal(policyFor("GET", "/api/whatever-new"), "user");
  assert.equal(policyFor("GET", "/api/health"), "public");
  assert.equal(policyFor("HEAD", "/api/health"), "public");
  assert.equal(policyFor("GET", "/api/projects/%2e%2e/files"), "user");
  assert.equal(policyFor("GET", "/api/deploy/github/repos"), "admin");
  assert.equal(policyFor("GET", "/api/history"), "user");
  assert.equal(policyFor("GET", "/index.html"), "public");
});

function jwt(payload, secret) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "HS256", typ: "JWT" }), b = enc(payload);
  return `${h}.${b}.${crypto.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url")}`;
}

test("M4 GrudgeID JWT fails closed without issuer or secret; no JWT_SECRET fallback", async () => {
  const saved = { s: process.env.GRUDGE_JWT_SECRET, i: process.env.GRUDGE_JWT_ISSUER, j: process.env.JWT_SECRET, v: process.env.VERCEL };
  try {
    process.env.VERCEL = "1";
    const now = Math.floor(Date.now() / 1000);
    const good = { grudge_id: "GRD-1", exp: now + 600, iss: "https://id.example" };
    const req = (t) => ({ headers: { authorization: `Bearer ${t}` }, socket: { remoteAddress: "10.0.0.1" } });
    const noPuter = { fetch: async () => ({ ok: false }) };

    process.env.GRUDGE_JWT_SECRET = "s1"; process.env.GRUDGE_JWT_ISSUER = "https://id.example"; delete process.env.JWT_SECRET;
    assert.equal((await auth.identify(req(jwt(good, "s1")), noPuter)).grudgeId, "GRD-1");
    assert.equal(await auth.identify(req(jwt({ ...good, iss: "https://other" }, "s1")), noPuter), null, "wrong iss");

    delete process.env.GRUDGE_JWT_ISSUER;
    assert.equal(await auth.identify(req(jwt(good, "s1") + ""), noPuter), null, "issuer unset → rejected");

    process.env.GRUDGE_JWT_ISSUER = "https://id.example"; delete process.env.GRUDGE_JWT_SECRET; process.env.JWT_SECRET = "s1";
    assert.equal(await auth.identify(req(jwt(good, "s1") + "x"), noPuter), null);
    assert.equal(await auth.identify(req(jwt({ ...good, n: 1 }, "s1")), noPuter), null, "JWT_SECRET is not a fallback");

    assert.equal(auth.verifyGrudgeJwt(jwt(good, "s1"), "s1", now, ""), null, "explicit empty issuer");
    assert.equal(auth.verifyGrudgeJwt(jwt(good, "s1"), "", now, "https://id.example"), null, "empty secret");
  } finally {
    for (const [k, v] of [["GRUDGE_JWT_SECRET", saved.s], ["GRUDGE_JWT_ISSUER", saved.i], ["JWT_SECRET", saved.j], ["VERCEL", saved.v]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test("M2 verifyPuterToken: temp accounts are not identities", async () => {
  const mk = (u) => ({ fetch: async () => ({ ok: true, json: async () => u }) });
  assert.equal(await auth.verifyPuterToken("t-temp-" + Math.random(), mk({ uuid: "u", username: "x", is_temp: true }).fetch), null);
  const ok = await auth.verifyPuterToken("t-ok-" + Math.random(), mk({ uuid: "u", username: "x" }).fetch);
  assert.equal(ok.kind, "puter");
});

test("L1 safe-path: write through any symlink refused; read via link to dotfile refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gruda-sp-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gruda-out-"));
  try {
    fs.symlinkSync(path.join(out, "x"), path.join(root, "dangling"));
    fs.symlinkSync(out, path.join(root, "d"));
    fs.writeFileSync(path.join(root, ".env"), "S=1");
    fs.symlinkSync(".env", path.join(root, "nice.txt"));
    fs.writeFileSync(path.join(root, "real.txt"), "ok");
    fs.symlinkSync("real.txt", path.join(root, "alias.txt"));
    assert.throws(() => resolveInside(root, "dangling", { write: true }), /symlink/);
    assert.throws(() => resolveInside(root, "dangling"), /broken link|outside/);
    assert.throws(() => resolveInside(root, "d/new.txt", { write: true }), /symlink/);
    assert.throws(() => resolveInside(root, "d/new.txt"), /outside/);
    assert.throws(() => resolveInside(root, "nice.txt"), /hidden|blocked/);
    assert.equal(resolveInside(root, "alias.txt"), fs.realpathSync(path.join(root, "real.txt")), "in-root link to a normal file can be read");
    assert.throws(() => resolveInside(root, "alias.txt", { write: true }), /symlink/);
    assert.ok(resolveInside(root, "sub/new.txt", { write: true }).endsWith(path.join("sub", "new.txt")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
  }
});

test("M1 isPrivateIp: v4 ranges, mapped/compat/NAT64/6to4, ULA, link-local, site-local", () => {
  for (const ip of ["127.0.0.1", "10.1.1.1", "172.31.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
                    "::1", "::", "::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "::7f00:1", "64:ff9b::7f00:1",
                    "2002:7f00:1::1", "fc00::1", "fd00::1", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "feff::1", "ff02::1", "2001:db8::1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:808:808", "2001:4860:4860::8888"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
  assert.deepEqual(v6Bytes("::ffff:1.2.3.4").slice(10), [255, 255, 1, 2, 3, 4]);
});

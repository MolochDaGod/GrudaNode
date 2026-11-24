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

function signAlg(payload, alg, key) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg, typ: "JWT" }), b = enc(payload);
  if (alg === "none") return `${h}.${b}.`;
  if (alg === "RS256") return `${h}.${b}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${b}`), key).toString("base64url")}`;
  return `${h}.${b}.${crypto.createHmac("sha256", key).update(`${h}.${b}`).digest("base64url")}`;
}

// Shape of a real GrudgeID session (Grudge-Builder server/routes/auth.ts signToken):
// HS256, expiresIn only, no iss; payload { userId, grudgeId, username, role, isAdmin }.
function realSession(extra) {
  const now = Math.floor(Date.now() / 1000);
  return { userId: "u-123", grudgeId: "GRD-1", username: "warchief", role: "player", isAdmin: false, iat: now, exp: now + 365 * 86400, ...(extra || {}) };
}

async function withJwtEnv(env, fn) {
  const keys = ["GRUDGE_JWT_SECRET", "GRUDGE_JWT_ISSUER", "JWT_SECRET", "VERCEL"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, { VERCEL: "1" }, env);
    await fn();
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const jreq = (t) => ({ headers: { authorization: `Bearer ${t}` }, socket: { remoteAddress: "10.0.0.1" } });
const noPuter = { fetch: async () => ({ ok: false }) };
const who = (t) => auth.identify(jreq(t), noPuter);

test("M4 a real-shaped GrudgeID session with no iss is accepted when GRUDGE_JWT_ISSUER is unset", () => withJwtEnv({ GRUDGE_JWT_SECRET: "s1" }, async () => {
  const id = await who(signAlg(realSession(), "HS256", "s1"));
  assert.equal(id && id.kind, "grudge");
  assert.equal(id.grudgeId, "GRD-1");
  assert.equal(id.userId, "u-123");
  assert.equal(id.admin, false);
  const onlyUser = await who(signAlg(realSession({ grudgeId: "" }), "HS256", "s1"));
  assert.equal(onlyUser && onlyUser.id, "grudge-user:u-123", "userId alone is enough");
  // Builder/GrudgeID admin claims never make a gruda-agent admin (Jonathan, Nov 24 2026).
  for (const extra of [{ role: "master" }, { role: "admin" }, { role: "master_admin" }, { role: "owner" }, { isAdmin: true },
                       { tier: "admin" }, { role: "admin", isAdmin: true }]) {
    const id = await who(signAlg(realSession(extra), "HS256", "s1"));
    assert.equal(id && id.kind, "grudge", "still signed in: " + JSON.stringify(extra));
    assert.equal(id.admin, false, "not admin: " + JSON.stringify(extra));
  }
}));

test("M4 the same token is rejected when GRUDGE_JWT_ISSUER is set and doesn't match", () => withJwtEnv({ GRUDGE_JWT_SECRET: "s1", GRUDGE_JWT_ISSUER: "https://id.grudge-studio.com" }, async () => {
  assert.equal(await who(signAlg(realSession(), "HS256", "s1")), null, "no iss");
  assert.equal(await who(signAlg(realSession({ iss: "https://evil.example" }), "HS256", "s1")), null, "wrong iss");
  const ok = await who(signAlg(realSession({ iss: "https://id.grudge-studio.com" }), "HS256", "s1"));
  assert.equal(ok && ok.grudgeId, "GRD-1", "matching iss accepted");
}));

test("M4 RS256 and none-algorithm tokens are rejected (algorithms pinned to HS256)", () => withJwtEnv({ GRUDGE_JWT_SECRET: "s1" }, async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.equal(await who(signAlg(realSession(), "RS256", privateKey)), null, "RS256");
  assert.equal(await who(signAlg(realSession(), "none")), null, "none");
  assert.equal(await who(signAlg(realSession(), "HS512", "s1")), null, "HS512");
  // RS256 header with an HMAC made from the secret (alg confusion) is still refused
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "RS256", typ: "JWT" }), b = enc(realSession());
  assert.equal(await who(`${h}.${b}.${crypto.createHmac("sha256", "s1").update(`${h}.${b}`).digest("base64url")}`), null, "alg confusion");
}));

test("M4 expired tokens and tokens without exp are rejected", () => withJwtEnv({ GRUDGE_JWT_SECRET: "s1" }, async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await who(signAlg(realSession({ exp: now - 1 }), "HS256", "s1")), null, "expired");
  assert.equal(await who(signAlg(realSession({ exp: undefined }), "HS256", "s1")), null, "no exp");
  assert.equal(await who(signAlg(realSession({ exp: String(now + 600) }), "HS256", "s1")), null, "string exp");
}));

test("M4 launch tokens are not session identity", () => withJwtEnv({ GRUDGE_JWT_SECRET: "s1" }, async () => {
  const now = Math.floor(Date.now() / 1000);
  // Shape of Grudge-Builder mintLaunchToken: { type: "launch", userId, grudgeId, aud }, 60m
  const launch = { type: "launch", userId: "u-123", grudgeId: "GRD-1", aud: "warlords", iat: now, exp: now + 3600 };
  assert.equal(await who(signAlg(launch, "HS256", "s1")), null, "launch");
  assert.equal(await who(signAlg({ ...launch, type: "refresh" }, "HS256", "s1")), null, "other typed token");
  assert.equal(await who(signAlg(realSession({ userId: "", grudgeId: "" }), "HS256", "s1")), null, "needs userId or grudgeId");
  assert.equal(await who(signAlg({ sub: "GRD-1", exp: now + 600 }, "HS256", "s1")), null, "sub alone is not enough");
}));

test("M4 every GrudgeID token is rejected when GRUDGE_JWT_SECRET is missing (no JWT_SECRET fallback)", () => withJwtEnv({ JWT_SECRET: "s1", GRUDGE_JWT_ISSUER: "" }, async () => {
  assert.equal(await who(signAlg(realSession(), "HS256", "s1")), null, "JWT_SECRET is not used");
  assert.equal(await who(signAlg(realSession(), "HS256", "")), null, "empty-key HMAC");
  assert.equal(await who(signAlg(realSession(), "none")), null);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(auth.verifyGrudgeJwt(signAlg(realSession(), "HS256", "s1"), "", now), null, "empty secret");
}));

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

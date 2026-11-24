/**
 * Request identity for gruda-agent.
 *
 * Accepted credentials (Authorization: Bearer <token>):
 *   1. GRUDA_AGENT_ADMIN_KEY (server key)            → admin
 *   2. GrudgeID JWT, HS256, signed with GRUDGE_JWT_SECRET or JWT_SECRET,
 *      must carry exp                                → grudge user (admin if tier admin/master_admin)
 *   3. Puter session token, checked live against api.puter.com/whoami
 *                                                    → puter user (admin if username in GRUDA_ADMIN_PUTER_USERS)
 *   4. Local mode only (not on Vercel, GRUDA_LOCAL_TRUST != "0"): a request from
 *      the loopback interface with no proxy headers   → local owner (admin)
 *
 * Identity always comes from a verified credential, never from the request body.
 * Fails closed: no credential → null.
 */
"use strict";
const crypto = require("crypto");

const PUTER_WHOAMI = process.env.PUTER_WHOAMI_URL || "https://api.puter.com/whoami";
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // sha256(token) → { at, identity|null }

const isCloud = () => !!process.env.VERCEL;

function bearer(req) {
  const h = String((req.headers && req.headers.authorization) || "");
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** HS256 only; rejects other algs, missing/expired exp, and bad signatures. */
function verifyGrudgeJwt(token, secret, nowSec) {
  if (!secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  } catch { return null; }
  if (!header || header.alg !== "HS256") return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = b64urlDecode(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;
  const iss = process.env.GRUDGE_JWT_ISSUER;
  if (iss && payload.iss !== iss) return null;
  const grudgeId = String(payload.grudge_id || payload.grudgeId || payload.sub || "").trim();
  if (!grudgeId) return null;
  const tier = String(payload.tier || payload.role || "member");
  return {
    kind: "grudge",
    id: `grudge:${grudgeId}`,
    grudgeId,
    puterUuid: null,
    username: String(payload.username || payload.name || grudgeId),
    admin: tier === "admin" || tier === "master_admin",
  };
}

async function verifyPuterToken(token, fetchImpl) {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.identity;
  let identity = null;
  try {
    const r = await (fetchImpl || fetch)(PUTER_WHOAMI, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const u = await r.json();
      if (u && u.uuid && u.username) {
        const admins = String(process.env.GRUDA_ADMIN_PUTER_USERS || "")
          .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        identity = {
          kind: "puter",
          id: `puter:${u.uuid}`,
          grudgeId: null,
          puterUuid: String(u.uuid),
          username: String(u.username),
          temp: !!u.is_temp,
          admin: !u.is_temp && admins.includes(String(u.username).toLowerCase()),
        };
      }
    }
  } catch { identity = null; }
  cache.set(key, { at: Date.now(), identity });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return identity;
}

function isLoopback(addr) {
  const a = String(addr || "");
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function localIdentity(req) {
  if (isCloud() || process.env.GRUDA_LOCAL_TRUST === "0") return null;
  // Tunnels and proxies (cloudflared, nginx, Vercel) connect from loopback but add these.
  const h = req.headers || {};
  if (h["x-forwarded-for"] || h["forwarded"] || h["x-real-ip"] || h["cf-connecting-ip"] || h["x-vercel-id"]) return null;
  if (!isLoopback(req.socket && req.socket.remoteAddress)) return null;
  return { kind: "local", id: "local:owner", grudgeId: null, puterUuid: null, username: "local", admin: true };
}

async function identify(req, opts) {
  opts = opts || {};
  const token = bearer(req);
  if (token) {
    const adminKey = process.env.GRUDA_AGENT_ADMIN_KEY || "";
    if (adminKey && safeEqual(token, adminKey)) {
      return { kind: "admin", id: "admin:key", grudgeId: null, puterUuid: null, username: "admin", admin: true };
    }
    if (token.split(".").length === 3) {
      const jwt = verifyGrudgeJwt(token, process.env.GRUDGE_JWT_SECRET || process.env.JWT_SECRET || "");
      if (jwt) return jwt;
    }
    const p = await verifyPuterToken(token, opts.fetch);
    if (p) return p;
  }
  return localIdentity(req);
}

/** Express middleware. requireAuth() → any verified user; requireAuth({ admin: true }) → admin only. */
function requireAuth(opts) {
  opts = opts || {};
  return async (req, res, next) => {
    try {
      const who = req.identity || (await identify(req, opts));
      if (!who) return res.status(401).json({ error: "sign in required", hint: "Sign in with Puter or Grudge ID" });
      if (opts.admin && !who.admin) return res.status(403).json({ error: "admin only" });
      req.identity = who;
      next();
    } catch (err) {
      res.status(401).json({ error: "sign in required" });
    }
  };
}

module.exports = { identify, requireAuth, verifyGrudgeJwt, verifyPuterToken, isLoopback, isCloud, _cache: cache };

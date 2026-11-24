/**
 * Request identity for gruda-agent.
 *
 * Accepted credentials (Authorization: Bearer <token>):
 *   1. GRUDA_AGENT_ADMIN_KEY (server key)            → admin
 *   2. GrudgeID session JWT as minted by id.grudge-studio.com (Grudge-Builder
 *      server/routes/auth.ts signToken: HS256, expiresIn only, no iss claim,
 *      payload { userId, grudgeId, username, role, isAdmin }).
 *      - GRUDGE_JWT_SECRET unset → every GrudgeID token is rejected (fail closed;
 *        there is no JWT_SECRET fallback)
 *      - alg must be HS256; exp is required and enforced
 *      - iss is checked only when GRUDGE_JWT_ISSUER is set (real tokens carry none)
 *      - launch tokens (type "launch", 60-minute app hand-off) and any other typed
 *        token are not session identity and are rejected
 *      - userId or grudgeId is required
 *                                                    → grudge user (admin if role admin/master or isAdmin)
 *   3. Puter session token, checked live against api.puter.com/whoami. Temporary
 *      (anonymous) Puter accounts are not treated as signed in.
 *                                                    → puter user (admin if username in GRUDA_ADMIN_PUTER_USERS)
 *   4. Opt-in local mode only (GRUDA_LOCAL_TRUST=1, set by the `gruda-agent` CLI,
 *      never on Vercel): a request from the loopback interface with no proxy
 *      headers                                       → local owner (admin)
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
const JWT_ALGS = ["HS256"];
const ADMIN_ROLES = new Set(["admin", "master", "master_admin", "owner"]);

function verifyGrudgeJwt(token, secret, nowSec, issuer) {
  if (!secret) return null; // fail closed when the secret isn't configured
  const iss = issuer != null ? issuer : (process.env.GRUDGE_JWT_ISSUER || "");
  const parts = String(token).split(".");
  if (parts.length !== 3 || !parts[2]) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  } catch { return null; }
  if (!header || !JWT_ALGS.includes(header.alg)) return null; // no none, RS256, ES256, …
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = b64urlDecode(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const now = nowSec != null ? nowSec : Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;
  if (iss && payload.iss !== iss) return null;
  // Launch tokens (type "launch") are short app hand-offs, not sessions.
  if (payload.type != null && payload.type !== "session") return null;
  const grudgeId = String(payload.grudgeId || payload.grudge_id || "").trim();
  const userId = String(payload.userId || payload.user_id || "").trim();
  if (!grudgeId && !userId) return null;
  const role = String(payload.role || payload.tier || "player").toLowerCase();
  return {
    kind: "grudge",
    id: grudgeId ? `grudge:${grudgeId}` : `grudge-user:${userId}`,
    grudgeId: grudgeId || null,
    userId: userId || null,
    puterUuid: null,
    username: String(payload.username || payload.name || grudgeId || userId),
    admin: ADMIN_ROLES.has(role) || payload.isAdmin === true,
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
      // Temporary / anonymous Puter accounts don't count as signed in.
      if (u && u.uuid && u.username && !u.is_temp && !u.is_anonymous) {
        const admins = String(process.env.GRUDA_ADMIN_PUTER_USERS || "")
          .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        identity = {
          kind: "puter",
          id: `puter:${u.uuid}`,
          grudgeId: null,
          puterUuid: String(u.uuid),
          username: String(u.username),
          temp: false,
          admin: admins.includes(String(u.username).toLowerCase()),
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
  // Opt-in only: the `gruda-agent` CLI sets GRUDA_LOCAL_TRUST=1. Never on Vercel.
  if (isCloud() || process.env.GRUDA_LOCAL_TRUST !== "1") return null;
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
      const jwt = verifyGrudgeJwt(token, process.env.GRUDGE_JWT_SECRET || "");
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
      if (opts.admin && !who.admin) {
        const configured = !!(process.env.GRUDA_ADMIN_PUTER_USERS || process.env.GRUDA_AGENT_ADMIN_KEY ||
          process.env.GRUDGE_JWT_SECRET);
        return res.status(403).json(configured ? { error: "admin only" }
          : { error: "admin not configured: set GRUDA_ADMIN_PUTER_USERS or GRUDA_AGENT_ADMIN_KEY" });
      }
      req.identity = who;
      next();
    } catch (err) {
      res.status(401).json({ error: "sign in required" });
    }
  };
}

module.exports = { identify, requireAuth, verifyGrudgeJwt, verifyPuterToken, isLoopback, isCloud, _cache: cache };

/**
 * Which /api routes need a verified identity. Deny by default:
 *   "admin"  → server key, admin GrudgeID, listed Puter admin, or the opted-in local owner
 *   "public" → only the method + path pairs listed in PUBLIC below
 *   "user"   → every other /api route (any verified identity)
 *
 * Paths are normalized before matching (normalizeApiPath): percent-decoded once,
 * lowercased, repeated slashes collapsed and trailing slashes stripped, so
 * /API/Agent/Tool/ and /api/agent/tool get the same answer. Encoded traversal
 * (%2e, %2f, %5c, %00), dot segments, backslashes and bad escapes are rejected
 * outright. Express is also set to case-sensitive + strict routing in server.js,
 * so a variant that slips past here would not reach a handler anyway.
 */
"use strict";

// Admin: shared config, stored tokens, deploys, command runners, host maintenance.
const ADMIN = [
  ["PATCH", /^\/api\/config$/],
  ["POST", /^\/api\/integrations\/[^/]+$/],
  ["DELETE", /^\/api\/integrations\/[^/]+$/],
  ["POST", /^\/api\/deploy\/(github|vercel)$/],
  // These two list repos / deployments with the stored admin tokens (M5).
  ["GET", /^\/api\/deploy\/github\/repos$/],
  ["GET", /^\/api\/deploy\/vercel\/list$/],
  ["POST", /^\/api\/cache\/clear$/],
  ["POST", /^\/api\/models\/pull$/],
  ["POST", /^\/api\/truth$/],
  ["POST", /^\/api\/terminal\/exec$/],
  ["POST", /^\/api\/ide\/run$/],
];

// Public: read-only catalogs, health, status, Treaty reads, chat (AI spend is a
// known follow-up, M6). Anything not listed here or in ADMIN needs a user.
const PUBLIC = [
  ["GET", /^\/api\/health$/],
  ["GET", /^\/api\/agent\/(tools|context)$/],
  ["GET", /^\/api\/agents$/],
  ["GET", /^\/api\/onboarding$/],
  ["GET", /^\/api\/models$/],
  ["GET", /^\/api\/ai\/rag\/status$/],
  ["GET", /^\/api\/fleet\/mismatch$/],
  ["GET", /^\/api\/skills$/],
  ["GET", /^\/api\/skills\/[^/]+$/],
  ["GET", /^\/api\/projects\/templates$/],
  ["GET", /^\/api\/insights$/],
  ["GET", /^\/api\/insights\/[^/]+$/],
  ["GET", /^\/api\/auth\/config$/],
  ["GET", /^\/api\/treaty\/(config|rooms|status|messages)$/],
  ["GET", /^\/api\/treaty\/room\/[^/]+\/messages$/],
  ["GET", /^\/api\/splash(\/gif[12])?$/],
  ["GET", /^\/api\/grok-build$/],
  ["GET", /^\/api\/app\/paths$/],
  ["GET", /^\/api\/assets\/(polyhaven|polypizza|grudge|categories|r2)$/],
  ["GET", /^\/api\/assets\/polyhaven\/[^/]+$/],
  ["GET", /^\/api\/env\/system-prompt$/],
  ["GET", /^\/api\/env\/scenes$/],
  ["GET", /^\/api\/env\/scenes\/[^/]+$/],
  ["GET", /^\/api\/music\/task\/[^/]+\/[^/]+$/],
  ["GET", /^\/api\/tts\/voices$/],
  ["GET", /^\/api\/workers$/],
  ["GET", /^\/api\/orchestrator\/config$/],
  ["GET", /^\/api\/(forge|mineloader)\/tools$/],
  ["GET", /^\/api\/llm\/probe$/],
  ["GET", /^\/api\/deploy\/local\/script$/],
  ["GET", /^\/api\/deploy\/puter-worker\/template$/],
  ["GET", /^\/api\/truth$/],
  ["GET", /^\/api\/integrations$/], // connected yes/no only, never tokens
  ["POST", /^\/api\/chat(\/stream)?$/],
  ["POST", /^\/api\/ai\/rag\/chat$/],
  ["POST", /^\/api\/ide\/snippet$/],
  ["POST", /^\/api\/env\/scene$/],
  ["POST", /^\/api\/music\/(song|instrumental|lyrics)$/],
  ["POST", /^\/api\/tts$/],
  ["POST", /^\/api\/generate\/launcher$/],
];

/**
 * Normalize the path part of a request URL for policy checks.
 * Returns { ok: true, path } or { ok: false, reason }.
 */
function normalizeApiPath(rawUrl) {
  const raw = String(rawUrl || "").split("?")[0].split("#")[0];
  if (/%(2e|2f|5c|00)/i.test(raw)) return { ok: false, reason: "encoded path characters are not allowed" };
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return { ok: false, reason: "bad url encoding" }; }
  if (decoded.includes("\\") || decoded.includes("\0")) return { ok: false, reason: "bad path" };
  if (/%[0-9a-f]{2}/i.test(decoded)) return { ok: false, reason: "double-encoded path" };
  const collapsed = decoded.replace(/\/{2,}/g, "/");
  if (collapsed.split("/").some((s) => s === "." || s === "..")) return { ok: false, reason: "dot segments are not allowed" };
  const p = collapsed.toLowerCase().replace(/\/+$/, "") || "/";
  return { ok: true, path: p };
}

function isApiPath(p) {
  return p === "/api" || p.startsWith("/api/");
}

function matches(list, m, p) {
  return list.some(([meth, re]) => (meth === m || (meth === "GET" && m === "HEAD")) && re.test(p));
}

/** Policy for an already-normalized path. Non-/api paths are "public". */
function policyFor(method, urlPath) {
  const m = String(method || "GET").toUpperCase();
  const n = normalizeApiPath(urlPath);
  if (!n.ok) return "user"; // callers reject these first; never "public"
  const p = n.path;
  if (!isApiPath(p)) return "public";
  if (m === "OPTIONS") return "public"; // CORS preflight carries no credentials
  if (matches(ADMIN, m, p)) return "admin";
  if (matches(PUBLIC, m, p)) return "public";
  return "user";
}

module.exports = { policyFor, normalizeApiPath, isApiPath, ADMIN, PUBLIC };

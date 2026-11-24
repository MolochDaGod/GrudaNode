/**
 * Which /api routes need a verified identity.
 *   "admin"  → server key, admin GrudgeID, listed Puter admin, or the local owner
 *   "user"   → any verified identity (Puter or GrudgeID), or the local owner
 *   "public" → everything else (read-only catalogs, health, chat)
 * Routes act on one shared server config / workspace on the cloud host, which is
 * why config, integration tokens, deploys and command runners are admin-only.
 */
"use strict";

const RULES = [
  // admin: shared config, stored tokens, deploys, command runners, host maintenance
  ["admin", "PATCH", /^\/api\/config$/],
  ["admin", "POST", /^\/api\/integrations\/[^/]+$/],
  ["admin", "DELETE", /^\/api\/integrations\/[^/]+$/],
  ["admin", "POST", /^\/api\/deploy\/(github|vercel)$/],
  ["admin", "POST", /^\/api\/cache\/clear$/],
  ["admin", "POST", /^\/api\/models\/pull$/],
  ["admin", "POST", /^\/api\/truth$/],
  ["admin", "POST", /^\/api\/terminal\/exec$/],
  ["admin", "POST", /^\/api\/ide\/run$/],
  // user: agent tools, workspace files, personal data, posting to Treaty
  ["user", "POST", /^\/api\/agent\/(tool|stream)$/],
  ["user", "GET", /^\/api\/config$/],
  ["user", "GET", /^\/api\/ide\/(tree|file)$/],
  ["user", "POST", /^\/api\/ide\/file$/],
  ["user", "POST", /^\/api\/projects$/],
  ["user", "POST", /^\/api\/projects\/[^/]+\/memory$/],
  ["user", "POST", /^\/api\/insights\/[^/]+$/],
  ["user", "POST", /^\/api\/history(\/pg)?$/],
  ["user", "POST", /^\/api\/onboarding\/complete$/],
  ["user", "POST", /^\/api\/upload$/],
  ["user", "POST", /^\/api\/env\/scenes$/],
  ["user", "POST", /^\/api\/orchestrate$/],
  ["user", "POST", /^\/api\/treaty\/send$/],
  ["user", "POST", /^\/api\/treaty\/room\/[^/]+\/send$/],
];

function policyFor(method, urlPath) {
  const m = String(method || "GET").toUpperCase();
  const p = String(urlPath || "").replace(/\/+$/, "") || "/";
  for (const [level, meth, re] of RULES) {
    if (meth === m && re.test(p)) return level;
  }
  return "public";
}

module.exports = { policyFor, RULES };

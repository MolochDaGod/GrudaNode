// ═══════════════════════════════════════════════════════════════
//  grudgedot — Grudge Studio Game Launcher
//  GitHub App: Iv23liLWxaTCRF5yqw1U  |  App ID: 3101811
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3300;

const GH_ORG        = process.env.GH_ORG         || 'MolochDaGod';
const GH_APP_ID     = process.env.GH_APP_ID       || '3101811';
const GH_CLIENT_ID  = process.env.GH_CLIENT_ID    || 'Iv23liLWxaTCRF5yqw1U';
const GH_SECRET     = process.env.GH_SECRET;                      // client secret — env only
const GH_WEBHOOK_SECRET = process.env.GH_WEBHOOK_SECRET || '';    // set in GitHub App settings
const GH_TOKEN      = process.env.GITHUB_TOKEN    || '';          // PAT fallback
const CALLBACK_URL  = process.env.CALLBACK_URL    || 'http://localhost:3300/auth/callback';

// ── Webhook body needs raw bytes for HMAC ────────────────────
app.use('/api/webhooks', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GitHub API helper ────────────────────────────────────────
async function ghFetch(endpoint, token = GH_TOKEN, opts = {}) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${endpoint} → ${res.status}: ${body.slice(0,120)}`);
  }
  return res.json();
}

// ── Webhook signature verification ──────────────────────────
function verifyGitHubSignature(rawBody, sigHeader) {
  if (!GH_WEBHOOK_SECRET) return true; // skip in dev if not set
  const sig = Buffer.from(sigHeader || '', 'utf8');
  const expected = Buffer.from(
    'sha256=' + createHmac('sha256', GH_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    'utf8'
  );
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(sig, expected);
}

// ── OAuth ─────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: GH_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: 'read:user read:org',
    state: Math.random().toString(36).slice(2),
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GH_CLIENT_ID, client_secret: GH_SECRET, code }),
    });
    const { access_token, error } = await tokenRes.json();
    if (error) throw new Error(error);
    const user = await ghFetch('/user', access_token);
    res.redirect(
      `/?token=${access_token}` +
      `&user=${encodeURIComponent(user.login)}` +
      `&avatar=${encodeURIComponent(user.avatar_url)}`
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Webhook receiver ─────────────────────────────────────────
app.post('/api/webhooks/github', (req, res) => {
  const sig  = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const raw  = req.body; // Buffer (raw middleware)

  if (!verifyGitHubSignature(raw, sig)) {
    console.warn('[webhook] bad signature');
    return res.status(401).json({ error: 'bad signature' });
  }

  let payload;
  try { payload = JSON.parse(raw.toString()); } catch { return res.status(400).end(); }

  console.log(`[webhook] ${event} / action=${payload.action || '-'} repo=${payload.repository?.name || '-'}`);

  // Handle release events — invalidate game cache
  if (event === 'release' && payload.action === 'published') {
    console.log(`[webhook] new release: ${payload.release?.tag_name} on ${payload.repository?.name}`);
    gameCache = null; // bust cache so next /api/games fetches fresh
  }

  res.status(200).json({ ok: true });
});

// ── Game Library (with 60s cache) ────────────────────────────
let gameCache = null;
let gameCacheAt = 0;
const CACHE_TTL = 60_000;

app.get('/api/games', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || GH_TOKEN;
  try {
    if (gameCache && Date.now() - gameCacheAt < CACHE_TTL) {
      return res.json({ games: gameCache, cached: true });
    }

    const repos = await ghFetch(`/orgs/${GH_ORG}/repos?per_page=100&sort=updated`, token);

    const games = (await Promise.all(
      repos
        .filter(r => !r.archived)
        .map(async repo => {
          try {
            const releases = await ghFetch(
              `/repos/${GH_ORG}/${repo.name}/releases?per_page=5`, token
            );
            if (!releases.length) return null;
            const latest = releases[0];
            return {
              id: repo.id,
              name: repo.name,
              displayName: repo.description?.split('|')[0]?.trim() || repo.name,
              description: repo.description || '',
              topics: repo.topics || [],
              stars: repo.stargazers_count,
              language: repo.language,
              homepage: repo.homepage,
              htmlUrl: repo.html_url,
              latestVersion: latest.tag_name,
              latestRelease: {
                name: latest.name,
                body: latest.body,
                publishedAt: latest.published_at,
                assets: latest.assets.map(a => ({
                  name: a.name,
                  size: a.size,
 
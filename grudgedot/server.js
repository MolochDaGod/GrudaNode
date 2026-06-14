// ═══════════════════════════════════════════════════════════════
//  grudgedot — Grudge Studio Game Launcher Backend
//  Powered by GitHub Releases · OAuth via GitHub App
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3300;

const GH_ORG        = process.env.GH_ORG        || 'MolochDaGod';
const GH_APP_ID     = process.env.GH_APP_ID      || '';
const GH_CLIENT_ID  = process.env.GH_CLIENT_ID   || process.env.GITHUB_CLIENT_ID;
const GH_SECRET     = process.env.GH_SECRET      || process.env.GITHUB_CLIENT_SECRET;
const GH_TOKEN      = process.env.GITHUB_TOKEN   || '';
const CALLBACK_URL  = process.env.CALLBACK_URL   || 'http://localhost:3300/auth/callback';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GitHub API helper ────────────────────────────────────────
async function ghFetch(path, token = GH_TOKEN, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}`);
  return res.json();
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
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GH_CLIENT_ID, client_secret: GH_SECRET, code }),
    });
    const { access_token } = await tokenRes.json();
    const user = await ghFetch('/user', access_token);
    // Redirect to launcher with token (in production use httpOnly cookie / session)
    res.redirect(`/?token=${access_token}&user=${encodeURIComponent(user.login)}&avatar=${encodeURIComponent(user.avatar_url)}`);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Game Library ──────────────────────────────────────────────
// GET /api/games — list all repos in org that have releases tagged with grudge-game topic
app.get('/api/games', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || GH_TOKEN;
  try {
    // Get org repos with topic "grudge-game"
    const repos = await ghFetch(
      `/orgs/${GH_ORG}/repos?per_page=100&sort=updated`,
      token
    );

    const games = await Promise.all(
      repos
        .filter(r => !r.archived)
        .map(async repo => {
          try {
            const releases = await ghFetch(
              `/repos/${GH_ORG}/${repo.name}/releases?per_page=5`,
              token
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
                  downloadUrl: a.browser_download_url,
                  downloadCount: a.download_count,
                })),
              },
              thumbnail: `https://raw.githubusercontent.com/${GH_ORG}/${repo.name}/main/assets/thumbnail.png`,
            };
          } catch { return null; }
        })
    );

    res.json({ games: games.filter(Boolean) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/:repo/releases — all releases for a game
app.get('/api/games/:repo/releases', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || GH_TOKEN;
  try {
    const releases = await ghFetch(
      `/repos/${GH_ORG}/${req.params.repo}/releases`,
      token
    );
    res.json({ releases });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/org/stats — org-level stats for studio dashboard
app.get('/api/org/stats', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || GH_TOKEN;
  try {
    const [org, repos] = await Promise.all([
      ghFetch(`/orgs/${GH_ORG}`, token),
      ghFetch(`/orgs/${GH_ORG}/repos?per_page=100`, token),
    ]);
    res.json({
      org: {
        name: org.name,
        description: org.description,
        avatar: org.avatar_url,
        publicRepos: org.public_repos,
        members: org.public_members_url,
      },
      repos: repos.length,
      totalStars: repos.reduce((s, r) => s + r.stargazers_count, 0),
      languages: [...new Set(repos.map(r => r.language).filter(Boolean))],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/health
app.get('/api/health', (_, res) => res.json({ ok: true, service: 'grudgedot', org: GH_ORG }));

// Catch-all → SPA
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => {
  console.log(`\n  ⚔️  grudgedot launcher running at http://localhost:${PORT}`);
  console.log(`  Org: ${GH_ORG}\n`);
});

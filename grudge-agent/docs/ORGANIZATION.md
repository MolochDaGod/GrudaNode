<p align="center"><img src="../public/gruda-king.png" alt="GRUDA Agent" width="120"></p>

# GRUDA Agent — Project Organization
This document explains how the **GrudaNode** repository and the **GRUDA Agent** deployment are organized: where things live, how they connect, how they deploy, and the conventions to follow when contributing.
- **Repository:** [MolochDaGod/GrudaNode](https://github.com/MolochDaGod/GrudaNode) (default branch `main`)
- **Owner:** Grudge Studio — RacAlvin The Pirate King
- **Live (agent):** [grudaagent.vercel.app](https://grudaagent.vercel.app) (Vercel) · [grudanode-production.up.railway.app](https://grudanode-production.up.railway.app) (Railway)
## Repository layout
`GrudaNode` is a small monorepo with two independently deployable Node services plus shared CI/CD.
```
GrudaNode/
├── grudge-agent/        # GRUDA Agent — agentic AI workspace (this deployment)
├── grudgedot/           # grudgeDot — companion service (own server + Vercel config + GitHub App manifest)
├── .github/workflows/   # CI + deploy automation (see below)
├── .gitignore           # Ignores node_modules, .env, *.gif, .vercel, .gruda-agent
└── .env                 # Local-only secrets (never committed)
```
Each subproject has its own `package.json`, `server.js`, `public/`, and `vercel.json`, so they deploy and version independently.
## The `grudge-agent` deployment
A single Node process (**Express + WebSocket**) serves a no-build single-page app and a REST/SSE API.
```
grudge-agent/
├── server.js           # Backend: agent loop, orchestrator, music, voice, IDE, assets, splash, Postgres mirror
├── public/
│   ├── index.html      # Full SPA — splash, onboarding, sidebar, 6 tabs (no build step)
│   ├── gruda-king.png  # Brand icon — favicon, OG image, splash/welcome/nav/avatar logo
│   └── ui-kit/         # Vendored fantasy game-UI kit (reachable at /ui-kit) — CSS tokens, gameui.js, icons
├── bin/
│   └── gruda-agent.js  # CLI entry point for `npx gruda-agent`
├── Dockerfile          # Container image
├── docker-compose.yml  # Full stack (agent + bundled Ollama)
├── vercel.json         # Vercel build + routing
├── railway.toml        # Railway service config
├── cloudflared.yml     # Cloudflare Tunnel config
├── .env.example        # Config template (copy to .env)
├── .vercelignore       # Keeps .env / docker / scripts out of the Vercel bundle
├── .dockerignore       # Keeps secrets / node_modules out of the image
├── START.bat           # Windows launcher (auto-setup)
├── start.sh            # Mac/Linux launcher
├── wsl-start.sh        # WSL launcher
├── setup.ps1 / open.ps1 / wsl-setup.sh   # Install / open helpers
└── package.json        # npm package metadata (name: gruda-agent)
```
### `server.js` — what's inside
The backend is a single file organized into clearly commented sections:
- **Config & data dirs** — env parsing (`PORT`, `OLLAMA_HOST`, `DEFAULT_MODEL`, `SPLASH_GIF_1/2`, `TREATY_CHAT_URL`, `GRUDGE_R2_CDN`, `GRUDGE_ASSET_API`, Mureka/ElevenLabs/Postgres keys). On serverless (Vercel) writable paths fall back to `/tmp`.
- **Persona builder** — weaves the user's AI name, rules, vocal commands, and project memory into one system prompt.
- **Express + WebSocket** — static hosting of `public/`, JSON body parsing, multipart uploads, a broadcast helper, and a Treaty Chat relay.
- **Tool definitions + executor** — `search_files`, `read_file`, `write_file`, `list_directory`, `create_folder`, `update_memory`, `web_search`, `run_command`, `unzip`, `convert_file`, `open_url`.
- **Routes** — chat/agent SSE, worker orchestrator, projects + `gruda.md` memory, history, config, Treaty Chat, splash media (`/api/splash`), health, cloud integrations, the Monaco IDE endpoints (`/api/ide/*`), the **asset/R2** endpoints (`/api/assets/r2`, `/api/r2/*`), and the **Environment** endpoints (`/api/env/scene`, `/api/env/scenes(/:id)`).
### `public/index.html` — the SPA
One self-contained file: a splash screen, a first-run onboarding wizard, a sidebar with model/mode selectors and navigation, and six tabs — **AI Workspace**, **Treaty Chat**, **IDE**, **Environment**, **Assets**, and **Cloud & Deploy**. There is no build step; the file is served as-is.
### Environment tab
A sandboxed, multi-engine studio (Three.js / Rapier / Phaser / Node). Scenes are authored or AI-generated, then run inside an `<iframe srcdoc>` using an ESM importmap (no bundler). Scene code is saved per project at `<project>/.gruda/scenes/<id>.json`. Grudge assets load through the CORS-safe `/api/r2/*` proxy. Full coding rules + the plugin contract live in `docs/ENVIRONMENT.md`.
### Vendored UI kit (`public/ui-kit/`)
A fantasy game-UI kit served at `/ui-kit/` on both Railway and Vercel: `kit.css` + `theme.css` (the `--gk-*` design tokens), `manifest.json` (tokens, 9-slice frames, icon/skill manifest), `vanilla-js/gameui.js` (dependency-free `.gk-*` widget helpers), and `assets/` (icon + skill PNGs).
## Branding & icon
The single brand asset is `public/gruda-king.png` (the crowned GRUDA king). It replaced the previous crossed-swords (⚔️) marks and is wired everywhere a logo appears:
- **Favicon / shortcut icon / Apple touch icon** — `<link rel="icon|shortcut icon|apple-touch-icon">` in `<head>`
- **Social preview** — `og:image` and `twitter:image`
- **Splash screen** — the landing logo (shown when no splash GIFs are configured)
- **Welcome hero** — large logo on the empty AI Workspace
- **Inline marks** — onboarding header, sidebar nav, the AI Workspace tab, and the Treaty Chat title (CSS class `.gruda-ico`)
- **Agent avatar** — the assistant's chat bubble avatar (CSS class `.avatar-img`)
It is served at the site root (`/gruda-king.png`) by the `vercel.json` static route. **To rebrand:** drop a new square PNG (recommended ≥ 512×512, transparent background) at `public/gruda-king.png` — no code changes needed. Helper CSS lives in the `BRAND ICON` block near the end of the `<style>` section.
## Naming (one Vercel project)
| Layer | Canonical name | Notes |
|---|---|---|
| **Vercel project** | `grudaagent` | Single production deploy — `gruda-agent` Vercel project was removed (duplicate) |
| **Vercel URL** | [grudaagent.vercel.app](https://grudaagent.vercel.app) | Also proxied at [ai.grudge-studio.com](https://ai.grudge-studio.com) |
| **npm package / CLI** | `gruda-agent` | `npx gruda-agent` — hyphen matches npm, not the Vercel slug |
| **Local data dir** | `~/.gruda-agent` or `%APPDATA%\GrudgeStudio\gruda-agent` | Unchanged |
| **Railway service** | `gruda-agent` | Full-stack + Postgres |

## Deployment
`vercel.json` routing:
- `/api/(.*)` → `server.js` (serverless function)
- `/` → `public/index.html`
- `/(.*)` → `public/$1` (static files, including `/gruda-king.png` and `/ui-kit/*`)
| Target | How | URL |
|---|---|---|
| **Vercel** | `vercel --prod` from `grudge-agent/`, or the deploy workflow | grudaagent.vercel.app |
| **Railway** | `Dockerfile` + `railway.toml` (service `gruda-agent`) | grudanode-production.up.railway.app |
| **Docker** | `docker compose up -d` (agent + Ollama) | localhost:3200 |
| **npx** | `npx gruda-agent` via `bin/gruda-agent.js` | localhost:3200 |
### CI / CD (`.github/workflows/`)
- **`ci.yml`** — on push to `main`/`dev` and PRs to `main`: `npm ci`, `node --check server.js`, and a `package.json` validity check (working dir `grudge-agent`).
- **`deploy.yml`** — on push to `main` (or manual dispatch with `staging`/`production`): deploys `grudge-agent` to **Vercel** and **Railway**. Requires repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `RAILWAY_TOKEN`.
- **`grudgedot-deploy.yml`** — deploys the sibling `grudgedot` service.
- **`release.yml`** — tagged GitHub Releases.
## Data & persistence
- **Per-project** — `gruda.md` (memory), `.gruda/truth.json` (worker orchestrator shared truth; steps append to `.gruda/orchestrator.log.jsonl`), and `.gruda/scenes/*.json` (saved Environment scenes).
- **Per-user** — `~/.gruda-agent/config.json` (config + cloud tokens) and `history.json` (session history).
- **Optional Postgres** — when `DATABASE_URL` is set, config/projects/memory/history are mirrored durably; otherwise local files are the source of truth.
- **Serverless note** — on Vercel only `/tmp` is writable, so file persistence is ephemeral there; use Railway + Postgres for durable storage.
## Conventions
- **No build step.** The SPA is a single hand-edited `public/index.html`; the backend is a single `server.js`. Keep them dependency-light.
- **Secrets via env only.** Never commit `.env`; `.vercelignore`/`.dockerignore` keep it out of bundles. Cloud tokens are stored locally in `~/.gruda-agent/config.json`, never sent to Grudge Studio.
- **Line endings.** Existing files use CRLF on Windows — preserve them.
- **Commits.** Conventional, focused commits. Include a trailer:
  `Co-Authored-By: Oz <oz-agent@warp.dev>`
## Links
- **Grudge Studio** — [grudge-studio.com](https://grudge-studio.com)
- **Repo** — [MolochDaGod/GrudaNode](https://github.com/MolochDaGod/GrudaNode)
- **Issues** — [GitHub Issues](https://github.com/MolochDaGod/GrudaNode/issues)

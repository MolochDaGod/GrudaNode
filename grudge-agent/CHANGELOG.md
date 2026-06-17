# Changelog

All notable changes to **GRUDA Agent** are documented here.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-17
Grok Build alignment for cloud agentic actions on gruda-agent.vercel.app.
### Added
- **Grok/xAI agent loop** (`lib/grok-build.js`) — tool-using Agent mode on Vercel when `XAI_API_KEY` is set.
- **Bundled skills** (`skills/design`, `skills/implement`, `skills/grudge-studio`) — Grok Build skills-first pattern.
- **Grudge Studio resource map** + agentic design theory woven into every agent system prompt.
- **`GET /api/skills`** and **`GET /api/skills/:id`** — discover skill workflows.
- **Treaty Chat client** — `sendTreaty`, `updateTreatyStatus`, `onTreatyMsg`; direct WS + HTTP fallback on serverless.
- **`GET /api/treaty/messages`** — buffered messages when relay is offline.
### Changed
- Cloud hosts default to **Agent mode + Grok** when available; Puter models remain for Chat.
- Health reports `grok`, `skills`, `serverless` status; sidebar shows Grok indicator.
- Onboarding/config persists via **localStorage** on ephemeral Vercel `/tmp`.
### Fixed
- **IDE**: `project` query param for file tree; `path` alias for read/write/run.
- **WebSocket**: no longer hardcodes `ws://127.0.0.1` on production; local WS uses page host.
- Agent stream emits `tool_call` events consistently for UI rendering.

## [1.1.0] - 2026-06-15
GRUDA Agent grows from a local tool into a cloud-capable agentic workspace.
### Added
- **Free Puter cloud models** in chat (GPT/Claude/Gemini/DeepSeek) — the app now works
  with zero local setup; defaults to a Puter model when Ollama isn't present.
- **Music generation (Mureka)**: `/api/music/song`, `/instrumental`, `/lyrics`, and
  `/api/music/task/:kind/:id` polling (mp3/wav/flac).
- **Voice (ElevenLabs)**: `/api/tts` + `/api/tts/voices`; the agent can speak replies,
  with automatic browser speech-synthesis fallback when no key is set.
- **AI worker orchestrator**: `code/art3d/lore/balance/campaign/qa` workers that share a
  per-project **communal truth store** (`.gruda/truth.json`) with append-only step logs
  (`.gruda/orchestrator.log.jsonl`) and a QA/checks pass — `POST /api/orchestrate` (SSE),
  `GET /api/workers`, `GET/POST /api/truth`.
- **New agent tools**: `unzip`, `convert_file`, `open_url`; plus REST `POST /api/upload`,
  `POST /api/cache/clear`, and a GrudaChain proxy (`/api/grudachain/*`).
- **Smarter onboarding**: names your AI and stores **rules** + **vocal/talk commands**,
  woven into the agent persona; **ask-a-clarifying-question-when-unsure** behavior.
- **Editable project memory** endpoint (`POST /api/projects/:name/memory`).
- **Expanded Postgres**: `gruda_projects`, `gruda_memory`, `gruda_onboarding`, `gruda_music`
  tables with write-through + boot hydrate; `/api/health` now reports `db/music/voice`.
- `.dockerignore` so secrets/`node_modules` never get baked into the image.
### Changed
- `server.js` exports the Express app and skips `listen()` under serverless hosts.
- Railway config documents required service variables and honors `DATA_DIR`/`PROJECTS_DIR`.
- README rewritten for the cloud + music + voice + orchestrator feature set.
### Fixed
- Repaired the SPA: defined missing core helpers (`setSend`, `speak`, `appendMsg`,
  `scrollBot`, `mdToHtml`, `esc`, `fmtDate`), fixed the `#msgs` container id mismatch,
  removed a dead duplicate onboarding flow and a duplicate `loadProjects`, restored the
  splash init, and fixed a corrupted line in `runAgent`'s stream parser.
## [1.0.0] - 2026-06-14
First public release of GRUDA Agent — a local, agentic AI workspace by Grudge Studio.

### Added
- **Agentic AI loop** over Ollama with an 8-tool toolset: `search_files`, `read_file`,
  `write_file`, `list_directory`, `create_folder`, `update_memory`, `web_search`,
  and `run_command`.
- **Chat & Agent modes** with token-by-token SSE streaming.
- **Project memory** via a per-project `gruda.md` file that persists context across sessions.
- **First-run onboarding wizard** that generates a personalized system prompt.
- **Built-in IDE tab** — Monaco editor with a live file tree, one-click **Run** (Node
  sandbox), and **AI Snippet** code generation.
- **Assets tab** — browse and search 3D models, textures, and HDRIs from Poly Haven,
  Poly Pizza, and Grudge Studio.
- **Treaty Chat** — live community relay shared by every GRUDA Agent user.
- **Voice input / TTS** via the browser Web Speech API.
- **Cloud & Deploy tab** — connect Puter, Google Drive, GitHub, and Vercel; push repos
  and one-click deploy. Tokens are stored locally in `~/.gruda-agent/config.json`.
- **Optional Postgres** persistence for session history via `DATABASE_URL`
  (falls back to local JSON when unset).
- **`npx gruda-agent` CLI** plus `START.bat`, `start.sh`, and `wsl-start.sh` launchers.
- **Deploy configs** for Docker (`Dockerfile` + `docker-compose.yml`), Vercel
  (`vercel.json`), Railway (`railway.toml`), and Cloudflare Tunnel (`cloudflared.yml`).

[1.0.0]: https://github.com/MolochDaGod/GrudaNode/releases/tag/v1.0.0

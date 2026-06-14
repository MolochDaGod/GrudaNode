# Changelog

All notable changes to **GRUDA Agent** are documented here.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

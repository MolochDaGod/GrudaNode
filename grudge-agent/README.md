# ⚔️ GRUDA Agent

**Agentic AI workspace by Grudge Studio.** Runs on your machine via [Ollama](https://ollama.com) — or fully in the cloud with **free [Puter](https://puter.com) models** (no install, no API keys) — or deploy it anywhere.

> Build software, make music, generate voiceovers, automate workflows, and run a whole **team of AI workers** — with a persistent, memory-aware agent that knows your projects and follows your rules.

**New in v1.1.0:** free Puter cloud models · 🎵 Mureka music · 🗣️ ElevenLabs voice · 🤝 AI worker orchestrator with a shared “truth” store · upload/unzip/convert tools · user rules + vocal commands · ask-when-unsure agent behavior · expanded Postgres persistence.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/MolochDaGod/GrudaNode)
[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MolochDaGod/GrudaNode)

---

## Quick Start

### One command — npx (no install)
```bash
npx gruda-agent
```
Opens at `http://localhost:3200`. That's it.

### Windows (no Node required yet)
1. Download or clone this repo
2. Double-click **`START.bat`**
3. Auto-installs Node.js + Ollama + an AI model, then launches

### Mac / Linux
```bash
git clone https://github.com/MolochDaGod/GrudaNode
cd GrudaNode/grudge-agent
./start.sh
```

### WSL (Windows Subsystem for Linux)
```bash
cd grudge-agent
./wsl-start.sh
```
Opens automatically in your Windows browser.

### Install globally (use from any IDE or terminal)
```bash
npm install -g gruda-agent
gruda-agent                  # port 3200
gruda-agent --port 4000
gruda-agent --no-open
```
Works from VSCode terminal, Cursor, Warp, JetBrains, or any shell.

---

## What it does

| Feature | Details |
|---|---|
| 🤖 **Agentic AI** | File search/read/write, folders, web search/browse, shell (npm/node/git), unzip, convert, uploads |
| ☁️ **Free cloud models** | Chat via **Puter** (GPT/Claude/Gemini/DeepSeek) — no install, no API keys, runs in your browser |
| 🖥️ **Local models** | Or run fully offline via **Ollama** (mistral, llama3, qwen, phi3…) |
| 🤝 **Worker orchestrator** | A team of workers (code · 3D/art · lore · balance · campaign · QA) sharing one **communal truth** store, with a checks pass |
| 🎵 **Music (Mureka)** | Generate songs, instrumentals, and lyrics; poll to completion; mp3/wav/flac |
| 🗣️ **Voice (ElevenLabs)** | Natural TTS for replies, with browser speech-synthesis fallback |
| 🧠 **Project memory** | `gruda.md` per project — your goals, stack, preferences, and the worker truth |
| 🧙 **Smart onboarding** | First-run wizard names your AI and sets your **rules** + **vocal commands** |
| 🛡️ **Rules + ask-when-unsure** | Follows your rules and asks a clarifying question instead of guessing |
| 🖥️ **Built-in IDE** | Monaco editor, file tree, one-click **Run**, **AI Snippet** generation |
| 🎨 **Asset browser** | 3D models, textures, HDRIs from Poly Haven, Poly Pizza, Grudge Studio |
| 💬 **Treaty Chat** | Live community relay shared by every GRUDA Agent user |
| 🗄️ **Postgres (optional)** | `DATABASE_URL` persists config, projects, memory, music, history; falls back to local files |
| 🔌 **Runs anywhere** | `npx gruda-agent`, Docker, Railway, or any terminal/IDE |

---

## Interface

The app is a single-page workspace with five tabs:

| Tab | What's inside |
|---|---|
| ⚔️ **AI Workspace** | Chat & Agent modes, model picker, voice input/TTS, per-project `gruda.md` memory |
| 🖥️ **IDE** | Monaco code editor + project file tree, **▶ Run** (Node sandbox), and **✨ AI Snippet** code generation |
| 🎨 **Assets** | Browse and search 3D models, textures, and HDRIs from Poly Haven, Poly Pizza, and Grudge Studio |
| 💬 **Treaty Chat** | Live community relay shared by every GRUDA Agent user |
| ☁️ **Cloud & Deploy** | Connect Puter, Google Drive, GitHub, and Vercel — push repos and one-click deploy |

---

## Deploy Options

### 🐳 Docker (recommended for servers)

```bash
# With bundled Ollama (full stack)
docker compose up -d

# Pulls mistral:latest on first run (~3.8 GB)
docker exec gruda-ollama ollama pull mistral
```

Or run just the agent (point it at an existing Ollama):
```bash
docker run -d \
  -p 3200:3200 \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  -v gruda-data:/data \
  -v gruda-projects:/projects \
  grudastudio/gruda-agent:latest
```

### ▲ Vercel (web UI, no Ollama — needs external Ollama URL)

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MolochDaGod/GrudaNode)

Or via the in-app Cloud & Deploy tab → connect Vercel token → Deploy.

Set `OLLAMA_HOST` to your Ollama server URL in Vercel environment variables.

### 🚂 Railway (recommended cloud — free tier + Postgres)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/MolochDaGod/GrudaNode)

Uses the included `Dockerfile` / `railway.toml`. Chat works out of the box with **free Puter cloud models** (no Ollama needed). Add a **Postgres** plugin and set `DATABASE_URL = ${{Postgres.DATABASE_URL}}` for durable projects, memory, and history. Optionally set `MUREKA_API_KEY` and `ELEVENLABS_API_KEY` to enable music and voice. (Want local models too? Add an Ollama service and set `OLLAMA_HOST`.)

### ☁️ Puter Cloud (your personal cloud computer)

Connect from the **Cloud & Deploy** tab inside the app — sign in with Puter.com and upload your entire project to your Puter file system with one click. Free tier available.

### 🌐 Cloudflare Tunnel (expose local to the web)

```bash
# Install cloudflared
winget install Cloudflare.cloudflared         # Windows
brew install cloudflared                       # Mac

# Set up tunnel
cloudflared tunnel login
cloudflared tunnel create gruda-agent
# Edit cloudflared.yml with your tunnel UUID
cloudflared tunnel run gruda-agent
```

---

## Requirements (local)

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Ollama** — [ollama.com](https://ollama.com) (free, local, open source)
- **A model** — `ollama pull mistral` (~3.8 GB)

`START.bat` and `start.sh` install everything automatically.

### Recommended models

| Model | Size | Best for |
|---|---|---|
| `mistral:latest` | 3.8 GB | Best overall — default |
| `llama3.2:3b` | 2.0 GB | Fastest — low RAM machines |
| `phi3:mini` | 2.2 GB | Code-focused |
| `qwen2.5:7b` | 4.7 GB | Strongest reasoning |

---

## Configuration

Copy `.env.example` to `.env`:

```env
PORT=3200
OLLAMA_HOST=http://127.0.0.1:11434

# Optional: splash GIFs on startup screen
SPLASH_GIF1=C:\path\to\grudgestudio.gif
SPLASH_GIF2=C:\path\to\hts.gif

# Optional: Treaty Chat (defaults to Grudge Studio relay)
TREATY_CHAT_URL=https://master.grudge-studio.com

# Optional: Brave Search for richer web results
BRAVE_SEARCH_KEY=

# Optional: Mureka music generation (enables the music API)
MUREKA_API_KEY=
MUREKA_MODEL=auto

# Optional: ElevenLabs voice (blank = browser speech synthesis)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Optional: Poly Pizza API key for the Assets browser
POLY_PIZZA_KEY=

# Optional: Postgres for persistent session history (falls back to local JSON)
DATABASE_URL=

# Optional: Cloudflare tunnel for public access
CLOUDFLARE_TUNNEL_TOKEN=
```

Cloud tokens (GitHub, Vercel, Google Drive, Puter) are stored locally in `~/.gruda-agent/config.json` after connecting via the **Cloud & Deploy** tab — never hardcoded.

---

## Agent tools

| Tool | What it does |
|---|---|
| `search_files` | Find files by name or content |
| `read_file` | Read any local file |
| `write_file` | Create or overwrite files |
| `list_directory` | List folder contents |
| `create_folder` | Make directories |
| `update_memory` | Write to project `gruda.md` |
| `web_search` | DuckDuckGo or Brave search |
| `run_command` | Shell commands — npm, node, git (allow-listed) |
| `unzip` | Extract a `.zip` archive |
| `convert_file` | Convert between text / json / csv / base64 |
| `open_url` | Fetch and read a web page (lightweight browsing) |

---

## AI worker orchestrator

Give a goal and a **team of AI workers** executes it together, sharing one source of truth:

| Worker | Scope |
|---|---|
| `code` | Code, configs, scripts |
| `art3d` | three.js scenes, materials, game boards |
| `lore` | Story, worlds, NPCs, D&D characters |
| `balance` | Stats, economy, difficulty |
| `campaign` | D&D campaigns: acts, encounters, maps |
| `qa` | Validates everything against the shared truth |

The orchestrator **plans → dispatches workers → runs a QA/checks pass**. Each worker reads and writes a per-project **communal truth store** at `<project>/.gruda/truth.json`, and every step is appended to `<project>/.gruda/orchestrator.log.jsonl` for easy debugging.

```bash
curl -N -X POST http://localhost:3200/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"goal":"Design a level-1 D&D dungeon","project":"my-campaign"}'
```

---

## Music & Voice

- **Music** — set `MUREKA_API_KEY`, call `/api/music/song` (or `/instrumental`, `/lyrics`), then poll `/api/music/task/:kind/:id` for mp3/wav/flac.
- **Voice** — set `ELEVENLABS_API_KEY` and the agent can speak replies via `/api/tts`. With no key, the browser's speech synthesis is used automatically.

---

## REST API

| Method & path | Purpose |
|---|---|
| `POST /api/chat/stream` · `POST /api/agent/stream` | Chat / agentic tool loop (SSE) |
| `POST /api/orchestrate` · `GET /api/workers` · `GET /api/truth` | Worker orchestrator + communal truth |
| `POST /api/music/song\|instrumental\|lyrics` · `GET /api/music/task/:kind/:id` | Music generation |
| `POST /api/tts` · `GET /api/tts/voices` | ElevenLabs voice |
| `POST /api/upload` · `POST /api/cache/clear` | Uploads + cache clearing |
| `GET/POST /api/projects` · `GET/POST /api/projects/:name/memory` | Projects + `gruda.md` |
| `GET /api/health` | Status: ollama, db, music, voice, treaty |

---

## Cloud Integrations

Connect from the **☁️ Cloud & Deploy** tab inside the app:

| Service | What you get |
|---|---|
| **Puter** | Your personal cloud computer — upload projects, deploy apps |
| **Google Drive** | Sync project files to Drive folders |
| **GitHub** | Push projects to repos, create new repos |
| **Vercel** | One-click production deployments |

All tokens stored locally in `~/.gruda-agent/config.json`. Never sent to Grudge Studio.

---

## Treaty Chat

Every GRUDA Agent user automatically joins **Treaty Chat** — Grudge Studio's live community relay. Share builds, get feedback, collaborate in real time. No account needed. Your Grudge ID syncs automatically if you have one.

---

## Project structure

```
grudge-agent/
├── server.js           # Express + WS backend: agent loop, orchestrator, music, voice, IDE, assets, Postgres (~1000 lines)
├── public/
│   └── index.html      # Full SPA — no build step (~1340 lines)
├── bin/
│   └── gruda-agent.js  # CLI entry: npx gruda-agent
├── Dockerfile          # Docker image
├── .dockerignore       # Keeps secrets / node_modules out of the image
├── docker-compose.yml  # Full stack (agent + Ollama)
├── vercel.json         # Vercel deployment config
├── railway.toml        # Railway deployment config
├── cloudflared.yml     # Cloudflare tunnel config
├── wsl-start.sh        # WSL launcher
├── START.bat           # Windows launcher (auto-setup)
├── start.sh            # Mac/Linux launcher
├── setup.ps1           # Windows auto-installer
├── .env.example        # Config template
└── package.json        # npm package (gruda-agent)
```

---

## Community & links

- **Treaty Chat** — live in the app
- **Grudge Studio** — [grudge-studio.com](https://grudge-studio.com)
- **GitHub** — [MolochDaGod/GrudaNode](https://github.com/MolochDaGod/GrudaNode)
- **Issues** — [GitHub Issues](https://github.com/MolochDaGod/GrudaNode/issues)

---

## License

MIT — Grudge Studio / RacAlvin The Pirate King

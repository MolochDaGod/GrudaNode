# ⚔️ GRUDA Agent

**Local agentic AI workspace by Grudge Studio.** No cloud required. No API keys. Runs on your machine via [Ollama](https://ollama.com) — or deploy it anywhere.

> Build software, write music, automate workflows, create game AI — with a persistent, memory-aware AI agent that knows your projects and connects your whole community via Treaty Chat.

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
| 🤖 **Agentic AI** | File search/read/write, web search, shell commands, folder creation |
| 🧠 **Project memory** | `gruda.md` per project — agent remembers your goals, stack, preferences |
| 🖥️ **Built-in IDE** | Monaco editor with live file tree, one-click **Run**, and **AI Snippet** generation |
| 🎨 **Asset browser** | Search & grab 3D models, textures, and HDRIs from Poly Haven, Poly Pizza, and Grudge Studio |
| 💬 **Treaty Chat** | Live community chat — all GRUDA Agent users share one room |
| 🎤 **Voice input / TTS** | Browser-native Web Speech API — no keys, no account |
| 🌊 **Streaming** | Token-by-token streaming for both chat and agent modes |
| 📋 **Session history** | Past sessions on splash screen with AI recaps |
| 🧙 **First-run wizard** | AI-guided onboarding generates your personal system prompt |
| ☁️ **Cloud & Deploy** | Push to GitHub, deploy to Vercel/Railway/Puter, sync to Google Drive |
| 🗄️ **Optional Postgres** | Set `DATABASE_URL` to persist session history; falls back to local JSON |
| 🔌 **Runs anywhere** | `npx gruda-agent` works from any terminal or IDE (VSCode, Cursor, Warp, JetBrains) |

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

### 🚂 Railway (full stack with persistent storage)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/MolochDaGod/GrudaNode)

Add an Ollama service from the Railway marketplace, then set `OLLAMA_HOST`.

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
| `run_command` | Shell commands (allow-listed) |

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
├── server.js           # Express + WebSocket backend: agent loop, IDE, assets, cloud, optional Postgres (~920 lines)
├── public/
│   └── index.html      # Full SPA — no build step (~1220 lines)
├── bin/
│   └── gruda-agent.js  # CLI entry: npx gruda-agent
├── Dockerfile          # Docker image
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

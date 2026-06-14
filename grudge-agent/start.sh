#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GRUDA Agent — macOS / Linux Launcher
#  Grudge Studio — RacAlvin The Pirate King
# ═══════════════════════════════════════════════════════════════
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  [✓] $1${NC}"; }
info() { echo -e "${CYAN}  [→] $1${NC}"; }
warn() { echo -e "${YELLOW}  [!] $1${NC}"; }
err()  { echo -e "${RED}  [✗] $1${NC}"; exit 1; }

cd "$(dirname "$0")"
echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   GRUDA AGENT  v1.0.0                         ║"
echo "  ║   Grudge Studio · RacAlvin The Pirate King    ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# Node.js
if ! command -v node &>/dev/null; then
    err "Node.js not found. Install from https://nodejs.org (v18+)"
fi
ok "Node.js: $(node --version)"

# Ollama
if ! command -v ollama &>/dev/null; then
    warn "Ollama not found. Installing..."
    curl -fsSL https://ollama.com/install.sh | sh
fi
ok "Ollama: $(ollama --version 2>/dev/null || echo 'installed')"

# Start Ollama if not running
if ! curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then
    info "Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 3
fi

# Check for model
MODELS=$(curl -sf http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"' | head -1 || echo "")
if [ -z "$MODELS" ]; then
    info "No models found. Pulling mistral:latest (~3.8 GB)..."
    ollama pull mistral:latest
fi

# npm install
if [ ! -d "node_modules" ]; then
    info "Installing dependencies..."
    npm install --silent
fi

# .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    ok "Created .env"
fi

echo ""
ok "GRUDA Agent starting at http://localhost:3200"
echo ""

# Open browser
if command -v xdg-open &>/dev/null; then
    (sleep 2 && xdg-open http://localhost:3200) &
elif command -v open &>/dev/null; then
    (sleep 2 && open http://localhost:3200) &
fi

node server.js

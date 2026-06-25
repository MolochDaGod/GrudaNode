#!/usr/bin/env bash
# GRUDA Agent — Linux one-click install
#   curl -fsSL https://ai.grudge-studio.com/install-linux.sh | bash
# Or: bash <(curl -fsSL https://ai.grudge-studio.com/install-linux.sh)
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}  [✓] $1${NC}"; }
info() { echo -e "${CYAN}  [→] $1${NC}"; }
warn() { echo -e "${YELLOW}  [!] $1${NC}"; }
err()  { echo -e "${RED}  [✗] $1${NC}"; exit 1; }

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   GRUDA Agent — Linux Install                 ║"
echo "  ║   Grudge Studio                               ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

if ! command -v node >/dev/null 2>&1; then
  err "Node.js 18+ required. Install from https://nodejs.org or: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  err "Node.js 18+ required (found $(node --version))"
fi
ok "Node.js $(node --version)"

INSTALL_OLLAMA="${INSTALL_OLLAMA:-1}"
if [ "$INSTALL_OLLAMA" = "1" ]; then
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama not found — installing (set INSTALL_OLLAMA=0 to skip)..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  ok "Ollama $(ollama --version 2>/dev/null || echo ready)"
  if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    info "Starting Ollama..."
    (ollama serve >/dev/null 2>&1 &)
    sleep 3
  fi
  if ! curl -sf http://127.0.0.1:11434/api/tags | grep -q '"name"'; then
    info "Pulling mistral:latest (~3.8 GB) for offline chat..."
    ollama pull mistral:latest
  fi
else
  warn "Skipping Ollama — use Puter cloud models in the browser or set GRUDGE_AI_KEY in ~/.gruda-agent/.env"
fi

AGENT_DIR="${GRUDA_AGENT_DIR:-$HOME/.gruda-agent}"
mkdir -p "$AGENT_DIR"
ENV_FILE="$AGENT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat >"$ENV_FILE" <<'EOF'
PORT=3200
OLLAMA_HOST=http://127.0.0.1:11434
DEFAULT_MODEL=grudge:gemini-3.5-flash
GRUDGE_AI_HUB_URL=https://ai.grudge-studio.com
# GRUDGE_AI_KEY=your-legion-hub-api-key
GRUDGE_AUTH_URL=https://id.grudge-studio.com
EOF
  ok "Created $ENV_FILE (add GRUDGE_AI_KEY for cloud Gemini without Ollama)"
fi

export PORT="${PORT:-3200}"
info "Launching GRUDA Agent on http://127.0.0.1:${PORT} ..."
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://127.0.0.1:${PORT}") >/dev/null 2>&1 &
fi

exec npx --yes gruda-agent@latest --port "$PORT" --no-open
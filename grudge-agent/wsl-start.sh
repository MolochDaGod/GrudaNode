#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GRUDA Agent — WSL Launcher
#  Run this from WSL to start GRUDA Agent and open it in Windows browser
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# Start Ollama if not running
if ! curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; then
  echo "[gruda] Starting Ollama..."
  ollama serve &>/dev/null &
  sleep 3
fi

# Install deps if needed
[ ! -d "node_modules" ] && npm install --silent
[ ! -f ".env" ] && cp .env.example .env

# Open in Windows default browser via WSL interop
(sleep 2 && cmd.exe /C "start http://localhost:3200" 2>/dev/null || true) &

echo ""
echo "  ⚔️  GRUDA Agent running at http://localhost:3200"
echo "  Press Ctrl+C to stop."
echo ""

node server.js

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  GRUDA Agent — WSL/Ubuntu One-Time Setup
#  Run this ONCE in your WSL terminal. It wires up:
#    · Git credential manager (no more password prompts)
#    · xdg-open → Windows apps (open files from WSL)
#    · File type associations (code, images, PDFs, etc.)
#    · Node.js, Ollama, git config
#  Usage: bash wsl-setup.sh
# ═══════════════════════════════════════════════════════════════

set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  [✓] $1${NC}"; }
info() { echo -e "${CYAN}  [→] $1${NC}"; }
warn() { echo -e "${YELLOW}  [!] $1${NC}"; }

echo ""
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║   GRUDA Agent — WSL Setup                     ║"
echo "  ║   Grudge Studio · RacAlvin The Pirate King    ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo ""

# ── 1. Git Credential Manager ──────────────────────────────────
info "Wiring Git to Windows Credential Manager..."

# GCM ships with Git for Windows — use it from WSL
GCM_PATH=""
for p in \
  "/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe" \
  "/mnt/c/Program Files/Git/mingw64/libexec/git-core/git-credential-manager.exe" \
  "/mnt/c/Program Files (x86)/Git/mingw64/bin/git-credential-manager.exe"
do
  [ -f "$p" ] && GCM_PATH="$p" && break
done

if [ -n "$GCM_PATH" ]; then
  git config --global credential.helper "$GCM_PATH"
  git config --global credential.https://github.com.provider generic
  ok "Git credential manager: $GCM_PATH"
else
  # Fallback: use git credential store (prompts once, stores plaintext)
  git config --global credential.helper store
  warn "Git for Windows GCM not found. Using credential store fallback."
  warn "Install Git for Windows (gitforwindows.org) for seamless auth."
fi

# Set git user if not already set
if ! git config --global user.email &>/dev/null; then
  read -p "  Your git email: " GIT_EMAIL
  read -p "  Your git name:  " GIT_NAME
  git config --global user.email "$GIT_EMAIL"
  git config --global user.name  "$GIT_NAME"
  ok "Git user configured"
else
  ok "Git user: $(git config --global user.name) <$(git config --global user.email)>"
fi

git config --global init.defaultBranch main
git config --global pull.rebase false

# ── 2. xdg-open → Windows (open files from WSL) ───────────────
info "Setting up xdg-open to use Windows apps..."

sudo tee /usr/local/bin/xdg-open > /dev/null << 'XDGEOF'
#!/bin/bash
# xdg-open shim: delegates to Windows "start" command via cmd.exe
# This makes `xdg-open file.pdf` open in Windows Adobe/Edge/etc.
if [ -z "$1" ]; then
  echo "Usage: xdg-open <file-or-url>" >&2
  exit 1
fi
TARGET="$1"
# Convert WSL path to Windows path if it's a file
if [ -e "$TARGET" ]; then
  TARGET=$(wslpath -w "$TARGET" 2>/dev/null || echo "$TARGET")
fi
cmd.exe /C "start \"\" \"$TARGET\"" 2>/dev/null
XDGEOF
sudo chmod +x /usr/local/bin/xdg-open
ok "xdg-open now opens files in Windows apps"

# ── 3. File opener aliases ─────────────────────────────────────
info "Adding file opener aliases..."

ALIASES_BLOCK='
# ── GRUDA WSL file openers ───────────────────────────────────
alias open="xdg-open"
alias code="/mnt/c/Users/$USER/AppData/Local/Programs/Microsoft\ VS\ Code/bin/code 2>/dev/null || code.exe"
alias explorer="explorer.exe"
alias chrome="/mnt/c/Program\ Files/Google/Chrome/Application/chrome.exe"

# Open current dir in Windows Explorer
alias here="explorer.exe ."

# Git shortcuts
alias gs="git status"
alias gp="git push"
alias ga="git add -A"
alias gc="git commit -m"
alias glog="git log --oneline -10"

# GRUDA Agent shortcuts
alias gruda="node $(wslpath -u "$(wslvar USERPROFILE 2>/dev/null || echo /mnt/c/Users/david)")/AppData/Roaming/Claude/local-agent-mode-sessions/*/outputs/GRUDA-Node/grudge-agent/server.js 2>/dev/null || node server.js"
# ── end GRUDA WSL ────────────────────────────────────────────
'

# Add to .bashrc if not already there
if ! grep -q "GRUDA WSL file openers" ~/.bashrc; then
  echo "$ALIASES_BLOCK" >> ~/.bashrc
  ok "Aliases added to ~/.bashrc"
else
  ok "Aliases already in ~/.bashrc"
fi

# ── 4. Node.js (via nvm) ───────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Installing Node.js via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  nvm alias default 20
  ok "Node.js $(node --version) installed"
else
  ok "Node.js: $(node --version)"
fi

# ── 5. Ollama ──────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
else
  ok "Ollama: $(ollama --version 2>/dev/null || echo installed)"
fi

# ── 6. Pull Mistral if no models ───────────────────────────────
info "Checking for AI models..."
ollama serve &>/dev/null & sleep 4
MODELS=$(ollama list 2>/dev/null | tail -n +2 | wc -l)
if [ "$MODELS" -eq 0 ]; then
  info "Pulling mistral:latest (~3.8 GB)..."
  ollama pull mistral:latest
  ok "mistral:latest ready"
else
  ok "Models available: $MODELS"
fi

# ── 7. Install grudge-agent deps ───────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ]; then
  info "Installing grudge-agent dependencies..."
  cd "$SCRIPT_DIR"
  npm install --silent
  [ ! -f .env ] && cp .env.example .env && ok "Created .env"
  ok "grudge-agent ready"
fi

# ── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ╔═══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ║   WSL setup complete!                         ║${NC}"
echo -e "${GREEN}  ╚═══════════════════════════════════════════════╝${NC}"
echo ""
ok "Git credential manager → no more password prompts"
ok "xdg-open / open → opens files in Windows apps"
ok "Aliases loaded (run 'source ~/.bashrc' or open a new terminal)"
echo ""
info "To push to GitHub: cd E:\\GRUDA-Node  (or /mnt/e/GRUDA-Node in WSL)"
info "  git add grudge-agent/ && git commit -m 'release' && git push"
echo ""
info "To start GRUDA Agent: bash wsl-start.sh"
echo ""

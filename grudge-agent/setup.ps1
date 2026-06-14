# ═══════════════════════════════════════════════════════════════
#  GRUDA Agent — Auto Setup
#  Downloads and configures everything needed to run locally.
#  No accounts. No API keys. No cloud. Just your machine.
#  Grudge Studio — RacAlvin The Pirate King
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "GRUDA Agent Setup"

function Write-Header($text) {
    Write-Host ""
    Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "  $text" -ForegroundColor Yellow
    Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
}
function Write-Ok($text)   { Write-Host "  [✓] $text" -ForegroundColor Green }
function Write-Info($text) { Write-Host "  [→] $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Err($text)  { Write-Host "  [✗] $text" -ForegroundColor Red }

Clear-Host
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════╗" -ForegroundColor DarkYellow
Write-Host "  ║   GRUDA AGENT  — Auto Setup                   ║" -ForegroundColor Yellow
Write-Host "  ║   Grudge Studio · RacAlvin The Pirate King    ║" -ForegroundColor DarkYellow
Write-Host "  ║   Local Agentic AI · No Cloud · No Keys       ║" -ForegroundColor DarkYellow
Write-Host "  ╚═══════════════════════════════════════════════╝" -ForegroundColor DarkYellow
Write-Host ""
Write-Info "This script will install: Node.js · Ollama · Mistral AI model"
Write-Info "Everything runs on YOUR machine. Nothing is sent to the cloud."
Write-Host ""
Read-Host "  Press Enter to begin setup (Ctrl+C to cancel)"

# ── 1. Node.js ────────────────────────────────────────────────
Write-Header "Step 1 of 4 — Node.js"

$nodeOk = $false
try {
    $nodeVer = node --version 2>$null
    if ($nodeVer) { Write-Ok "Node.js already installed: $nodeVer"; $nodeOk = $true }
} catch { }

if (-not $nodeOk) {
    Write-Info "Downloading Node.js LTS..."
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-setup.msi"
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
        Write-Info "Installing Node.js (this may take a minute)..."
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $nodeVer = node --version 2>$null
        if ($nodeVer) { Write-Ok "Node.js installed: $nodeVer" }
        else { Write-Warn "Node.js installed but PATH not refreshed. Restart setup after reboot." }
        Remove-Item $nodeMsi -ErrorAction SilentlyContinue
    } catch {
        Write-Err "Failed to install Node.js automatically."
        Write-Info "Please install manually from: https://nodejs.org"
        Write-Info "Then run setup.ps1 again."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── 2. Ollama ─────────────────────────────────────────────────
Write-Header "Step 2 of 4 — Ollama (Local AI Runtime)"

$ollamaOk = $false
try {
    $ollamaVer = ollama --version 2>$null
    if ($ollamaVer) { Write-Ok "Ollama already installed: $ollamaVer"; $ollamaOk = $true }
} catch { }

if (-not $ollamaOk) {
    Write-Info "Downloading Ollama for Windows (~120 MB)..."
    $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    $ollamaExe = "$env:TEMP\OllamaSetup.exe"
    try {
        Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaExe -UseBasicParsing
        Write-Info "Installing Ollama..."
        Start-Process $ollamaExe -ArgumentList "/S" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $ollamaVer = ollama --version 2>$null
        if ($ollamaVer) { Write-Ok "Ollama installed: $ollamaVer" }
        else { Write-Ok "Ollama installed (restart may be needed to update PATH)" }
        Remove-Item $ollamaExe -ErrorAction SilentlyContinue
    } catch {
        Write-Err "Failed to install Ollama automatically."
        Write-Info "Please install manually from: https://ollama.com/download"
        Write-Info "Then run setup.ps1 again."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── 3. Pull AI model ──────────────────────────────────────────
Write-Header "Step 3 of 4 — Download AI Model"

# Start Ollama service if not running
try {
    $ping = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
} catch {
    Write-Info "Starting Ollama service..."
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

Write-Info "Checking for AI model..."
try {
    $tags = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing | ConvertFrom-Json
    $hasModel = $tags.models | Where-Object { $_.name -match "mistral|llama|qwen|phi" }
    if ($hasModel) {
        Write-Ok "AI model already available: $($hasModel[0].name)"
    } else {
        Write-Host ""
        Write-Host "  Choose your AI model:" -ForegroundColor Cyan
        Write-Host "  [1] Mistral 7B     — Best overall · 3.8 GB" -ForegroundColor White
        Write-Host "  [2] Llama 3.2 3B   — Fastest · 2.0 GB (good for slower machines)" -ForegroundColor White
        Write-Host "  [3] Phi-3 Mini     — Microsoft · 2.2 GB · great for code" -ForegroundColor White
        Write-Host "  [4] Qwen2.5 7B     — Excellent reasoning · 4.7 GB" -ForegroundColor White
        Write-Host ""
        $choice = Read-Host "  Enter choice (1-4) [default: 1]"
        $modelName = switch ($choice) {
            "2" { "llama3.2:3b" }
            "3" { "phi3:mini" }
            "4" { "qwen2.5:7b" }
            default { "mistral:latest" }
        }
        Write-Info "Downloading $modelName — this may take several minutes..."
        Write-Info "(Larger models are smarter. You can add more later from the app.)"
        Write-Host ""
        ollama pull $modelName
        if ($LASTEXITCODE -eq 0) { Write-Ok "Model ready: $modelName" }
        else { Write-Warn "Model download may have issues. The app will retry on first use." }
    }
} catch {
    Write-Warn "Could not connect to Ollama to pull model. Start Ollama and run: ollama pull mistral"
}

# ── 4. Node deps + .env ───────────────────────────────────────
Write-Header "Step 4 of 4 — Project Setup"

Write-Info "Installing Node dependencies..."
Set-Location $PSScriptRoot
npm install --silent
if ($LASTEXITCODE -eq 0) { Write-Ok "Dependencies installed" }
else { Write-Warn "npm install had issues — try running it manually" }

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Ok "Created .env config file"
} else {
    Write-Ok ".env already exists"
}

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║   Setup complete! GRUDA Agent is ready.       ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Ok "Everything is installed and configured."
Write-Info "To start: double-click START.bat"
Write-Info "Or run:   node server.js"
Write-Host ""

$launch = Read-Host "  Launch GRUDA Agent now? (Y/n)"
if ($launch -ne "n" -and $launch -ne "N") {
    Start-Process "http://localhost:3200"
    Start-Process "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot
}

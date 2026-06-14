# ═══════════════════════════════════════════════════════════════
#  GRUDA Agent — Smart File Opener (Windows)
#  Knows which app to use for every file type.
#  Usage: .\open.ps1 myfile.pdf
#         .\open.ps1 http://localhost:3200
#  Or drop on taskbar / add to PATH for global use.
# ═══════════════════════════════════════════════════════════════

param([string]$Target)

if (-not $Target) {
  Write-Host "Usage: open.ps1 <file-or-url>" -ForegroundColor Yellow
  exit 1
}

# URL — open in default browser
if ($Target -match "^https?://") {
  Start-Process $Target
  exit 0
}

# Resolve to absolute path
if (-not [System.IO.Path]::IsPathRooted($Target)) {
  $Target = Join-Path (Get-Location) $Target
}

if (-not (Test-Path $Target)) {
  Write-Host "  [!] Not found: $Target" -ForegroundColor Red
  exit 1
}

$ext = [System.IO.Path]::GetExtension($Target).ToLower()

# App routing by file type
$app = switch ($ext) {
  # Code / text
  { $_ -in ".js",".ts",".jsx",".tsx",".py",".go",".rs",".cs",".cpp",".c",".h",".sh",".bat",".ps1",".json",".yaml",".yml",".toml",".env",".md",".txt",".xml",".sql",".css",".html" } {
    # Try VS Code first, fall back to Notepad
    $vscode = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
    if (Test-Path $vscode) { $vscode } else { "notepad.exe" }
  }
  # Documents
  ".pdf"  { "msedge.exe" }
  ".docx" { "WINWORD.EXE" }
  ".xlsx" { "EXCEL.EXE" }
  ".pptx" { "POWERPNT.EXE" }
  # Images
  { $_ -in ".png",".jpg",".jpeg",".gif",".webp",".bmp",".svg" } { "mspaint.exe" }
  # Video / Audio
  { $_ -in ".mp4",".mkv",".avi",".mov",".webm",".mp3",".wav",".flac" } { "wmplayer.exe" }
  # Archives
  { $_ -in ".zip",".7z",".tar",".gz",".rar" } { "explorer.exe" }
  # Default: let Windows pick
  default { $null }
}

if ($app) {
  try {
    Start-Process $app $Target -ErrorAction SilentlyContinue
    Write-Host "  [✓] Opened with $([System.IO.Path]::GetFileName($app))" -ForegroundColor Green
  } catch {
    # Fall back to shell open
    Start-Process $Target
  }
} else {
  # Let Windows figure it out
  Start-Process $Target
}

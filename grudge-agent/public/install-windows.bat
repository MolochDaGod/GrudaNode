@echo off
REM GRUDA Agent — Windows one-click install
REM curl -fsSL https://ai.grudge-studio.com/install-windows.bat -o install.bat && install.bat
title GRUDA Agent Install
echo.
echo   GRUDA Agent — Windows Install
echo   Grudge Studio
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js 18+ required. Install from https://nodejs.org
  pause
  exit /b 1
)
echo   [OK] Node.js found

if not exist "%USERPROFILE%\.gruda-agent" mkdir "%USERPROFILE%\.gruda-agent"
if not exist "%USERPROFILE%\.gruda-agent\.env" (
  (
    echo PORT=3200
    echo OLLAMA_HOST=http://127.0.0.1:11434
    echo DEFAULT_MODEL=grudge:gemini-3.5-flash
    echo GRUDGE_AI_HUB_URL=https://ai.grudge-studio.com
    echo REM GRUDGE_AI_KEY=your-legion-hub-api-key
    echo GRUDGE_AUTH_URL=https://id.grudge-studio.com
  ) > "%USERPROFILE%\.gruda-agent\.env"
  echo   [OK] Created %USERPROFILE%\.gruda-agent\.env
)

echo   [->] Starting GRUDA Agent on http://127.0.0.1:3200 ...
start "" http://127.0.0.1:3200
npx --yes gruda-agent@latest --port 3200 --no-open
pause
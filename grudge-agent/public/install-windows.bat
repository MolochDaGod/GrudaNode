@echo off
REM GRUDA Agent — Windows one-click install
REM curl -fsSL https://grudaagent.vercel.app/install-windows.bat -o install.bat && install.bat
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

set "GRUDA_DATA=%APPDATA%\GrudgeStudio\gruda-agent"
set "GRUDA_PROJECTS=%LOCALAPPDATA%\GrudgeStudio\gruda-agent\projects"

if not exist "%GRUDA_DATA%" mkdir "%GRUDA_DATA%"
if not exist "%GRUDA_PROJECTS%" mkdir "%GRUDA_PROJECTS%"

if not exist "%GRUDA_DATA%\.env" (
  (
    echo PORT=3200
    echo OLLAMA_HOST=http://127.0.0.1:11434
    echo DEFAULT_MODEL=grudge:gemini-3.5-flash
    echo DATA_DIR=%GRUDA_DATA%
    echo PROJECTS_DIR=%GRUDA_PROJECTS%
    echo GRUDGE_AI_HUB_URL=https://ai.grudge-studio.com
    echo REM GRUDGE_AI_KEY=your-legion-hub-api-key
    echo GRUDGE_AUTH_URL=https://id.grudge-studio.com
  ) > "%GRUDA_DATA%\.env"
  echo   [OK] Created %GRUDA_DATA%\.env
)

echo   [i] Config:  %GRUDA_DATA%
echo   [i] Projects: %GRUDA_PROJECTS%
echo   [->] Starting GRUDA Agent on http://127.0.0.1:3200 ...
start "" http://127.0.0.1:3200
set DATA_DIR=%GRUDA_DATA%
set PROJECTS_DIR=%GRUDA_PROJECTS%
npx --yes gruda-agent@latest --port 3200 --no-open
pause
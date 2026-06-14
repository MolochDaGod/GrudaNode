@echo off
title GRUDA Agent — Grudge Studio
color 0E
cd /d "%~dp0"

:: First-time setup check
if not exist "node_modules" goto :setup
if not exist ".env" goto :setup
goto :start

:setup
echo.
echo  First run detected — running setup...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if %errorlevel% neq 0 ( pause & exit /b 1 )
goto :done

:start
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   GRUDA AGENT  v1.0.0                         ║
echo  ║   Grudge Studio — RacAlvin The Pirate King    ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: Start Ollama if not running
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo  [START] Starting Ollama...
    start "" ollama serve
    timeout /t 3 /nobreak >nul
)

echo  [START] Launching at http://localhost:3200
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3200"
node server.js

echo.
echo  [STOPPED] GRUDA Agent exited.
pause

:done

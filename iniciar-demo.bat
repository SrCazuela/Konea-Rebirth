@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Konea - Demostracion temporal Cloudflare
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instala Node.js 22.12 o superior antes de iniciar la demo.
  pause
  exit /b 1
)
node.exe --no-maglev scripts\start-public-demo.mjs %*
set "KONEA_DEMO_EXIT=%ERRORLEVEL%"
if not "%KONEA_DEMO_EXIT%"=="0" pause
exit /b %KONEA_DEMO_EXIT%

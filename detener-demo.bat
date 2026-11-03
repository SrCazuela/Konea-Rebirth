@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
node.exe --no-maglev scripts\start-public-demo.mjs --stop
if errorlevel 1 pause

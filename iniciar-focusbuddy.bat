@echo off
setlocal EnableExtensions DisableDelayedExpansion

chcp 65001 >nul
title Konea FocusBuddy - Desarrollo
cd /d "%~dp0"

call "%~dp0iniciar.bat" -FocusBuddy %*
exit /b %ERRORLEVEL%

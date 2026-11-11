@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Konea - Sincronizacion de Capstone
cd /d "%~dp0"
node "%~dp0scripts\capstone\sync.mjs" %*
set "KONEA_SYNC_EXIT=%ERRORLEVEL%"
if not "%KONEA_SYNC_EXIT%"=="0" echo Revisa el resultado y los conflictos antes de volver a sincronizar.
if "%~1"=="" pause
exit /b %KONEA_SYNC_EXIT%

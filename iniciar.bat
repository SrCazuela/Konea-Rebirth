@echo off
setlocal EnableExtensions DisableDelayedExpansion

chcp 65001 >nul

title Konea Rebirth - Desarrollo
cd /d "%~dp0"

set "KONEA_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "KONEA_START_SCRIPT=%~dp0scripts\start-dev.ps1"

if not exist "%KONEA_POWERSHELL%" (
  echo [ERROR] No se encontro Windows PowerShell.
  pause
  exit /b 1
)

if not exist "%KONEA_START_SCRIPT%" (
  echo [ERROR] No se encontro el iniciador "%KONEA_START_SCRIPT%".
  pause
  exit /b 1
)

"%KONEA_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%KONEA_START_SCRIPT%" %*
set "KONEA_EXIT_CODE=%ERRORLEVEL%"

if not "%KONEA_EXIT_CODE%"=="0" (
  echo.
  echo Konea no pudo iniciarse. Revisa el error mostrado arriba.
  pause
)

exit /b %KONEA_EXIT_CODE%

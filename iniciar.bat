@echo off
setlocal EnableExtensions DisableDelayedExpansion

title Konea Rebirth - Desarrollo
cd /d "%~dp0"

set "KONEA_POWERSHELL=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%KONEA_POWERSHELL%" (
  echo [ERROR] No se encontro Windows PowerShell.
  pause
  exit /b 1
)

"%KONEA_POWERSHELL%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
set "KONEA_EXIT_CODE=%ERRORLEVEL%"

if not "%KONEA_EXIT_CODE%"=="0" (
  echo.
  echo Konea no pudo iniciarse. Revisa el error mostrado arriba.
  pause
)

exit /b %KONEA_EXIT_CODE%

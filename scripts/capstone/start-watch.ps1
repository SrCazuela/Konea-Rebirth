[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function ConvertTo-WindowsArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

  # Start-Process joins ArgumentList on Windows. Quote each path according to
  # the native command-line rules, including backslashes preceding quotes.
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
$syncScript = Join-Path -Path $repoRoot -ChildPath 'scripts\capstone\sync.mjs'
$stateDirectory = Join-Path -Path $repoRoot -ChildPath '.local\capstone-sync'
$configFile = Join-Path -Path $stateDirectory -ChildPath 'config.json'

if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
  throw "No se encontro el sincronizador: $syncScript"
}
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) {
  throw 'Configura primero .local\capstone-sync\config.json antes de iniciar la sincronizacion.'
}

$nodeCommand = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction Stop | Select-Object -First 1
$nodeExecutable = [IO.Path]::GetFullPath($nodeCommand.Path)

# The Node CLI owns watcher validation and stale PID handling. Never stop a
# process or infer ownership from a PID here. Check first to preserve open logs.
Push-Location -LiteralPath $repoRoot
try {
  $statusLines = @(& $nodeExecutable $syncScript --status --json)
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo consultar el estado del sincronizador (codigo $LASTEXITCODE)."
  }
}
finally {
  Pop-Location
}
$status = ($statusLines -join [Environment]::NewLine) | ConvertFrom-Json
if (-not $status.configured) {
  throw 'El sincronizador no tiene una configuracion valida.'
}
if ($status.watching) {
  Write-Output "La sincronizacion ya esta activa (PID $($status.pid))."
  return
}

$standardOutput = Join-Path -Path $stateDirectory -ChildPath 'watch.log'
$standardError = Join-Path -Path $stateDirectory -ChildPath 'watch.error.log'
$watchArguments = @((ConvertTo-WindowsArgument -Value $syncScript), '--watch')
$process = Start-Process -FilePath $nodeExecutable `
  -ArgumentList $watchArguments `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $standardOutput `
  -RedirectStandardError $standardError `
  -PassThru

Write-Output "Sincronizador iniciado en segundo plano (PID $($process.Id))."
Write-Output "Registro: $standardOutput"

[CmdletBinding()]
param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot '.env'
$EnvExampleFile = Join-Path $ProjectRoot '.env.example'

function Write-Step {
  param(
    [int]$Number,
    [int]$Total,
    [string]$Message
  )

  Write-Host ''
  Write-Host ("[{0}/{1}] {2}" -f $Number, $Total, $Message) -ForegroundColor Cyan
}

function Get-RequiredCommandPath {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  $Command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $Command) {
    throw "No se encontro '$Name'. $InstallHint"
  }

  return $Command.Source
}

function Invoke-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (codigo $LASTEXITCODE)."
  }
}

function Test-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments *> $null
  return $LASTEXITCODE -eq 0
}

function Get-DotEnvValue {
  param([string]$Name)

  $EscapedName = [Regex]::Escape($Name)
  foreach ($Line in Get-Content -LiteralPath $EnvFile) {
    if ($Line -match "^\s*(?:export\s+)?$EscapedName\s*=(.*)$") {
      $Value = $Matches[1].Trim()
      if (
        $Value.Length -ge 2 -and
        (($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
          ($Value.StartsWith("'") -and $Value.EndsWith("'")))
      ) {
        return $Value.Substring(1, $Value.Length - 2)
      }

      return $Value
    }
  }

  return $null
}

function Get-DockerPath {
  $Command = Get-Command 'docker.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $Command) {
    return $Command.Source
  }

  $Candidates = @()
  if ($env:ProgramFiles) {
    $Candidates += Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
  }
  if ($env:LOCALAPPDATA) {
    $Candidates += Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
  }
  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
      return $Candidate
    }
  }

  throw 'No se encontro Docker CLI. Instala Docker Desktop.'
}

function Get-OllamaPath {
  $Command = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $Command) {
    return $Command.Source
  }

  $Candidates = @('D:\Ollama\ollama.exe')
  if ($env:LOCALAPPDATA) {
    $Candidates += Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    $Candidates += Join-Path $env:LOCALAPPDATA 'Ollama\ollama.exe'
  }
  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
      return $Candidate
    }
  }

  throw 'No se encontro Ollama. Instala Ollama o agrega ollama.exe al PATH.'
}

function Wait-ForDocker {
  param([string]$DockerPath)

  if (Test-NativeCommand -FilePath $DockerPath -Arguments @('info')) {
    Write-Host 'Docker ya esta disponible.' -ForegroundColor Green
    return
  }

  Write-Host 'Docker Desktop no esta listo; intentando iniciarlo...'
  $Candidates = @()
  if ($env:ProgramFiles) {
    $Candidates += Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  }
  if ($env:LOCALAPPDATA) {
    $Candidates += Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
    $Candidates += Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe'
  }

  $DockerDesktopPath = $Candidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
  if (-not $DockerDesktopPath) {
    throw 'Docker no responde y no se encontro Docker Desktop para iniciarlo.'
  }

  Start-Process -FilePath $DockerDesktopPath -WindowStyle Hidden | Out-Null
  for ($Attempt = 1; $Attempt -le 60; $Attempt += 1) {
    Start-Sleep -Seconds 2
    if (Test-NativeCommand -FilePath $DockerPath -Arguments @('info')) {
      Write-Host 'Docker quedo disponible.' -ForegroundColor Green
      return
    }

    if ($Attempt % 5 -eq 0) {
      Write-Host 'Esperando a Docker Desktop...'
    }
  }

  throw 'Docker Desktop no respondio dentro de 120 segundos.'
}

function Get-OllamaTags {
  param([string]$BaseUrl = 'http://127.0.0.1:11434')

  try {
    return Invoke-RestMethod `
      -Uri ("{0}/api/tags" -f $BaseUrl.TrimEnd('/')) `
      -Method Get `
      -TimeoutSec 3
  }
  catch {
    return $null
  }
}

function Test-OllamaAvailable {
  param([string]$BaseUrl = 'http://127.0.0.1:11434')

  return $null -ne (Get-OllamaTags -BaseUrl $BaseUrl)
}

function Test-OllamaModelAvailable {
  param(
    [string]$Model,
    [string]$BaseUrl = 'http://127.0.0.1:11434'
  )

  $Tags = Get-OllamaTags -BaseUrl $BaseUrl
  if ($null -eq $Tags) {
    return $false
  }

  $InstalledModels = @(
    $Tags.models |
      ForEach-Object { $_.name }
  )
  if ($InstalledModels -contains $Model) {
    return $true
  }

  # Ollama interpreta un nombre sin etiqueta como :latest.
  return $Model -notmatch ':' -and $InstalledModels -contains ("{0}:latest" -f $Model)
}

function Wait-ForOllama {
  param(
    [string]$OllamaPath,
    [string]$BaseUrl = 'http://127.0.0.1:11434'
  )

  if (Test-OllamaAvailable -BaseUrl $BaseUrl) {
    Write-Host 'Ollama ya esta disponible.' -ForegroundColor Green
    return
  }

  Write-Host 'Ollama no esta activo; iniciando el servicio local...'
  Start-Process `
    -FilePath $OllamaPath `
    -ArgumentList @('serve') `
    -WindowStyle Hidden | Out-Null

  for ($Attempt = 1; $Attempt -le 45; $Attempt += 1) {
    Start-Sleep -Seconds 1
    if (Test-OllamaAvailable -BaseUrl $BaseUrl) {
      Write-Host 'Ollama quedo disponible.' -ForegroundColor Green
      return
    }
  }

  throw 'Ollama no respondio dentro de 45 segundos.'
}

function Assert-PortAvailable {
  param(
    [int]$Port,
    [string]$ServiceName
  )

  $Listeners = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  )
  if ($Listeners.Count -eq 0) {
    return
  }

  $ProcessDescriptions = $Listeners |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      $Process = Get-Process -Id $_ -ErrorAction SilentlyContinue
      if ($null -eq $Process) {
        "PID $_"
      }
      else {
        "PID $_ ($($Process.ProcessName))"
      }
    }

  throw "El puerto $Port de $ServiceName ya esta ocupado por $($ProcessDescriptions -join ', '). Deten ese proceso y vuelve a ejecutar iniciar.bat."
}

try {
  Push-Location -LiteralPath $ProjectRoot

  Write-Host ''
  Write-Host '==================================================' -ForegroundColor Magenta
  Write-Host '       Konea Rebirth - Entorno de desarrollo' -ForegroundColor Magenta
  Write-Host '==================================================' -ForegroundColor Magenta

  Write-Step -Number 1 -Total 7 -Message 'Validando configuracion y herramientas'
  if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $EnvExampleFile -PathType Leaf)) {
      throw 'Faltan .env y .env.example.'
    }

    Copy-Item -LiteralPath $EnvExampleFile -Destination $EnvFile
    Write-Warning 'Se creo .env desde .env.example. Revisa sus credenciales antes de compartirlo.'
  }

  $NodePath = Get-RequiredCommandPath -Name 'node.exe' -InstallHint 'Instala Node.js LTS 22.12 o superior.'
  $NpmPath = Get-RequiredCommandPath -Name 'npm.cmd' -InstallHint 'npm debe instalarse junto con Node.js.'
  $DockerPath = Get-DockerPath
  $env:PATH = "$(Split-Path -Parent $DockerPath);$env:PATH"

  $NodeVersionText = (& $NodePath --version).TrimStart('v')
  $NpmVersionText = (& $NpmPath --version).Trim()
  if ([version]$NodeVersionText -lt [version]'22.12.0') {
    throw "Node.js $NodeVersionText no cumple el minimo 22.12.0."
  }
  if ([version]$NpmVersionText -lt [version]'11.0.0') {
    throw "npm $NpmVersionText no cumple el minimo 11.0.0."
  }
  Write-Host "Node: v$NodeVersionText"
  Write-Host "npm:  $NpmVersionText"

  $DependencyMarkers = @(
    (Join-Path $ProjectRoot 'node_modules\.bin\concurrently.cmd'),
    (Join-Path $ProjectRoot 'node_modules\.bin\drizzle-kit.cmd'),
    (Join-Path $ProjectRoot 'node_modules\.bin\vite.cmd')
  )
  $MissingDependencies = @($DependencyMarkers | Where-Object { -not (Test-Path -LiteralPath $_) })
  $DependenciesAreValid =
    $MissingDependencies.Count -eq 0 -and
    (Test-NativeCommand -FilePath $NpmPath -Arguments @('ls', '--depth=0', '--silent'))
  if (-not $DependenciesAreValid) {
    Write-Host 'Faltan dependencias; ejecutando npm install...'
    Invoke-NativeCommand `
      -FilePath $NpmPath `
      -Arguments @('install', '--no-audit', '--no-fund') `
      -FailureMessage 'No se pudieron instalar las dependencias'
  }

  Write-Step -Number 2 -Total 7 -Message 'Comprobando Docker Desktop'
  Wait-ForDocker -DockerPath $DockerPath

  Write-Step -Number 3 -Total 7 -Message 'Levantando PostgreSQL y esperando su healthcheck'
  Invoke-NativeCommand `
    -FilePath $NpmPath `
    -Arguments @('run', 'db:up') `
    -FailureMessage 'PostgreSQL no pudo iniciarse'

  Write-Step -Number 4 -Total 7 -Message 'Aplicando migraciones pendientes'
  Invoke-NativeCommand `
    -FilePath $NpmPath `
    -Arguments @('run', 'db:migrate') `
    -FailureMessage 'Las migraciones no pudieron aplicarse'

  Write-Step -Number 5 -Total 7 -Message 'Preparando cuenta administrativa local'
  $NodeEnvironment = Get-DotEnvValue -Name 'NODE_ENV'
  if ([string]::IsNullOrWhiteSpace($NodeEnvironment) -or $NodeEnvironment -eq 'development') {
    Invoke-NativeCommand `
      -FilePath $NpmPath `
      -Arguments @('run', 'db:seed:dev') `
      -FailureMessage 'No se pudo preparar la cuenta administrativa local'
  }
  else {
    Write-Host "Cuenta local omitida en NODE_ENV=$NodeEnvironment."
  }

  Write-Step -Number 6 -Total 7 -Message 'Preparando el proveedor de IA de DUCO'
  $Provider = Get-DotEnvValue -Name 'DUCO_AI_PROVIDER'
  if ($null -eq $Provider) {
    if ($NodeEnvironment -eq 'development' -or [string]::IsNullOrWhiteSpace($NodeEnvironment)) {
      $Provider = 'ollama'
    }
    else {
      $Provider = 'local'
    }
  }

  if ([string]::IsNullOrWhiteSpace($Provider)) {
    throw 'DUCO_AI_PROVIDER esta definido, pero no tiene valor.'
  }
  $Provider = $Provider.ToLowerInvariant()

  switch ($Provider) {
    'ollama' {
      $env:OLLAMA_HOST = '127.0.0.1:11434'
      $OllamaBaseUrl = Get-DotEnvValue -Name 'OLLAMA_BASE_URL'
      if ([string]::IsNullOrWhiteSpace($OllamaBaseUrl)) {
        $OllamaBaseUrl = 'http://127.0.0.1:11434'
      }
      $OllamaPath = Get-OllamaPath
      Wait-ForOllama -OllamaPath $OllamaPath -BaseUrl $OllamaBaseUrl

      $Model = Get-DotEnvValue -Name 'OLLAMA_MODEL'
      if ([string]::IsNullOrWhiteSpace($Model)) {
        $Model = 'qwen3.5:4b'
      }

      if (-not (Test-OllamaModelAvailable -Model $Model -BaseUrl $OllamaBaseUrl)) {
        throw "Falta el modelo $Model. Ejecuta 'ollama pull $Model' una sola vez y vuelve a iniciar Konea."
      }
      Write-Host "IA local lista: Ollama / $Model" -ForegroundColor Green
    }
    'openai' {
      $OpenAiKey = Get-DotEnvValue -Name 'OPENAI_API_KEY'
      if ([string]::IsNullOrWhiteSpace($OpenAiKey)) {
        throw 'DUCO_AI_PROVIDER=openai requiere OPENAI_API_KEY en .env.'
      }
      Write-Host 'IA configurada con OpenAI.' -ForegroundColor Green
    }
    'local' {
      Write-Host 'DUCO usara su modo local deterministico; no requiere un servicio externo.' -ForegroundColor Green
    }
    default {
      throw "DUCO_AI_PROVIDER='$Provider' no es valido. Usa local, ollama u openai."
    }
  }

  Write-Step -Number 7 -Total 7 -Message 'Iniciando API y web'
  $ApiPortText = Get-DotEnvValue -Name 'API_PORT'
  if ([string]::IsNullOrWhiteSpace($ApiPortText)) {
    $ApiPortText = '3000'
  }
  $ApiPort = 0
  if (-not [int]::TryParse($ApiPortText, [ref]$ApiPort) -or $ApiPort -lt 1 -or $ApiPort -gt 65535) {
    throw "API_PORT='$ApiPortText' no es un puerto valido."
  }

  Assert-PortAvailable -Port $ApiPort -ServiceName 'la API'
  Assert-PortAvailable -Port 5173 -ServiceName 'la web'

  if ($PrepareOnly) {
    Write-Host ''
    Write-Host 'Preparacion completada. Los servidores se omitieron por -PrepareOnly.' -ForegroundColor Green
    return
  }

  Write-Host ''
  Write-Host 'Konea quedara disponible en http://localhost:5173' -ForegroundColor Green
  Write-Host 'Para detener API y web, presiona Ctrl+C en esta ventana.'
  Write-Host 'PostgreSQL y Ollama permaneceran activos para el siguiente inicio.'
  Write-Host ''

  & $NpmPath run dev
  $DevelopmentExitCode = $LASTEXITCODE
  if ($DevelopmentExitCode -ne 0) {
    throw "Los servidores terminaron con codigo $DevelopmentExitCode."
  }
}
catch {
  Write-Host ''
  Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
}

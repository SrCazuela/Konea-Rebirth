[CmdletBinding()]
param(
  [switch]$PrepareOnly,
  [switch]$FocusBuddy
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

  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    # Algunos ejecutables escriben diagnósticos esperables en stderr mientras
    # todavía están arrancando. En una prueba booleana eso significa "false",
    # no un error fatal para todo el iniciador.
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments *> $null
    return $LASTEXITCODE -eq 0
  }
  catch {
    return $false
  }
  finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
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

function Test-KoneaHealthEndpoint {
  param(
    [string]$Uri,
    [int]$TimeoutSeconds = 3
  )

  try {
    $Response = Invoke-RestMethod `
      -Uri $Uri `
      -Method Get `
      -TimeoutSec $TimeoutSeconds
    return $Response.status -eq 'ok' -and $Response.service -eq 'konea-api'
  }
  catch {
    return $false
  }
}

function Assert-OpenAiConfiguration {
  param(
    [string]$ApiKey,
    [string]$Model,
    [string]$BaseUrl
  )

  $ModelUrl = '{0}/models/{1}' -f @(
    $BaseUrl.TrimEnd('/'),
    [Uri]::EscapeDataString($Model)
  )

  try {
    $Response = Invoke-RestMethod `
      -Uri $ModelUrl `
      -Method Get `
      -Headers @{ Authorization = "Bearer $ApiKey" } `
      -TimeoutSec 20
  }
  catch {
    $StatusCode = 0
    if ($null -ne $_.Exception.Response) {
      try {
        $StatusCode = [int]$_.Exception.Response.StatusCode
      }
      catch {
        $StatusCode = 0
      }
    }

    switch ($StatusCode) {
      401 { throw 'OpenAI rechazo OPENAI_API_KEY. Reemplaza la clave en .env.' }
      403 { throw "El proyecto de OpenAI no tiene permiso para usar '$Model'." }
      404 { throw "OpenAI no encontro el modelo '$Model' para este proyecto." }
      429 { throw 'OpenAI rechazo la comprobacion por limite o saldo. Revisa Usage y Billing.' }
      default {
        throw "No se pudo verificar OpenAI en $BaseUrl. Revisa Internet y OPENAI_BASE_URL."
      }
    }
  }

  if ($null -eq $Response -or $Response.id -ne $Model) {
    throw "OpenAI respondio, pero no confirmo el modelo '$Model'."
  }

  Write-Host "IA remota lista: OpenAI / $Model" -ForegroundColor Green
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

function Stop-ProcessTree {
  param($Process)

  if ($null -eq $Process) {
    return
  }

  $Process.Refresh()
  if ($Process.HasExited) {
    return
  }

  $TaskKillPath = Join-Path $env:SystemRoot 'System32\taskkill.exe'
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $TaskKillPath /PID $Process.Id /T /F *> $null
  }
  finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

function Start-FocusBuddyDesktop {
  param(
    [int]$ApiPort = 3000,
    [Parameter(Mandatory = $true)]
    [string]$NodePath
  )

  $ElectronPath = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
  $FocusBuddyDirectory = Join-Path $ProjectRoot 'apps\focusbuddy'
  if (-not (Test-Path -LiteralPath $ElectronPath -PathType Leaf)) {
    Write-Host 'Completando la instalacion local de Electron...' -ForegroundColor Yellow
    Invoke-NativeCommand `
      -FilePath $NodePath `
      -Arguments @('-e', "require('electron')") `
      -FailureMessage 'Electron no pudo preparar su ejecutable local'
  }
  if (-not (Test-Path -LiteralPath $ElectronPath -PathType Leaf)) {
    throw 'Electron no dejo disponible su ejecutable despues de reconstruirse.'
  }
  if (-not (Test-Path -LiteralPath $FocusBuddyDirectory -PathType Container)) {
    throw 'No se encontro el cliente apps\focusbuddy.'
  }

  # Algunas terminales de desarrollo definen ELECTRON_RUN_AS_NODE; el cliente
  # gráfico debe ejecutarse sin esa variable.
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:FOCUSBUDDY_DATA_DIR = Join-Path $ProjectRoot '.local\focusbuddy-desktop'
  return Start-Process `
    -FilePath $ElectronPath `
    -ArgumentList @(
      "`"$FocusBuddyDirectory`"",
      "--api-url=http://127.0.0.1:$ApiPort/api/v1"
    ) `
    -WorkingDirectory $ProjectRoot `
    -PassThru
}

try {
  Push-Location -LiteralPath $ProjectRoot
  # Mantiene también la caché de npm en el disco del proyecto. Es útil cuando
  # Konea vive en D: y evita volver a llenar el perfil de Windows en C:.
  $env:npm_config_cache = Join-Path $ProjectRoot '.npm-cache'

  Write-Host ''
  Write-Host '==================================================' -ForegroundColor Magenta
  Write-Host '       Konea Rebirth - Entorno de desarrollo' -ForegroundColor Magenta
  Write-Host '==================================================' -ForegroundColor Magenta

  Write-Step -Number 1 -Total 8 -Message 'Validando configuracion y herramientas'
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

  Write-Step -Number 2 -Total 8 -Message 'Comprobando Docker Desktop'
  Wait-ForDocker -DockerPath $DockerPath

  Write-Step -Number 3 -Total 8 -Message 'Levantando PostgreSQL y esperando su healthcheck'
  Invoke-NativeCommand `
    -FilePath $NpmPath `
    -Arguments @('run', 'db:up') `
    -FailureMessage 'PostgreSQL no pudo iniciarse'

  Write-Step -Number 4 -Total 8 -Message 'Aplicando migraciones pendientes'
  Invoke-NativeCommand `
    -FilePath $NpmPath `
    -Arguments @('run', 'db:migrate') `
    -FailureMessage 'Las migraciones no pudieron aplicarse'

  Write-Step -Number 5 -Total 8 -Message 'Preparando cuenta administrativa local'
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

  Write-Step -Number 6 -Total 8 -Message 'Preparando contenido de demostracion'
  if ([string]::IsNullOrWhiteSpace($NodeEnvironment) -or $NodeEnvironment -eq 'development') {
    $SeedSocialDemo = Get-DotEnvValue -Name 'SEED_SOCIAL_DEMO'
    if ([string]::IsNullOrWhiteSpace($SeedSocialDemo)) {
      $SeedSocialDemo = 'true'
    }

    switch ($SeedSocialDemo.ToLowerInvariant()) {
      'true' {
        Invoke-NativeCommand `
          -FilePath $NpmPath `
          -Arguments @('run', 'db:seed:social') `
          -FailureMessage 'No se pudo preparar el contenido social de demostracion'
      }
      'false' {
        Write-Host 'Contenido social de demostracion omitido por configuracion.'
      }
      default {
        throw "SEED_SOCIAL_DEMO='$SeedSocialDemo' no es valido. Usa true o false."
      }
    }

    $SeedCapstoneDemo = Get-DotEnvValue -Name 'SEED_CAPSTONE_DEMO'
    if ([string]::IsNullOrWhiteSpace($SeedCapstoneDemo)) {
      $SeedCapstoneDemo = 'true'
    }

    switch ($SeedCapstoneDemo.ToLowerInvariant()) {
      'true' {
        if ($SeedSocialDemo.ToLowerInvariant() -eq 'false') {
          Write-Host 'Escenario Capstone omitido porque SEED_SOCIAL_DEMO=false.'
        }
        else {
          Invoke-NativeCommand `
            -FilePath $NpmPath `
            -Arguments @('run', 'db:seed:demo') `
            -FailureMessage 'No se pudo preparar el escenario Capstone de demostracion'
        }
      }
      'false' {
        Write-Host 'Escenario Capstone de demostracion omitido por configuracion.'
      }
      default {
        throw "SEED_CAPSTONE_DEMO='$SeedCapstoneDemo' no es valido. Usa true o false."
      }
    }
  }
  else {
    Write-Host "Contenido de demostracion omitido en NODE_ENV=$NodeEnvironment."
  }

  Write-Step -Number 7 -Total 8 -Message 'Preparando el proveedor de IA de DUCO'
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
      try {
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
          throw "Falta el modelo $Model. Ejecuta 'ollama pull $Model' cuando quieras volver a usar Ollama."
        }
        Write-Host "IA local lista: Ollama / $Model" -ForegroundColor Green
      }
      catch {
        Write-Warning ("Ollama no esta disponible: {0}" -f $_.Exception.Message)
        Write-Host 'Konea continuara con las reglas locales de DUCO.' -ForegroundColor Yellow
        $Provider = 'local'
        $env:DUCO_AI_PROVIDER = 'local'
      }
    }
    'openai' {
      try {
        $OpenAiKey = Get-DotEnvValue -Name 'OPENAI_API_KEY'
        if ([string]::IsNullOrWhiteSpace($OpenAiKey)) {
          throw 'DUCO_AI_PROVIDER=openai requiere OPENAI_API_KEY en .env.'
        }

        $OpenAiModel = Get-DotEnvValue -Name 'OPENAI_MODEL'
        if ([string]::IsNullOrWhiteSpace($OpenAiModel)) {
          $OpenAiModel = 'gpt-5.6-luna'
        }

        $OpenAiBaseUrl = Get-DotEnvValue -Name 'OPENAI_BASE_URL'
        if ([string]::IsNullOrWhiteSpace($OpenAiBaseUrl)) {
          $OpenAiBaseUrl = 'https://api.openai.com/v1'
        }

        Write-Host "Verificando acceso a OpenAI / $OpenAiModel..."
        Assert-OpenAiConfiguration `
          -ApiKey $OpenAiKey `
          -Model $OpenAiModel `
          -BaseUrl $OpenAiBaseUrl
      }
      catch {
        Write-Warning ("OpenAI no esta disponible: {0}" -f $_.Exception.Message)
        Write-Host 'Konea continuara con las reglas locales de DUCO.' -ForegroundColor Yellow
        $Provider = 'local'
        $env:DUCO_AI_PROVIDER = 'local'
      }
    }
    'local' {
      Write-Host 'DUCO usara su modo local deterministico; no requiere un servicio externo.' -ForegroundColor Green
    }
    default {
      throw "DUCO_AI_PROVIDER='$Provider' no es valido. Usa local, ollama u openai."
    }
  }

  $RuntimeDescription = if ($FocusBuddy) { 'API y FocusBuddy' } else { 'API y web' }
  Write-Step -Number 8 -Total 8 -Message "Iniciando $RuntimeDescription"
  $ApiPortText = Get-DotEnvValue -Name 'API_PORT'
  if ([string]::IsNullOrWhiteSpace($ApiPortText)) {
    $ApiPortText = '3000'
  }
  $ApiPort = 0
  if (-not [int]::TryParse($ApiPortText, [ref]$ApiPort) -or $ApiPort -lt 1 -or $ApiPort -gt 65535) {
    throw "API_PORT='$ApiPortText' no es un puerto valido."
  }

  if ($PrepareOnly) {
    Write-Host ''
    Write-Host 'Preparacion completada. Los servidores se omitieron por -PrepareOnly.' -ForegroundColor Green
    return
  }

  $ApiHealthUrl = "http://127.0.0.1:$ApiPort/api/v1/health"
  $WebUrl = 'http://localhost:5173/'
  $WebHealthUrl = "${WebUrl}api/v1/health"
  $NeedsWeb = -not $FocusBuddy
  $ApiIsRunning = Test-KoneaHealthEndpoint -Uri $ApiHealthUrl
  $WebIsRunning = if ($NeedsWeb) {
    Test-KoneaHealthEndpoint -Uri $WebHealthUrl
  }
  else {
    $true
  }

  if ($ApiIsRunning -and $WebIsRunning) {
    Write-Host ''
    Write-Host "$RuntimeDescription ya estaba en ejecucion y responde correctamente." -ForegroundColor Green
    if ($NeedsWeb) {
      Write-Host "Web: $WebUrl"
    }
    Write-Host "API: $ApiHealthUrl"
    if ($FocusBuddy) {
      Start-FocusBuddyDesktop -ApiPort $ApiPort -NodePath $NodePath | Out-Null
      Write-Host 'FocusBuddy se abrio como aplicacion de escritorio.' -ForegroundColor Green
    }
    return
  }

  if (-not $ApiIsRunning) {
    Assert-PortAvailable -Port $ApiPort -ServiceName 'la API'
  }
  else {
    Write-Host 'La API ya esta activa; se reutilizara esta instancia.' -ForegroundColor Green
  }

  if ($NeedsWeb) {
    if (-not $WebIsRunning) {
      Assert-PortAvailable -Port 5173 -ServiceName 'la web'
    }
    else {
      Write-Host 'La web ya esta activa; se reutilizara esta instancia.' -ForegroundColor Green
    }
  }

  Write-Host ''
  Write-Host "Iniciando $RuntimeDescription..."
  Write-Host "Para detener $RuntimeDescription, presiona Ctrl+C en esta ventana."
  if ($Provider -eq 'ollama') {
    Write-Host 'PostgreSQL y Ollama permaneceran activos para el siguiente inicio.'
  }
  else {
    Write-Host 'PostgreSQL permanecera activo para el siguiente inicio.'
  }
  Write-Host ''

  $ApiProcess = $null
  $WebProcess = $null
  $FocusBuddyProcess = $null
  try {
    $ApiEntryPoint = Join-Path $ProjectRoot 'node_modules\tsx\dist\cli.mjs'
    $WebEntryPoint = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
    $ApiDirectory = Join-Path $ProjectRoot 'apps\api'
    $WebDirectory = Join-Path $ProjectRoot 'apps\web'

    if (-not $ApiIsRunning) {
      $ApiProcess = Start-Process `
        -FilePath $NodePath `
        -ArgumentList @('--no-maglev', "`"$ApiEntryPoint`"", 'watch', 'src/server.ts') `
        -WorkingDirectory $ApiDirectory `
        -NoNewWindow `
        -PassThru
    }
    if ($NeedsWeb -and -not $WebIsRunning) {
      $WebProcess = Start-Process `
        -FilePath $NodePath `
        -ArgumentList @('--no-maglev', "`"$WebEntryPoint`"") `
        -WorkingDirectory $WebDirectory `
        -NoNewWindow `
        -PassThru
    }

    $ServicesAreReady = $false
    for ($Attempt = 1; $Attempt -le 120; $Attempt += 1) {
      Start-Sleep -Milliseconds 500
      if ($null -ne $ApiProcess) {
        $ApiProcess.Refresh()
      }
      if ($null -ne $WebProcess) {
        $WebProcess.Refresh()
      }
      if ($null -ne $ApiProcess -and $ApiProcess.HasExited) {
        throw "La API termino antes de estar lista (codigo $($ApiProcess.ExitCode))."
      }
      if ($null -ne $WebProcess -and $WebProcess.HasExited) {
        throw "La web termino antes de estar lista (codigo $($WebProcess.ExitCode))."
      }

      if (
        (Test-KoneaHealthEndpoint -Uri $ApiHealthUrl) -and
        (-not $NeedsWeb -or (Test-KoneaHealthEndpoint -Uri $WebHealthUrl))
      ) {
        $ServicesAreReady = $true
        break
      }

      if ($Attempt % 20 -eq 0) {
        Write-Host "Esperando a que $RuntimeDescription este listo..."
      }
    }

    if (-not $ServicesAreReady) {
      throw "$RuntimeDescription no respondio correctamente dentro de 60 segundos."
    }

    Write-Host ''
    Write-Host 'Konea esta lista.' -ForegroundColor Green
    if ($NeedsWeb) {
      Write-Host "Web: $WebUrl"
    }
    Write-Host "API: $ApiHealthUrl"
    if ($FocusBuddy) {
      $FocusBuddyProcess = Start-FocusBuddyDesktop -ApiPort $ApiPort -NodePath $NodePath
      Write-Host 'FocusBuddy se abrio como aplicacion de escritorio.' -ForegroundColor Green
    }
    Write-Host ''

    $HealthCheckCounter = 0
    while ($true) {
      Start-Sleep -Milliseconds 500
      if ($null -ne $ApiProcess) {
        $ApiProcess.Refresh()
      }
      if ($null -ne $WebProcess) {
        $WebProcess.Refresh()
      }
      if ($null -ne $ApiProcess -and $ApiProcess.HasExited) {
        throw "La API termino inesperadamente (codigo $($ApiProcess.ExitCode))."
      }
      if ($null -ne $WebProcess -and $WebProcess.HasExited) {
        throw "La web termino inesperadamente (codigo $($WebProcess.ExitCode))."
      }

      $HealthCheckCounter += 1
      if ($HealthCheckCounter -ge 20) {
        $HealthCheckCounter = 0
        if (-not (Test-KoneaHealthEndpoint -Uri $ApiHealthUrl)) {
          throw 'La API dejo de responder correctamente.'
        }
        if ($NeedsWeb -and -not (Test-KoneaHealthEndpoint -Uri $WebHealthUrl)) {
          throw 'La web dejo de responder correctamente.'
        }
      }
    }
  }
  finally {
    Stop-ProcessTree -Process $FocusBuddyProcess
    Stop-ProcessTree -Process $ApiProcess
    Stop-ProcessTree -Process $WebProcess
  }
}
catch [System.Management.Automation.PipelineStoppedException] {
  Write-Host ''
  Write-Host 'Konea fue detenida por el usuario.' -ForegroundColor Yellow
  exit 0
}
catch {
  Write-Host ''
  Write-Host ("[ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
}

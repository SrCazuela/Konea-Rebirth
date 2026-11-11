[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Install.IsPresent -eq $Uninstall.IsPresent) {
  throw 'Usa exactamente una opcion: -Install o -Uninstall.'
}

function ConvertTo-WindowsArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
$watchHelper = Join-Path -Path $PSScriptRoot -ChildPath 'start-watch.ps1'
if (-not (Test-Path -LiteralPath $watchHelper -PathType Leaf)) {
  throw "No se encontro el helper de inicio: $watchHelper"
}
$watchHelper = (Resolve-Path -LiteralPath $watchHelper).ProviderPath

$powerShellExecutable = (Get-Process -Id $PID).Path
if ([IO.Path]::GetFileName($powerShellExecutable) -notin @('powershell.exe', 'pwsh.exe')) {
  throw 'Ejecuta este helper desde powershell.exe o pwsh.exe.'
}
$powerShellExecutable = [IO.Path]::GetFullPath($powerShellExecutable)
$shortcutArguments = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-WindowStyle',
  'Hidden',
  '-File',
  (ConvertTo-WindowsArgument -Value $watchHelper)
) -join ' '

# Only the current user's Startup folder is used. Resolve and verify it before
# inspecting or changing the one shortcut owned by this helper.
$startupFolder = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
if ([string]::IsNullOrWhiteSpace($startupFolder) -or -not [IO.Path]::IsPathRooted($startupFolder)) {
  throw 'Windows no devolvio una carpeta de Inicio de usuario absoluta y valida.'
}
$startupFolder = [IO.Path]::GetFullPath($startupFolder).TrimEnd('\')
if (-not (Test-Path -LiteralPath $startupFolder -PathType Container)) {
  throw "La carpeta de Inicio del usuario no existe: $startupFolder"
}
$resolvedStartup = Resolve-Path -LiteralPath $startupFolder
if ($resolvedStartup.Provider.Name -ne 'FileSystem') {
  throw 'La carpeta de Inicio del usuario no pertenece al sistema de archivos.'
}
$startupFolder = [IO.Path]::GetFullPath($resolvedStartup.ProviderPath).TrimEnd('\')
$shortcutPath = [IO.Path]::GetFullPath((Join-Path -Path $startupFolder -ChildPath 'Konea Capstone Sync.lnk'))
if (-not [string]::Equals([IO.Path]::GetDirectoryName($shortcutPath), $startupFolder, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El acceso directo quedaria fuera de la carpeta de Inicio del usuario.'
}

$shell = $null
$shortcut = $null
try {
  $shell = New-Object -ComObject WScript.Shell
  if (Test-Path -LiteralPath $shortcutPath) {
    $shortcutItem = Get-Item -LiteralPath $shortcutPath -Force
    if ($shortcutItem.PSIsContainer -or ($shortcutItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'La ruta del acceso directo contiene otro objeto o un enlace; se conserva sin cambios.'
    }
  }
  $shortcutExists = Test-Path -LiteralPath $shortcutPath -PathType Leaf
  if ($shortcutExists) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $existingTarget = [IO.Path]::GetFullPath($shortcut.TargetPath)
    $ownedTarget = [string]::Equals($existingTarget, $powerShellExecutable, [StringComparison]::OrdinalIgnoreCase)
    $ownedArguments = [string]::Equals($shortcut.Arguments.Trim(), $shortcutArguments, [StringComparison]::OrdinalIgnoreCase)
    if (-not $ownedTarget -or -not $ownedArguments) {
      throw 'Ya existe un acceso directo con ese nombre que no pertenece a este helper; se conserva sin cambios.'
    }
  }

  if ($Uninstall) {
    if ($shortcutExists) {
      Remove-Item -LiteralPath $shortcutPath -ErrorAction Stop
      Write-Output 'Inicio automatico de Konea Capstone Sync desactivado.'
    } else {
      Write-Output 'El inicio automatico de Konea Capstone Sync ya estaba desactivado.'
    }
    return
  }

  if (-not $shortcut) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
  }
  $shortcut.TargetPath = $powerShellExecutable
  $shortcut.Arguments = $shortcutArguments
  $shortcut.WorkingDirectory = $repoRoot
  $shortcut.Description = 'Sincroniza automaticamente los documentos Capstone de Konea y Google Drive al iniciar sesion.'
  $shortcut.WindowStyle = 7
  $shortcut.Save()
  Write-Output "Inicio automatico de usuario configurado: $shortcutPath"
}
finally {
  if ($shortcut) {
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) | Out-Null
  }
  if ($shell) {
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null
  }
}

const { existsSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function environmentForBuilder(
  environment = process.env,
  { platform = process.platform, fileExists = existsSync } = {},
) {
  const nextEnvironment = { ...environment }

  if (platform !== 'win32') {
    return nextEnvironment
  }

  const systemRoot = environment.SystemRoot || environment.WINDIR
  if (!systemRoot) {
    return nextEnvironment
  }

  const windowsPowerShellDirectory = path.win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
  )
  const windowsPowerShellExecutable = path.win32.join(
    windowsPowerShellDirectory,
    'powershell.exe',
  )
  if (!fileExists(windowsPowerShellExecutable)) {
    return nextEnvironment
  }

  const currentPath = environment.Path || environment.PATH || ''
  const entries = currentPath.split(path.win32.delimiter).filter(Boolean)
  if (
    !entries.some(
      (entry) =>
        path.win32.resolve(entry).toLowerCase() ===
        path.win32.resolve(windowsPowerShellDirectory).toLowerCase(),
    )
  ) {
    entries.unshift(windowsPowerShellDirectory)
  }

  nextEnvironment.Path = entries.join(path.win32.delimiter)
  nextEnvironment.PATH = nextEnvironment.Path
  return nextEnvironment
}

function runBuilder(argumentsFromCommandLine = process.argv.slice(2)) {
  const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js')
  const result = spawnSync(
    process.execPath,
    [electronBuilderCli, ...argumentsFromCommandLine],
    {
      env: environmentForBuilder(),
      stdio: 'inherit',
    },
  )

  if (result.error) {
    throw result.error
  }

  process.exitCode = result.status ?? 1
}

if (require.main === module) {
  runBuilder()
}

module.exports = { environmentForBuilder }

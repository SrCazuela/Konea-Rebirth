const { spawn } = require('node:child_process')
const path = require('node:path')
const {
  DEFAULT_API_BASE_URL,
  normalizeChannelApiUrl,
} = require('../electron/api-url.cjs')

function developmentLaunchOptions(
  argumentsFromCommandLine = [],
  environment = process.env,
) {
  const commandLineApi = argumentsFromCommandLine
    .find((argument) => argument.startsWith('--api-url='))
    ?.slice(10)
  let apiUrl = commandLineApi || environment.FOCUSBUDDY_LOCAL_API_URL
  if (!apiUrl && environment.FOCUSBUDDY_API_URL) {
    try {
      apiUrl = normalizeChannelApiUrl(environment.FOCUSBUDDY_API_URL, 'local')
    } catch {
      // Desarrollo conserva localhost tras una compilación oficial en el mismo shell.
    }
  }
  apiUrl = normalizeChannelApiUrl(apiUrl || DEFAULT_API_BASE_URL, 'local')
  const nextEnvironment = { ...environment, FOCUSBUDDY_API_URL: apiUrl }
  delete nextEnvironment.ELECTRON_RUN_AS_NODE
  delete nextEnvironment.FOCUSBUDDY_APP_URL
  delete nextEnvironment.FOCUSBUDDY_RELEASE_CHANNEL
  return {
    arguments: [
      ...argumentsFromCommandLine.filter(
        (argument) => !/^--(?:api-url|app-url|channel)=/.test(argument),
      ),
      `--api-url=${apiUrl}`,
    ],
    environment: nextEnvironment,
  }
}

function runDevelopment() {
  const electronPath = require('electron')
  const applicationDirectory = path.resolve(__dirname, '..')
  const launch = developmentLaunchOptions(process.argv.slice(2))
  const child = spawn(
    electronPath,
    [applicationDirectory, ...launch.arguments],
    {
      cwd: applicationDirectory,
      env: launch.environment,
      stdio: 'inherit',
      windowsHide: false,
    },
  )
  child.once('error', () => {
    console.error(
      'No se pudo iniciar FocusBuddy Local. Revisa la instalación local de Electron.',
    )
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exitCode = code ?? 1
  })
}

if (require.main === module) {
  try {
    runDevelopment()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { developmentLaunchOptions }

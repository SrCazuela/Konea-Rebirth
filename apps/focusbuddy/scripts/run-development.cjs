const { spawn } = require('node:child_process')
const path = require('node:path')

const electronPath = require('electron')
const applicationDirectory = path.resolve(__dirname, '..')
const environment = { ...process.env }

// Codex y algunas terminales de desarrollo usan Electron como runtime de Node.
// Esa variable no debe heredarse por la aplicación gráfica.
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(
  electronPath,
  [applicationDirectory, ...process.argv.slice(2)],
  {
    cwd: applicationDirectory,
    env: environment,
    stdio: 'inherit',
    windowsHide: false,
  },
)

child.once('error', (error) => {
  console.error('No se pudo iniciar Konea FocusBuddy.', error)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})

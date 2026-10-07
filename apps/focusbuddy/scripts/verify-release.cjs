const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { listPackage } = require('@electron/asar')
const { normalizeApiBaseUrl } = require('../electron/api-url.cjs')
const { FUSE_POLICY } = require('./fuse-policy.cjs')

const enabled = '1'.charCodeAt(0)
const disabled = '0'.charCodeAt(0)
const releaseDirectory = path.resolve(__dirname, '../release/win-unpacked')
const executablePath = path.join(releaseDirectory, 'Konea FocusBuddy.exe')
const asarPath = path.join(releaseDirectory, 'resources', 'app.asar')
const configPath = path.join(
  releaseDirectory,
  'resources',
  'focusbuddy.config.json',
)
const chibiFrameFiles = [
  'idle-1.png',
  'idle-2.png',
  'idle-3.png',
  'studying-1.png',
  'studying-concentrated-1.png',
  'typing-1.png',
  'typing-2.png',
  'typing-3.png',
  'typing-blink.png',
  'typing-concentrated-1.png',
  'typing-concentrated-2.png',
  'typing-concentrated-3.png',
]

async function verifyRelease() {
  const { FuseV1Options, getCurrentFuseWire } = await import('@electron/fuses')
  assert.ok(
    existsSync(executablePath),
    `No se encontró el ejecutable desempaquetado: ${executablePath}`,
  )
  assert.ok(
    existsSync(configPath),
    `No se encontró la configuración pública: ${configPath}`,
  )
  assert.ok(existsSync(asarPath), `No se encontró el paquete ASAR: ${asarPath}`)

  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.equal(typeof config.apiBaseUrl, 'string')
  assert.equal(normalizeApiBaseUrl(config.apiBaseUrl), config.apiBaseUrl)

  const packagedFiles = new Set(
    listPackage(asarPath).map((entry) =>
      entry.replace(/^\\/, '').replaceAll('\\', '/'),
    ),
  )
  const requiredFiles = [
    'electron/desktop.html',
    'electron/desktop.css',
    'electron/desktop.js',
    'electron/desktop-api.cjs',
    'electron/owl-shimeji-provisional.png',
    ...chibiFrameFiles.map((file) => `electron/assets/avatar-cutout/${file}`),
  ]
  for (const requiredFile of requiredFiles) {
    assert.ok(
      packagedFiles.has(requiredFile),
      `Falta la interfaz local en el paquete: ${requiredFile}`,
    )
  }

  const fuses = await getCurrentFuseWire(executablePath)
  for (const [name, expectedEnabled] of Object.entries(FUSE_POLICY)) {
    const fuse = FuseV1Options[name]
    assert.equal(typeof fuse, 'number', `Fuse desconocido: ${name}`)
    const state = expectedEnabled ? enabled : disabled
    assert.equal(
      fuses[fuse],
      state,
      `El fuse ${name} no tiene el estado esperado.`,
    )
  }

  console.log(`Release verificado: ${executablePath}`)
  console.log(`API incorporada: ${config.apiBaseUrl}`)
}

verifyRelease().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

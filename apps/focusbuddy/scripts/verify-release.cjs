const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { normalizeAppUrl } = require('../electron/app-url.cjs')
const { FUSE_POLICY } = require('./fuse-policy.cjs')

const enabled = '1'.charCodeAt(0)
const disabled = '0'.charCodeAt(0)
const releaseDirectory = path.resolve(__dirname, '../release/win-unpacked')
const executablePath = path.join(releaseDirectory, 'Konea FocusBuddy.exe')
const configPath = path.join(
  releaseDirectory,
  'resources',
  'focusbuddy.config.json',
)

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

  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.equal(typeof config.appUrl, 'string')
  assert.equal(normalizeAppUrl(config.appUrl), config.appUrl)

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
  console.log(`Endpoint incorporado: ${config.appUrl}`)
}

verifyRelease().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

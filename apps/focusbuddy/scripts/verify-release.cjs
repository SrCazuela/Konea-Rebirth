const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { extractFile, listPackage } = require('@electron/asar')
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
const avatarDirectory = 'electron/assets/avatar-hq'
const manifestFile = `${avatarDirectory}/source-manifest.json`

function verifyRuntimeArchive(archivePath) {
  const manifest = JSON.parse(
    readFileSync(path.resolve(__dirname, '..', manifestFile), 'utf8'),
  )
  assert.equal(manifest.fileCount, 35)
  assert.equal(manifest.files.length, manifest.fileCount)
  assert.equal(
    new Set(manifest.files.map((asset) => asset.local)).size,
    manifest.fileCount,
  )

  const packagedFiles = new Set(
    listPackage(archivePath).map((entry) =>
      entry.replace(/^[/\\]+/, '').replaceAll('\\', '/'),
    ),
  )
  const requiredFiles = [
    'electron/desktop.html',
    'electron/desktop.css',
    'electron/desktop.js',
    'electron/desktop-api.cjs',
    'electron/owl-shimeji-provisional.png',
    'electron/avatar-library.js',
    'electron/avatar-animation.js',
    'electron/companion.html',
    'electron/companion.css',
    'electron/companion.js',
    'electron/companion-preload.cjs',
    manifestFile,
    ...manifest.files.map((asset) => `${avatarDirectory}/${asset.local}`),
  ]
  for (const requiredFile of requiredFiles) {
    assert.ok(
      packagedFiles.has(requiredFile),
      `Falta la interfaz local en el paquete: ${requiredFile}`,
    )
  }

  assert.deepEqual(
    JSON.parse(
      extractFile(archivePath, path.normalize(manifestFile)).toString('utf8'),
    ),
    manifest,
    'El manifiesto de sprites del ASAR no coincide con los originales.',
  )
  for (const asset of manifest.files) {
    const bytes = extractFile(
      archivePath,
      path.join(avatarDirectory, asset.local),
    )
    assert.equal(
      bytes.length,
      asset.bytes,
      `El tamaño del sprite empaquetado cambió: ${asset.local}`,
    )
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      asset.sha256,
      `El sprite empaquetado no conserva el original: ${asset.local}`,
    )
  }
}

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

  verifyRuntimeArchive(asarPath)

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

if (require.main === module) {
  verifyRelease().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

module.exports = { verifyRuntimeArchive }

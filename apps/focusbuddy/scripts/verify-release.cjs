const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} = require('node:fs')
const path = require('node:path')
const { extractFile, listPackage } = require('@electron/asar')
const {
  configSha256,
  releaseIdentity,
  validatePackagedConfig,
} = require('../electron/release-channel.cjs')
const { FUSE_POLICY } = require('./fuse-policy.cjs')

const enabled = '1'.charCodeAt(0)
const disabled = '0'.charCodeAt(0)
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
    'electron/api-url.cjs',
    'electron/release-channel.cjs',
    'electron/ui-protocol.cjs',
    'electron/desktop.html',
    'electron/desktop.css',
    'electron/desktop.js',
    'electron/desktop-api.cjs',
    'electron/assets/branding/konea-logo.svg',
    'electron/assets/branding/konea-mark.svg',
    'electron/owl-shimeji-provisional.png',
    'electron/avatar-library.js',
    'electron/avatar-animation.js',
    'electron/motion-policy.js',
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

  for (const [name, canonical] of [
    ['konea-logo.svg', 'konea-logo.svg'],
    ['konea-mark.svg', 'favicon.svg'],
  ]) {
    const canonicalBytes = readFileSync(
      path.resolve(__dirname, '../../web/public', canonical),
    )
    const packagedBytes = extractFile(
      archivePath,
      path.join('electron/assets/branding', name),
    )
    assert.equal(
      createHash('sha256').update(packagedBytes).digest('hex'),
      createHash('sha256').update(canonicalBytes).digest('hex'),
      `La identidad empaquetada no coincide con el original: ${name}`,
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

function verifyPackagedReleaseConfig(
  archivePath,
  publicConfigPath,
  channel,
  expectedConfigPath,
) {
  releaseIdentity(channel)
  const packagedPackage = JSON.parse(
    extractFile(archivePath, 'package.json').toString('utf8'),
  )
  const metadata = packagedPackage.focusbuddyRelease
  assert.equal(
    metadata?.channel,
    channel,
    'El paquete pertenece a otro canal de FocusBuddy.',
  )
  const source = readFileSync(publicConfigPath, 'utf8')
  const config = validatePackagedConfig(source, metadata)
  if (expectedConfigPath) {
    assert.equal(
      configSha256(source),
      configSha256(readFileSync(expectedConfigPath)),
      'La configuración empaquetada no coincide con la compilación solicitada.',
    )
  }
  return config
}

function writeInstallerChecksums(installerPath, { channel, version }) {
  const directory = path.dirname(installerPath)
  const files = [installerPath]
  if (channel === 'production') {
    const stablePath = path.join(directory, 'Konea-FocusBuddy-Windows-x64.exe')
    copyFileSync(installerPath, stablePath)
    files.push(stablePath)
  }
  const lines = files.map((file) => {
    const sha256 = configSha256(readFileSync(file))
    const line = `${sha256}  ${path.basename(file)}\n`
    writeFileSync(`${file}.sha256`, line, 'utf8')
    return line
  })
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), lines.join(''), 'utf8')
  writeFileSync(
    path.join(directory, 'release-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        channel,
        version,
        files: files.map((file) => ({
          name: path.basename(file),
          sha256: configSha256(readFileSync(file)),
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

async function verifyRelease({
  channel = 'local',
  requireInstaller = false,
} = {}) {
  const identity = releaseIdentity(channel)
  const outputDirectory = path.resolve(__dirname, '../release', channel)
  const releaseDirectory = path.join(outputDirectory, 'win-unpacked')
  const executablePath = path.join(
    releaseDirectory,
    `${identity.productName}.exe`,
  )
  const asarPath = path.join(releaseDirectory, 'resources', 'app.asar')
  const configPath = path.join(
    releaseDirectory,
    'resources',
    'focusbuddy.config.json',
  )
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

  const config = verifyPackagedReleaseConfig(
    asarPath,
    configPath,
    channel,
    path.resolve(__dirname, '../build', channel, 'focusbuddy.config.json'),
  )

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

  if (requireInstaller) {
    const version = require('../package.json').version
    const installerName =
      channel === 'local'
        ? `Konea-FocusBuddy-Local-${version}-x64.exe`
        : `Konea-FocusBuddy-${version}-x64.exe`
    const installerPath = path.join(outputDirectory, installerName)
    assert.ok(
      existsSync(installerPath),
      'No se encontró el instalador Windows x64 del canal solicitado.',
    )
    writeInstallerChecksums(installerPath, { channel, version })
  }

  console.log(`Release verificado: ${executablePath}`)
  console.log(`API incorporada: ${config.apiBaseUrl}`)
}

if (require.main === module) {
  const argumentsFromCommandLine = process.argv.slice(2)
  const channel =
    argumentsFromCommandLine
      .find((argument) => argument.startsWith('--channel='))
      ?.slice(10) || 'local'
  verifyRelease({
    channel,
    requireInstaller: argumentsFromCommandLine.includes('--require-installer'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

module.exports = {
  verifyRuntimeArchive,
  verifyPackagedReleaseConfig,
  writeInstallerChecksums,
  verifyRelease,
}

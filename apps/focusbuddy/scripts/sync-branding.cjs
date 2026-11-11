const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
const path = require('node:path')

const applicationDirectory = path.resolve(__dirname, '..')
const repositoryDirectory = path.resolve(applicationDirectory, '../..')
const sourceDirectory = path.resolve(applicationDirectory, '../web/public')
const brandingDirectory = path.join(
  applicationDirectory,
  'electron/assets/branding',
)
const connectorDirectory = path.resolve(
  applicationDirectory,
  '../ava-connector/assets',
)
const iconSource = path.join(applicationDirectory, 'build/icon-source.html')
const iconTarget = path.join(applicationDirectory, 'build/icon.png')
const stateDirectory = path.join(
  repositoryDirectory,
  '.local/focusbuddy-branding',
)
const manifestPath = path.join(stateDirectory, 'manifest.json')
const assets = [
  ['konea-logo.svg', 'konea-logo.svg'],
  ['favicon.svg', 'konea-mark.svg'],
]
const iconFiles = [
  [512, 'icon.png', iconTarget],
  ...[16, 32, 48, 128].map((size) => [
    size,
    `icon${size}.png`,
    path.join(connectorDirectory, `icon${size}.png`),
  ]),
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

function verifyPng(bytes, size = 512) {
  assert.ok(bytes.length > 24, 'El icono PNG no contiene una imagen válida.')
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(
    bytes.readUInt32BE(16),
    size,
    `El icono debe tener ${size} px de ancho.`,
  )
  assert.equal(
    bytes.readUInt32BE(20),
    size,
    `El icono debe tener ${size} px de alto.`,
  )
}

function isReadyBrandingFrame(bitmap, sourceDecoded) {
  return (
    sourceDecoded === true &&
    bitmap.length >= 4 &&
    bitmap.length % 4 === 0 &&
    bitmap[3] === 0 &&
    bitmap.some((value, index) => index % 4 === 3 && value > 0)
  )
}

function removeOwnedRenderDirectory(directory) {
  if (!existsSync(directory)) return
  // Verify the real absolute target before recursively removing our own profile.
  const root = realpathSync(stateDirectory)
  const target = realpathSync(directory)
  assert.equal(path.dirname(target).toLowerCase(), root.toLowerCase())
  assert.ok(path.basename(target).startsWith('render-'))
  rmSync(target, { recursive: true, force: true })
}

function synchronizeBranding() {
  mkdirSync(brandingDirectory, { recursive: true })
  mkdirSync(connectorDirectory, { recursive: true })
  mkdirSync(stateDirectory, { recursive: true })
  for (const [sourceName, targetName] of assets) {
    const source = path.join(sourceDirectory, sourceName)
    const target = path.join(brandingDirectory, targetName)
    const bytes = readFileSync(source)
    if (!existsSync(target) || !readFileSync(target).equals(bytes)) {
      copyFileSync(source, target)
    }
  }

  const connectorMark = path.join(connectorDirectory, 'konea-mark.svg')
  const markBytes = readFileSync(path.join(sourceDirectory, 'favicon.svg'))
  if (
    !existsSync(connectorMark) ||
    !readFileSync(connectorMark).equals(markBytes)
  ) {
    writeFileSync(connectorMark, markBytes)
  }

  const inputHash = sha256(
    Buffer.concat([
      readFileSync(path.join(sourceDirectory, 'favicon.svg')),
      readFileSync(iconSource),
      readFileSync(__filename),
    ]),
  )
  const previous = readManifest()
  let cached = previous?.inputHash === inputHash
  try {
    cached &&= iconFiles.every(([size, , target]) => {
      const bytes = readFileSync(target)
      verifyPng(bytes, size)
      return previous.icons?.[size] === sha256(bytes)
    })
  } catch {
    cached = false
  }
  if (cached) {
    console.log('Identidad de FocusBuddy y conector AVA actualizada.')
    return
  }

  const renderDirectory = mkdtempSync(path.join(stateDirectory, 'render-'))
  try {
    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    const result = spawnSync(
      require('electron'),
      [__filename, '--render-branding', renderDirectory],
      {
        cwd: applicationDirectory,
        env: environment,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 30_000,
      },
    )
    if (result.error || result.status !== 0) {
      throw new Error(
        `No se pudo generar el icono de FocusBuddy: ${result.error?.message || result.stderr?.trim() || `código ${result.status}`}`,
      )
    }
    const icons = {}
    for (const [size, file, target] of iconFiles) {
      const rendered = readFileSync(path.join(renderDirectory, file))
      verifyPng(rendered, size)
      copyFileSync(path.join(renderDirectory, file), target)
      icons[size] = sha256(rendered)
    }
    const temporaryManifest = path.join(renderDirectory, 'manifest.json')
    writeFileSync(
      temporaryManifest,
      JSON.stringify({ version: 1, inputHash, icons }, null, 2) + '\n',
    )
    renameSync(temporaryManifest, manifestPath)
    console.log(
      'Identidad generada: FocusBuddy 512 px y conector AVA 16/32/48/128 px.',
    )
  } finally {
    removeOwnedRenderDirectory(renderDirectory)
  }
}

async function renderIcon() {
  const { app, BrowserWindow } = require('electron')
  const flag = process.argv.indexOf('--render-branding')
  const directory = path.resolve(process.argv[flag + 1] || '')
  assert.equal(
    path.dirname(directory).toLowerCase(),
    stateDirectory.toLowerCase(),
  )
  assert.ok(path.basename(directory).startsWith('render-'))
  for (const [name, child] of [
    ['userData', 'user-data'],
    ['sessionData', 'session'],
    ['logs', 'logs'],
  ]) {
    const destination = path.join(directory, child)
    mkdirSync(destination, { recursive: true })
    app.setPath(name, destination)
  }
  app.setName('Konea Branding Renderer')
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  app.commandLine.appendSwitch('force-color-profile', 'srgb')
  await app.whenReady()
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  try {
    let sourceDecoded = false
    let painted = null
    let finishPaint
    window.webContents.on('paint', (_event, _dirty, image) => {
      if (painted || !sourceDecoded || image.isEmpty()) return
      const bitmap = image.toBitmap()
      if (isReadyBrandingFrame(bitmap, sourceDecoded)) {
        painted = image
        finishPaint()
      }
    })
    await window.loadFile(iconSource)
    await window.webContents.executeJavaScript(
      'Promise.all(Array.from(document.images, image => image.decode()))',
    )
    // Chromium can paint an opaque initial surface before loading the SVG.
    // Only wait for a new, decoded frame requested by this invalidation.
    const ready = new Promise((resolve) => {
      finishPaint = resolve
    })
    sourceDecoded = true
    window.webContents.invalidate()
    let timeout
    try {
      await Promise.race([
        ready,
        new Promise((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('No se recibió el icono renderizado.')),
            10_000,
          )
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
    const image = painted.resize({
      width: 512,
      height: 512,
      quality: 'best',
    })
    assert.ok(!image.isEmpty(), 'La captura del icono quedó vacía.')
    const bitmap = image.toBitmap()
    assert.equal(bitmap[3], 0, 'El fondo del icono debe ser transparente.')
    assert.ok(
      bitmap.some((value, index) => index % 4 === 3 && value > 0),
      'La captura debe contener el monograma de Konea.',
    )
    for (const [size, file] of iconFiles) {
      const resized =
        size === 512
          ? image
          : image.resize({ width: size, height: size, quality: 'best' })
      writeFileSync(path.join(directory, file), resized.toPNG())
    }
  } finally {
    window.destroy()
  }
  app.exit(0)
}

module.exports = { isReadyBrandingFrame }

if (process.versions.electron && process.argv.includes('--render-branding')) {
  renderIcon().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    require('electron').app.exit(1)
  })
} else if (require.main === module) {
  try {
    synchronizeBranding()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

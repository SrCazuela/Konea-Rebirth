const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const { describe, it } = require('node:test')
const path = require('node:path')
const { createPackage } = require('@electron/asar')
const packageConfig = require('../package.json')
const { FUSE_POLICY } = require('../scripts/fuse-policy.cjs')
const { environmentForBuilder } = require('../scripts/run-electron-builder.cjs')
const { verifyRuntimeArchive } = require('../scripts/verify-release.cjs')
const { createWebPreferences } = require('./window-options.cjs')

describe('FocusBuddy package security', () => {
  it('packages only the runtime files required by the desktop shell', () => {
    assert.deepEqual(packageConfig.build.files, [
      'electron/api-url.cjs',
      'electron/assets/avatar-hq/*.png',
      'electron/assets/avatar-hq/source-manifest.json',
      'electron/avatar-animation.js',
      'electron/avatar-library.js',
      'electron/companion.css',
      'electron/companion.html',
      'electron/companion.js',
      'electron/companion-preload.cjs',
      'electron/desktop-api.cjs',
      'electron/desktop.css',
      'electron/desktop.html',
      'electron/desktop.js',
      'electron/main.cjs',
      'electron/owl-shimeji-provisional.png',
      'electron/preload.cjs',
      'electron/preferences.cjs',
      'electron/session-state.cjs',
      'electron/window-options.cjs',
      'package.json',
    ])
    assert.equal(
      packageConfig.build.files.some((entry) => entry.includes('test')),
      false,
    )
  })

  it('hardens the packaged Electron runtime with explicit fuses', () => {
    assert.equal(packageConfig.build.afterPack, 'scripts/after-pack.cjs')
    assert.deepEqual(FUSE_POLICY, {
      RunAsNode: false,
      EnableCookieEncryption: true,
      EnableNodeOptionsEnvironmentVariable: false,
      EnableNodeCliInspectArguments: false,
      EnableEmbeddedAsarIntegrityValidation: true,
      OnlyLoadAppFromAsar: true,
      LoadBrowserProcessSpecificV8Snapshot: false,
      GrantFileProtocolExtraPrivileges: false,
      WasmTrapHandlers: true,
    })
  })

  it('uses a fuse library that recognizes the complete Electron policy', async () => {
    const { FuseV1Options } = await import('@electron/fuses')

    for (const name of Object.keys(FUSE_POLICY)) {
      assert.equal(
        typeof FuseV1Options[name],
        'number',
        `@electron/fuses does not recognize ${name}`,
      )
    }
  })

  it('makes Windows PowerShell discoverable for electron-builder', () => {
    const expectedDirectory = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0'
    const result = environmentForBuilder(
      {
        SystemRoot: 'C:\\Windows',
        Path: 'C:\\Program Files\\nodejs;D:\\tools',
      },
      {
        platform: 'win32',
        fileExists: (candidate) =>
          candidate === `${expectedDirectory}\\powershell.exe`,
      },
    )

    assert.equal(
      result.Path,
      `${expectedDirectory};C:\\Program Files\\nodejs;D:\\tools`,
    )
    assert.equal(result.PATH, result.Path)
  })

  it('loads a packaged local interface under a strict CSP', () => {
    const desktopHtml = readFileSync(
      path.join(__dirname, 'desktop.html'),
      'utf8',
    )
    const mainSource = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')

    assert.match(desktopHtml, /default-src 'none'/)
    assert.match(desktopHtml, /script-src 'self'/)
    assert.match(desktopHtml, /connect-src 'none'/)
    assert.doesNotMatch(desktopHtml, /unsafe-inline/)
    assert.doesNotMatch(desktopHtml, /<script[^>]*>[^<]+<\/script>/)
    assert.match(mainSource, /loadFile\([^)]*desktop\.html/)
    assert.doesNotMatch(mainSource, /\.loadURL\(/)
  })

  it('keeps the local companion under a strict content security policy', () => {
    const companionHtml = readFileSync(
      path.join(__dirname, 'companion.html'),
      'utf8',
    )

    assert.match(companionHtml, /default-src 'none'/)
    assert.match(companionHtml, /script-src 'self'/)
    assert.doesNotMatch(companionHtml, /unsafe-inline/)
    assert.doesNotMatch(companionHtml, /<script[^>]*>[^<]+<\/script>/)
  })

  it('packages Kuco and all 35 intact artist exports referenced by the animation library', () => {
    const companionHtml = readFileSync(
      path.join(__dirname, 'companion.html'),
      'utf8',
    )
    const companionCss = readFileSync(
      path.join(__dirname, 'companion.css'),
      'utf8',
    )
    const companionScript = readFileSync(
      path.join(__dirname, 'companion.js'),
      'utf8',
    )
    const sourceDirectory = path.join(__dirname, 'assets', 'avatar-official')
    const runtimeDirectory = path.join(__dirname, 'assets', 'avatar-hq')
    const manifest = JSON.parse(
      readFileSync(path.join(runtimeDirectory, 'source-manifest.json'), 'utf8'),
    )
    const library = require('./avatar-library.js')
    const referenced = new Set(
      Object.keys(library.chibi)
        .flatMap((scene) => library.sourcesForScene(scene))
        .map((source) => path.basename(source)),
    )

    assert.match(companionHtml, /assets\/avatar-hq\/idle-1\.png/)
    assert.match(companionScript, /window\.FocusBuddyAvatars/)
    assert.match(companionScript, /window\.FocusBuddyAnimation\.createAnimator/)
    assert.doesNotMatch(
      companionHtml + companionScript,
      /avatar-official|avatar-cutout/,
    )
    assert.match(companionCss, /owl-shimeji-provisional\.png/)
    assert.match(companionHtml, /data-character="chibi"/)
    assert.ok(existsSync(path.join(__dirname, 'owl-shimeji-provisional.png')))
    assert.equal(manifest.files.length, 35)
    assert.equal(manifest.fileCount, 35)
    assert.equal(referenced.size, 35)
    assert.deepEqual(manifest.canvas, { width: 2136, height: 3000 })
    for (const asset of manifest.files) {
      const bytes = readFileSync(path.join(runtimeDirectory, asset.local))
      assert.ok(
        referenced.has(asset.local),
        `Missing runtime scene for ${asset.local}`,
      )
      assert.equal(bytes.length, asset.bytes)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        asset.sha256,
      )
      assert.equal(bytes.readUInt32BE(16), manifest.canvas.width)
      assert.equal(bytes.readUInt32BE(20), manifest.canvas.height)
    }
    assert.ok(existsSync(path.join(sourceDirectory, 'source-manifest.json')))
    assert.match(companionCss, /prefers-reduced-motion: reduce/)
    assert.match(companionCss, /\.reduce-motion/)
  })

  it('separates local desktop and companion preload capabilities', () => {
    const desktopPreload = readFileSync(
      path.join(__dirname, 'preload.cjs'),
      'utf8',
    )
    const companionPreload = readFileSync(
      path.join(__dirname, 'companion-preload.cjs'),
      'utf8',
    )

    assert.match(desktopPreload, /health\.get/)
    assert.match(desktopPreload, /getPreferences|updatePreferences/)
    assert.match(desktopPreload, /getConnectionInfo|updateSessionState/)
    assert.doesNotMatch(desktopPreload, /toggleCompact|openMain|hideCompanion/)
    assert.match(companionPreload, /toggleCompact|getPreferences/)
    assert.doesNotMatch(
      companionPreload,
      /updateSessionState|updatePreferences|health\.get/,
    )
  })

  it('verifies actual ASAR assets and rejects missing runtimes or changed sprites', async (context) => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'konea-release-check-'),
    )
    context.after(() => {
      assert.equal(path.dirname(temporaryDirectory), path.resolve(tmpdir()))
      assert.match(path.basename(temporaryDirectory), /^konea-release-check-/)
      rmSync(temporaryDirectory, { recursive: true, force: true })
    })
    const stagingDirectory = path.join(temporaryDirectory, 'app')
    const packageDirectory = path.resolve(__dirname, '..')
    const avatarDirectory = 'electron/assets/avatar-hq'
    const manifest = JSON.parse(
      readFileSync(
        path.join(packageDirectory, avatarDirectory, 'source-manifest.json'),
        'utf8',
      ),
    )
    const files = [
      ...packageConfig.build.files.filter((file) => !file.includes('*')),
      ...manifest.files.map((asset) => `${avatarDirectory}/${asset.local}`),
    ]
    const copyRuntimeFile = (file) => {
      const destination = path.join(stagingDirectory, file)
      mkdirSync(path.dirname(destination), { recursive: true })
      copyFileSync(path.join(packageDirectory, file), destination)
    }
    files.forEach(copyRuntimeFile)

    const completeArchive = path.join(temporaryDirectory, 'complete.asar')
    await createPackage(stagingDirectory, completeArchive)
    assert.doesNotThrow(() => verifyRuntimeArchive(completeArchive))

    for (const missingFile of [
      'electron/avatar-animation.js',
      'electron/companion.js',
    ]) {
      const incompleteArchive = path.join(
        temporaryDirectory,
        `${path.basename(missingFile)}-missing.asar`,
      )
      unlinkSync(path.join(stagingDirectory, missingFile))
      await createPackage(stagingDirectory, incompleteArchive)
      assert.throws(
        () => verifyRuntimeArchive(incompleteArchive),
        (error) => error.message.includes(missingFile),
      )
      copyRuntimeFile(missingFile)
    }

    const changedSpritePath = path.join(
      stagingDirectory,
      avatarDirectory,
      manifest.files[0].local,
    )
    const changedBytes = readFileSync(changedSpritePath)
    changedBytes[changedBytes.length - 1] ^= 1
    writeFileSync(changedSpritePath, changedBytes)
    const modifiedArchive = path.join(temporaryDirectory, 'changed-sprite.asar')
    await createPackage(stagingDirectory, modifiedArchive)
    assert.throws(
      () => verifyRuntimeArchive(modifiedArchive),
      /El sprite empaquetado no conserva el original/,
    )
  })

  it('keeps privileged renderer features disabled in packaged windows', () => {
    const preferences = createWebPreferences({
      preloadPath: 'C:\\Konea\\preload.cjs',
      isPackaged: true,
    })

    assert.deepEqual(preferences, {
      preload: 'C:\\Konea\\preload.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: false,
      backgroundThrottling: false,
      partition: 'persist:konea-focusbuddy',
    })
    assert.equal(
      createWebPreferences({ preloadPath: 'preload.cjs', isPackaged: false })
        .devTools,
      true,
    )
  })
})

const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { describe, it } = require('node:test')
const path = require('node:path')
const packageConfig = require('../package.json')
const { FUSE_POLICY } = require('../scripts/fuse-policy.cjs')
const { environmentForBuilder } = require('../scripts/run-electron-builder.cjs')
const { createWebPreferences } = require('./window-options.cjs')

describe('FocusBuddy package security', () => {
  it('packages only the runtime files required by the desktop shell', () => {
    assert.deepEqual(packageConfig.build.files, [
      'electron/api-url.cjs',
      'electron/assets/avatar-cutout/*.png',
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

  it('packages Kuco and transparent chibi derivatives while preserving the sources', () => {
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
    const runtimeDirectory = path.join(__dirname, 'assets', 'avatar-cutout')
    const manifest = JSON.parse(
      readFileSync(path.join(sourceDirectory, 'source-manifest.json'), 'utf8'),
    )

    assert.match(companionHtml, /assets\/avatar-cutout\/idle-1\.png/)
    assert.match(companionScript, /assets\/avatar-cutout/)
    assert.match(companionScript, /typing-concentrated-3\.png/)
    assert.doesNotMatch(companionHtml + companionScript, /avatar-official/)
    assert.match(companionCss, /owl-shimeji-provisional\.png/)
    assert.match(companionHtml, /data-character="kuco"/)
    assert.ok(existsSync(path.join(__dirname, 'owl-shimeji-provisional.png')))
    assert.equal(manifest.files.length, 12)
    for (const asset of manifest.files) {
      assert.ok(existsSync(path.join(sourceDirectory, asset.local)))
      assert.ok(existsSync(path.join(runtimeDirectory, asset.local)))
    }
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

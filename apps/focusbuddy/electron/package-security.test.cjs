const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { describe, it } = require('node:test')
const path = require('node:path')
const packageConfig = require('../package.json')
const { FUSE_POLICY } = require('../scripts/fuse-policy.cjs')
const { environmentForBuilder } = require('../scripts/run-electron-builder.cjs')
const { createWebPreferences } = require('./window-options.cjs')

describe('FocusBuddy package security', () => {
  it('packages only the runtime files required by the desktop shell', () => {
    assert.deepEqual(packageConfig.build.files, [
      'electron/app-url.cjs',
      'electron/companion.css',
      'electron/companion.html',
      'electron/companion.js',
      'electron/companion-preload.cjs',
      'electron/main.cjs',
      'electron/offline.html',
      'electron/offline.js',
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

  it('does not allow inline scripts in the local offline page', () => {
    const offlineHtml = readFileSync(
      path.join(__dirname, 'offline.html'),
      'utf8',
    )

    assert.match(offlineHtml, /script-src 'self'/)
    assert.doesNotMatch(offlineHtml, /script-src 'unsafe-inline'/)
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

  it('animates the owned sprite sheet and honors reduced motion', () => {
    const companionCss = readFileSync(
      path.join(__dirname, 'companion.css'),
      'utf8',
    )

    assert.match(companionCss, /companion-frames/)
    assert.match(companionCss, /steps\(3, end\)/)
    assert.match(companionCss, /prefers-reduced-motion: reduce/)
    assert.match(companionCss, /\.reduce-motion/)
  })

  it('separates remote-page and local-companion preload capabilities', () => {
    const remotePreload = readFileSync(
      path.join(__dirname, 'preload.cjs'),
      'utf8',
    )
    const companionPreload = readFileSync(
      path.join(__dirname, 'companion-preload.cjs'),
      'utf8',
    )

    assert.match(remotePreload, /updateSessionState/)
    assert.doesNotMatch(remotePreload, /toggleCompact|getPreferences/)
    assert.match(companionPreload, /toggleCompact|getPreferences/)
    assert.doesNotMatch(companionPreload, /updateSessionState/)
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

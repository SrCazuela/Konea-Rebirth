const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  Tray,
} = require('electron')
const {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require('node:fs')
const path = require('node:path')
const { DEFAULT_API_BASE_URL, selectApiBaseUrl } = require('./api-url.cjs')
const { createDesktopApiClient } = require('./desktop-api.cjs')
const {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
} = require('./preferences.cjs')
const {
  DEFAULT_SESSION_STATE,
  normalizeSessionState,
} = require('./session-state.cjs')
const { createWebPreferences } = require('./window-options.cjs')

const NORMAL_MINIMUM_SIZE = [980, 680]
const COMPACT_SIZE = { width: 460, height: 720 }
const COMPACT_MINIMUM_SIZE = [390, 560]
const COMPANION_SIZES = {
  small: { width: 180, height: 235 },
  medium: { width: 230, height: 290 },
  large: { width: 290, height: 350 },
}

let mainWindow = null
let companionWindow = null
let tray = null
let apiBaseUrl = DEFAULT_API_BASE_URL
let desktopApi = null
let isQuitting = false
let normalWindowBounds = null
let preferences = { ...DEFAULT_PREFERENCES }
let sessionState = { ...DEFAULT_SESSION_STATE }
let companionMoveTimer = null
const notifiedSessions = new Set()

const customDataDirectory = process.env.FOCUSBUDDY_DATA_DIR
if (!app.isPackaged && customDataDirectory) {
  const resolvedDataDirectory = path.resolve(customDataDirectory)
  const sessionDataDirectory = path.join(resolvedDataDirectory, 'session')
  mkdirSync(sessionDataDirectory, { recursive: true })
  app.setPath('userData', resolvedDataDirectory)
  app.setPath('sessionData', sessionDataDirectory)
}

function preferencesPath() {
  return path.join(app.getPath('userData'), 'desktop-preferences.json')
}

function readPreferences() {
  try {
    return normalizePreferences(
      JSON.parse(readFileSync(preferencesPath(), 'utf8')),
    )
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function persistPreferences() {
  const target = preferencesPath()
  const temporary = `${target}.tmp`
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(temporary, `${JSON.stringify(preferences, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  renameSync(temporary, target)
}

function resolveApiBaseUrl() {
  const commandLineValue = process.argv
    .find((argument) => argument.startsWith('--api-url='))
    ?.slice('--api-url='.length)
  const legacyCommandLineValue = process.argv
    .find((argument) => argument.startsWith('--app-url='))
    ?.slice('--app-url='.length)

  let config = {}
  try {
    const configPath = app.isPackaged
      ? path.join(process.resourcesPath, 'focusbuddy.config.json')
      : path.join(__dirname, '../build/focusbuddy.config.json')
    const value = JSON.parse(readFileSync(configPath, 'utf8'))
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      config = value
    }
  } catch {
    // En desarrollo el archivo es opcional; localhost sigue siendo el fallback.
  }

  const configuredApiUrl =
    typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl : null
  const configuredAppUrl =
    typeof config.appUrl === 'string' ? config.appUrl : null

  return selectApiBaseUrl({
    isPackaged: app.isPackaged,
    commandLineValue,
    environmentValue: process.env.FOCUSBUDDY_API_URL,
    packagedValue: configuredApiUrl,
    appUrl: app.isPackaged
      ? configuredAppUrl
      : legacyCommandLineValue || process.env.FOCUSBUDDY_APP_URL,
  })
}

function connectionInfo() {
  const endpoint = new URL(apiBaseUrl)
  const isLocal = new Set(['localhost', '127.0.0.1', '[::1]']).has(
    endpoint.hostname.toLowerCase(),
  )
  return {
    apiBaseUrl,
    url: apiBaseUrl,
    server: endpoint.host,
    environment: isLocal
      ? 'API local'
      : app.isPackaged
        ? 'Producción'
        : 'Desarrollo',
    isPackaged: app.isPackaged,
    version: app.getVersion(),
  }
}

function isWindowSender(event, window) {
  return Boolean(
    event?.sender?.id &&
    window &&
    !window.isDestroyed() &&
    window.webContents.id === event.sender.id,
  )
}

function sendToCompanion(channel, value) {
  if (!companionWindow || companionWindow.isDestroyed()) return
  if (companionWindow.webContents.isLoading()) return
  companionWindow.webContents.send(channel, value)
}

function broadcastPreferences() {
  for (const window of [mainWindow, companionWindow]) {
    if (!window || window.isDestroyed() || window.webContents.isLoading())
      continue
    window.webContents.send('focusbuddy:preferences-changed', preferences)
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function compactBounds() {
  const currentDisplay = screen.getDisplayMatching(
    mainWindow?.getBounds() ?? screen.getPrimaryDisplay().workArea,
  )
  const { workArea } = currentDisplay
  const width = Math.min(COMPACT_SIZE.width, workArea.width)
  const height = Math.min(COMPACT_SIZE.height, workArea.height)
  return {
    width,
    height,
    x: workArea.x + workArea.width - width,
    y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)),
  }
}

function applyCompactMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (preferences.compactMode) {
    if (!normalWindowBounds) normalWindowBounds = mainWindow.getBounds()
    mainWindow.setMinimumSize(...COMPACT_MINIMUM_SIZE)
    mainWindow.setBounds(compactBounds(), true)
    mainWindow.setTitle('Konea FocusBuddy · Mini')
    return
  }

  mainWindow.setMinimumSize(...NORMAL_MINIMUM_SIZE)
  if (normalWindowBounds) {
    mainWindow.setBounds(normalWindowBounds, true)
    normalWindowBounds = null
  } else if (
    mainWindow.getBounds().width < NORMAL_MINIMUM_SIZE[0] ||
    mainWindow.getBounds().height < NORMAL_MINIMUM_SIZE[1]
  ) {
    mainWindow.setSize(1360, 880, true)
  }
  mainWindow.setTitle('Konea FocusBuddy')
}

function companionSize() {
  return COMPANION_SIZES[preferences.companionScale] ?? COMPANION_SIZES.medium
}

function companionBounds() {
  const size = companionSize()
  const display = preferences.companionPosition
    ? screen.getDisplayNearestPoint(preferences.companionPosition)
    : screen.getPrimaryDisplay()
  const { workArea } = display
  const fallback = {
    x: workArea.x + workArea.width - size.width - 20,
    y: workArea.y + workArea.height - size.height - 20,
  }
  const requested = preferences.companionPosition ?? fallback
  return {
    ...size,
    x: Math.max(
      workArea.x,
      Math.min(requested.x, workArea.x + workArea.width - size.width),
    ),
    y: Math.max(
      workArea.y,
      Math.min(requested.y, workArea.y + workArea.height - size.height),
    ),
  }
}

function applyCompanionPreferences() {
  if (!companionWindow || companionWindow.isDestroyed()) return
  companionWindow.setAlwaysOnTop(
    preferences.companionAlwaysOnTop,
    preferences.companionAlwaysOnTop ? 'floating' : 'normal',
  )
  companionWindow.setBounds(companionBounds(), true)
  companionWindow.setVisibleOnAllWorkspaces(preferences.companionAlwaysOnTop, {
    visibleOnFullScreen: false,
  })
  if (preferences.companionEnabled) companionWindow.showInactive()
  else companionWindow.hide()
}

function statusLabel() {
  if (sessionState.status === 'active')
    return `En curso · ${sessionState.timerLabel}`
  if (sessionState.status === 'paused')
    return `En pausa · ${sessionState.timerLabel}`
  if (sessionState.status === 'completed') return 'Bloque completado'
  if (sessionState.status === 'offline') return 'Sin conexión con Konea'
  return 'Listo para estudiar'
}

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'focusbuddy-icon.png')
    : path.join(__dirname, '../build/icon.png')
}

function buildTrayMenu() {
  if (!tray) return
  tray.setToolTip(`Konea FocusBuddy · ${statusLabel()}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: statusLabel(), enabled: false },
      { type: 'separator' },
      { label: 'Abrir FocusBuddy', click: showMainWindow },
      {
        label: 'Ventana compacta',
        type: 'checkbox',
        checked: preferences.compactMode,
        click: (item) => updatePreferences({ compactMode: item.checked }),
      },
      {
        label: 'Compañero visible',
        type: 'checkbox',
        checked: preferences.companionEnabled,
        click: (item) => updatePreferences({ companionEnabled: item.checked }),
      },
      {
        label: 'Compañero siempre visible',
        type: 'checkbox',
        checked: preferences.companionAlwaysOnTop,
        click: (item) =>
          updatePreferences({ companionAlwaysOnTop: item.checked }),
      },
      {
        label: 'Personaje del compañero',
        submenu: [
          ['kuco', 'Kuco (búho animado)'],
          ['chibi', 'Chibi oficial'],
        ].map(([value, label]) => ({
          label,
          type: 'radio',
          checked: preferences.companionCharacter === value,
          click: () => updatePreferences({ companionCharacter: value }),
        })),
      },
      {
        label: 'Tamaño del compañero',
        submenu: [
          ...[
            ['small', 'Pequeño'],
            ['medium', 'Mediano'],
            ['large', 'Grande'],
          ].map(([value, label]) => ({
            label,
            type: 'radio',
            checked: preferences.companionScale === value,
            click: () => updatePreferences({ companionScale: value }),
          })),
        ],
      },
      {
        label: 'Reducir animaciones',
        type: 'checkbox',
        checked: preferences.reducedMotion,
        click: (item) => updatePreferences({ reducedMotion: item.checked }),
      },
      {
        label: 'Avisar al cumplir el bloque',
        type: 'checkbox',
        checked: preferences.notificationsEnabled,
        click: (item) =>
          updatePreferences({ notificationsEnabled: item.checked }),
      },
      {
        label: 'Cerrar a la bandeja',
        type: 'checkbox',
        checked: preferences.closeToTray,
        click: (item) => updatePreferences({ closeToTray: item.checked }),
      },
      {
        label: 'Iniciar con Windows',
        type: 'checkbox',
        checked: preferences.launchAtLogin,
        enabled: app.isPackaged && process.platform === 'win32',
        click: (item) => updatePreferences({ launchAtLogin: item.checked }),
      },
      { type: 'separator' },
      {
        label: 'Salir de FocusBuddy',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
}

function updateLoginSetting() {
  if (!app.isPackaged || process.platform !== 'win32') return
  app.setLoginItemSettings({
    openAtLogin: preferences.launchAtLogin,
    path: app.getPath('exe'),
  })
}

function updatePreferences(patch) {
  preferences = mergePreferences(preferences, patch)
  try {
    persistPreferences()
  } catch (error) {
    console.error(
      'No se pudieron guardar las preferencias de FocusBuddy.',
      error,
    )
  }
  updateLoginSetting()
  applyCompactMode()
  applyCompanionPreferences()
  buildTrayMenu()
  broadcastPreferences()
  return preferences
}

function notifyCompletedBlock(previousState, nextState) {
  if (
    !preferences.notificationsEnabled ||
    previousState.timerFinished ||
    !nextState.timerFinished ||
    nextState.status !== 'active' ||
    !nextState.sessionId ||
    notifiedSessions.has(nextState.sessionId) ||
    !Notification.isSupported()
  ) {
    return
  }

  notifiedSessions.add(nextState.sessionId)
  if (notifiedSessions.size > 50) {
    notifiedSessions.delete(notifiedSessions.values().next().value)
  }
  const notification = new Notification({
    title: 'Bloque de estudio completado',
    body: `${nextState.title}. Abre FocusBuddy para guardar la sesión y comenzar tu pausa.`,
    silent: false,
  })
  notification.on('click', showMainWindow)
  notification.show()
}

function updateSessionState(value) {
  const nextState = normalizeSessionState(value)
  const statusChanged = nextState.status !== sessionState.status
  notifyCompletedBlock(sessionState, nextState)
  sessionState = nextState
  sendToCompanion('focusbuddy:session-state-changed', sessionState)
  if (statusChanged) buildTrayMenu()
}

function secureLocalWindow(window) {
  const appSession = window.webContents.session
  appSession.setPermissionCheckHandler(() => false)
  appSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  )

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  )
  window.webContents.on('will-navigate', (event) => event.preventDefault())
}

function createMainWindow() {
  apiBaseUrl = resolveApiBaseUrl()
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: NORMAL_MINIMUM_SIZE[0],
    minHeight: NORMAL_MINIMUM_SIZE[1],
    backgroundColor: '#f7f3ff',
    title: 'Konea FocusBuddy',
    autoHideMenuBar: true,
    show: false,
    webPreferences: createWebPreferences({
      preloadPath: path.join(__dirname, 'preload.cjs'),
      isPackaged: app.isPackaged,
    }),
  })

  const appSession = mainWindow.webContents.session
  desktopApi = createDesktopApiClient({
    apiBaseUrl,
    fetchImpl: appSession.fetch.bind(appSession),
  })
  secureLocalWindow(mainWindow)
  mainWindow.once('ready-to-show', () => {
    applyCompactMode()
    mainWindow?.show()
  })
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle(
      preferences.compactMode ? 'Konea FocusBuddy · Mini' : 'Konea FocusBuddy',
    )
  })
  mainWindow.on('close', (event) => {
    if (isQuitting || !preferences.closeToTray) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    desktopApi = null
    if (!isQuitting && !preferences.closeToTray) {
      isQuitting = true
      app.quit()
    }
  })
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, description, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || !mainWindow) return
      updateSessionState({
        status: 'offline',
        title: 'FocusBuddy no pudo abrirse',
      })
      console.error(
        `No se pudo cargar la interfaz local (${errorCode}): ${description}`,
        validatedUrl,
      )
      if (!mainWindow.isVisible()) mainWindow.show()
    },
  )
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow?.isVisible()) mainWindow?.show()
  })

  void mainWindow
    .loadFile(path.join(__dirname, 'desktop.html'))
    .catch((error) =>
      console.error('No se pudo abrir la interfaz local de FocusBuddy.', error),
    )
}

function createCompanionWindow() {
  companionWindow = new BrowserWindow({
    ...companionBounds(),
    minWidth: COMPANION_SIZES.small.width,
    minHeight: COMPANION_SIZES.small.height,
    maxWidth: COMPANION_SIZES.large.width,
    maxHeight: COMPANION_SIZES.large.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'Compañero FocusBuddy',
    webPreferences: createWebPreferences({
      preloadPath: path.join(__dirname, 'companion-preload.cjs'),
      isPackaged: app.isPackaged,
    }),
  })

  companionWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  companionWindow.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  )
  companionWindow.webContents.on('will-navigate', (event) =>
    event.preventDefault(),
  )
  companionWindow.webContents.on('did-finish-load', () => {
    sendToCompanion('focusbuddy:session-state-changed', sessionState)
    sendToCompanion('focusbuddy:preferences-changed', preferences)
    applyCompanionPreferences()
  })
  companionWindow.on('moved', () => {
    if (companionMoveTimer) clearTimeout(companionMoveTimer)
    companionMoveTimer = setTimeout(() => {
      if (!companionWindow || companionWindow.isDestroyed()) return
      const [x, y] = companionWindow.getPosition()
      const current = preferences.companionPosition
      if (current?.x === x && current?.y === y) return
      updatePreferences({ companionPosition: { x, y } })
    }, 180)
  })
  companionWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    updatePreferences({ companionEnabled: false })
  })
  companionWindow.on('closed', () => {
    companionWindow = null
  })

  void companionWindow.loadFile(path.join(__dirname, 'companion.html'))
}

function createTray() {
  let icon = nativeImage.createFromPath(iconPath())
  if (!icon.isEmpty()) icon = icon.resize({ width: 24, height: 24 })
  tray = new Tray(icon)
  tray.on('click', showMainWindow)
  buildTrayMenu()
}

function registerIpcHandlers() {
  ipcMain.handle('focusbuddy:api', async (event, operation, payload) => {
    if (!isWindowSender(event, mainWindow) || !desktopApi) {
      return {
        ok: false,
        error: {
          status: 0,
          code: 'DESKTOP_BRIDGE_UNAVAILABLE',
          message: 'La conexión local de FocusBuddy no está disponible.',
        },
      }
    }
    const result = await desktopApi.invoke(operation, payload)
    if (operation === 'auth.logout' && result.ok) {
      updateSessionState(DEFAULT_SESSION_STATE)
    }
    return result
  })
  ipcMain.handle('focusbuddy:open-main', (event) => {
    if (!isWindowSender(event, companionWindow)) return false
    showMainWindow()
    return true
  })
  ipcMain.handle('focusbuddy:toggle-compact', (event) => {
    if (!isWindowSender(event, companionWindow)) return preferences.compactMode
    updatePreferences({ compactMode: !preferences.compactMode })
    showMainWindow()
    return preferences.compactMode
  })
  ipcMain.handle('focusbuddy:hide-companion', (event) => {
    if (!isWindowSender(event, companionWindow)) return false
    updatePreferences({ companionEnabled: false })
    return true
  })
  ipcMain.handle('focusbuddy:get-preferences', (event) =>
    isWindowSender(event, mainWindow) || isWindowSender(event, companionWindow)
      ? preferences
      : null,
  )
  ipcMain.handle('focusbuddy:update-preferences', (event, patch) =>
    isWindowSender(event, mainWindow) ? updatePreferences(patch) : null,
  )
  ipcMain.handle('focusbuddy:get-connection-info', (event) =>
    isWindowSender(event, mainWindow) ? connectionInfo() : null,
  )
  ipcMain.handle('focusbuddy:get-session-state', (event) =>
    isWindowSender(event, companionWindow) ? sessionState : null,
  )
  ipcMain.on('focusbuddy:update-session-state', (event, value) => {
    if (!isWindowSender(event, mainWindow)) return
    updateSessionState(value)
  })
}

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.on('before-quit', () => {
    isQuitting = true
  })

  app
    .whenReady()
    .then(() => {
      app.setAppUserModelId('cl.konea.focusbuddy')
      preferences = readPreferences()
      registerIpcHandlers()
      createMainWindow()
      createCompanionWindow()
      createTray()
      updateLoginSetting()

      app.on('activate', showMainWindow)
    })
    .catch((error) => {
      console.error('FocusBuddy no pudo iniciarse.', error)
      app.quit()
    })
}

app.on('window-all-closed', () => {
  if (isQuitting || !preferences.closeToTray) app.quit()
})

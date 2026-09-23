function createWebPreferences({ preloadPath, isPackaged }) {
  if (typeof preloadPath !== 'string' || !preloadPath) {
    throw new TypeError('FocusBuddy requiere una ruta de preload válida.')
  }

  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    devTools: !isPackaged,
    // El heartbeat y el cronómetro deben continuar al minimizar la ventana.
    backgroundThrottling: false,
    partition: 'persist:konea-focusbuddy',
  }
}

module.exports = { createWebPreferences }

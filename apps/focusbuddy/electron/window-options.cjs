function createWebPreferences({
  preloadPath,
  isPackaged,
  partition = 'persist:konea-focusbuddy-local',
}) {
  if (typeof preloadPath !== 'string' || !preloadPath) {
    throw new TypeError('FocusBuddy requiere una ruta de preload válida.')
  }
  if (
    ![
      'persist:konea-focusbuddy-local',
      'persist:konea-focusbuddy-production',
    ].includes(partition)
  ) {
    throw new TypeError(
      'FocusBuddy requiere una partición de sesión de su canal.',
    )
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
    partition,
  }
}

module.exports = { createWebPreferences }

const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, value) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('focusBuddyDesktop', {
  openMain: () => ipcRenderer.invoke('focusbuddy:open-main'),
  toggleCompact: () => ipcRenderer.invoke('focusbuddy:toggle-compact'),
  hideCompanion: () => ipcRenderer.invoke('focusbuddy:hide-companion'),
  getPreferences: () => ipcRenderer.invoke('focusbuddy:get-preferences'),
  getSessionState: () => ipcRenderer.invoke('focusbuddy:get-session-state'),
  onPreferences: (callback) =>
    subscribe('focusbuddy:preferences-changed', callback),
  onSessionState: (callback) =>
    subscribe('focusbuddy:session-state-changed', callback),
})

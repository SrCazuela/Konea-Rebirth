const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusBuddyDesktop', {
  platform: process.platform,
  retry: () => ipcRenderer.invoke('focusbuddy:retry'),
  updateSessionState: (state) =>
    ipcRenderer.send('focusbuddy:update-session-state', state),
})

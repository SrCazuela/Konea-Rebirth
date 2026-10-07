const { contextBridge, ipcRenderer } = require('electron')

async function invokeApi(operation, payload) {
  const result = await ipcRenderer.invoke('focusbuddy:api', operation, payload)
  if (result?.ok === true) return result.data

  const details = result?.error
  const error = new Error(
    typeof details?.message === 'string'
      ? details.message
      : 'FocusBuddy no pudo completar la solicitud.',
  )
  error.status = Number.isInteger(details?.status) ? details.status : 0
  error.code =
    typeof details?.code === 'string' ? details.code : 'DESKTOP_API_ERROR'
  if (details?.fields && typeof details.fields === 'object') {
    error.fields = details.fields
  }
  throw error
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, value) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = Object.freeze({
  health: () => invokeApi('health.get'),
  getCurrentUser: () => invokeApi('auth.me'),
  login: (input) => invokeApi('auth.login', input),
  logout: () => invokeApi('auth.logout'),
  getOverview: (input) =>
    invokeApi(
      'study.overview',
      typeof input === 'string' ? { timeZone: input } : input,
    ),
  getAcademic: () => invokeApi('academic.dashboard'),
  startSession: (input) => invokeApi('study.sessions.start', input),
  transitionSession: (input, action) =>
    invokeApi(
      'study.sessions.transition',
      typeof input === 'string' ? { sessionId: input, action } : input,
    ),
})

contextBridge.exposeInMainWorld(
  'focusBuddyDesktop',
  Object.freeze({
    platform: process.platform,
    api,
    getPreferences: () => ipcRenderer.invoke('focusbuddy:get-preferences'),
    updatePreferences: (patch) =>
      ipcRenderer.invoke('focusbuddy:update-preferences', patch),
    updateSessionState: (state) =>
      ipcRenderer.send('focusbuddy:update-session-state', state),
    getConnectionInfo: () =>
      ipcRenderer.invoke('focusbuddy:get-connection-info'),
    onPreferences: (callback) =>
      subscribe('focusbuddy:preferences-changed', callback),
  }),
)

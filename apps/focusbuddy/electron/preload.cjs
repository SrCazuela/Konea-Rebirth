const { contextBridge, ipcRenderer } = require('electron')

async function invokeApi(operation, payload) {
  let result
  try {
    result = await ipcRenderer.invoke('focusbuddy:api', operation, payload)
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        code: 'DESKTOP_IPC_ERROR',
        message: 'No se pudo comunicar con la aplicación de escritorio.',
      },
    }
  }
  // Error pierde sus propiedades adicionales al cruzar contextBridge. El renderer
  // reconstruye el error en su propio mundo a partir de este objeto serializable.
  if (result?.ok === true) return { ok: true, data: result.data }

  const details = result?.error
  const error = {
    message:
      typeof details?.message === 'string'
        ? details.message
        : 'FocusBuddy no pudo completar la solicitud.',
    status: Number.isInteger(details?.status) ? details.status : 0,
    code:
      typeof details?.code === 'string' ? details.code : 'DESKTOP_API_ERROR',
  }
  if (details?.fields && typeof details.fields === 'object') {
    error.fields = details.fields
  }
  return { ok: false, error }
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
  updateAccount: (input) => invokeApi('auth.account.update', input),
  changePassword: (input) => invokeApi('auth.password.change', input),
  getOverview: (input) =>
    invokeApi(
      'study.overview',
      typeof input === 'string' ? { timeZone: input } : input,
    ),
  getAcademic: () => invokeApi('academic.dashboard'),
  updateTaskStatus: (input, status) =>
    invokeApi(
      'academic.tasks.updateStatus',
      typeof input === 'string' ? { taskId: input, status } : input,
    ),
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

'use strict'

const bridge = window.focusBuddyDesktop
const api = bridge && typeof bridge === 'object' ? bridge.api : null

const METHODS = {
  pomodoro: {
    name: 'Pomodoro',
    focusMinutes: 25,
    breakMinutes: 5,
  },
  pomodoro_extended: {
    name: 'Pomodoro extendido',
    focusMinutes: 50,
    breakMinutes: 10,
  },
  deep_work: {
    name: 'Trabajo profundo',
    focusMinutes: 90,
    breakMinutes: 20,
  },
  flowtime: {
    name: 'Flowtime',
    focusMinutes: 0,
    breakMinutes: 0,
  },
  custom: {
    name: 'Personalizado',
    focusMinutes: 40,
    breakMinutes: 10,
  },
}

const STATUS_LABELS = {
  active: 'En curso',
  paused: 'En pausa',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

const DEFAULT_PREFERENCES = {
  companionEnabled: true,
  companionAlwaysOnTop: true,
  companionCharacter: 'kuco',
  companionScale: 'medium',
  compactMode: false,
  closeToTray: true,
  launchAtLogin: false,
  notificationsEnabled: false,
  reducedMotion: false,
  companionPosition: null,
}

const KUCO_SPRITE_SHEET = './owl-shimeji-provisional.png'
const KUCO_CARD_BLINK = Object.freeze({
  minDelayMs: 3_200,
  maxDelayMs: 6_400,
  closedMs: 115,
  betweenBlinksMs: 135,
  doubleBlinkChance: 0.16,
})

let kucoCardBlinkTimer = null
let kucoCardBlinkFrame = 0

const CHIBI_AVATAR_ASSETS = {
  idle: [
    './assets/avatar-cutout/idle-1.png',
    './assets/avatar-cutout/idle-2.png',
    './assets/avatar-cutout/idle-3.png',
  ],
  focus: [
    './assets/avatar-cutout/typing-1.png',
    './assets/avatar-cutout/typing-2.png',
    './assets/avatar-cutout/typing-3.png',
    './assets/avatar-cutout/typing-2.png',
    './assets/avatar-cutout/typing-blink.png',
  ],
  deepFocus: [
    './assets/avatar-cutout/typing-concentrated-1.png',
    './assets/avatar-cutout/typing-concentrated-2.png',
    './assets/avatar-cutout/typing-concentrated-3.png',
    './assets/avatar-cutout/studying-concentrated-1.png',
  ],
  paused: [
    './assets/avatar-cutout/studying-1.png',
    './assets/avatar-cutout/idle-2.png',
  ],
  completed: ['./assets/avatar-cutout/idle-1.png'],
  offline: ['./assets/avatar-cutout/idle-3.png'],
}

const PAGE_TITLES = {
  study: 'Tu espacio de concentración',
  progress: 'Tu progreso de estudio',
  settings: 'Personaliza FocusBuddy',
  account: 'Tu cuenta Konea',
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const state = {
  user: null,
  overview: null,
  overviewReady: false,
  courses: [],
  tasks: [],
  selectedMethod: 'pomodoro',
  customFocusMinutes: 40,
  customBreakMinutes: 10,
  courseId: '',
  taskId: '',
  preferences: { ...DEFAULT_PREFERENCES },
  connectionInfo: null,
  connectionState: 'checking',
  connectionLabel: 'Comprobando Konea…',
  currentTab: 'study',
  sessionSnapshotAt: Date.now(),
  now: Date.now(),
  justCompletedUntil: 0,
  pendingStart: null,
  actionBusy: false,
  heartbeatBusy: false,
  preferenceBusy: false,
  loadVersion: 0,
  sessionMutationVersion: 0,
  lastDesktopSnapshot: '',
  feedbackTimer: null,
  unsubscribePreferences: null,
}

function byId(id) {
  return document.getElementById(id)
}

const elements = {
  pageTitle: byId('page-title'),
  connectionPill: byId('connection-pill'),
  connectionLabel: byId('connection-label'),
  refreshButton: byId('refresh-button'),
  globalFeedback: byId('global-feedback'),
  startupOverlay: byId('startup-overlay'),
  startupLabel: byId('startup-label'),
  sidebarAvatar: byId('sidebar-avatar'),
  sidebarUserName: byId('sidebar-user-name'),
  sidebarUserHandle: byId('sidebar-user-handle'),
  sessionSetup: byId('session-setup'),
  sessionActive: byId('session-active'),
  sessionForm: byId('session-form'),
  customTimes: byId('custom-times'),
  customFocus: byId('custom-focus'),
  customBreak: byId('custom-break'),
  courseSelect: byId('course-select'),
  taskSelect: byId('task-select'),
  previewFocus: byId('preview-focus'),
  previewBreak: byId('preview-break'),
  startButton: byId('start-button'),
  startButtonLabel: byId('start-button-label'),
  activeKicker: byId('active-kicker'),
  activeTitle: byId('active-title'),
  activeStatus: byId('active-status'),
  timerBlock: byId('timer-block'),
  timerValue: byId('timer-value'),
  timerCaption: byId('timer-caption'),
  activeMethod: byId('active-method'),
  activeCourse: byId('active-course'),
  activeBreak: byId('active-break'),
  completionHint: byId('completion-hint'),
  pauseButton: byId('pause-button'),
  resumeButton: byId('resume-button'),
  completeButton: byId('complete-button'),
  cancelButton: byId('cancel-button'),
  buddyCard: document.querySelector('.buddy-card'),
  buddyImage: byId('buddy-image'),
  buddyChibi: byId('buddy-chibi'),
  buddyName: byId('buddy-name'),
  buddyCopy: byId('buddy-copy'),
  quickToday: byId('quick-today'),
  quickWeek: byId('quick-week'),
  quickStreak: byId('quick-streak'),
  quickBestStreak: byId('quick-best-streak'),
  progressRefresh: byId('progress-refresh'),
  metricToday: byId('metric-today'),
  metricWeek: byId('metric-week'),
  metricTotal: byId('metric-total'),
  metricSessions: byId('metric-sessions'),
  metricCompleted: byId('metric-completed'),
  metricStreak: byId('metric-streak'),
  metricBest: byId('metric-best'),
  weekTotal: byId('week-total'),
  weekChart: byId('week-chart'),
  courseChart: byId('course-chart'),
  historyList: byId('history-list'),
  progressUnavailable: byId('progress-unavailable'),
  settingsStatus: byId('settings-status'),
  connectionServer: byId('connection-server'),
  connectionEnvironment: byId('connection-environment'),
  connectionVersion: byId('connection-version'),
  loginCard: byId('login-card'),
  accountCard: byId('account-card'),
  loginForm: byId('login-form'),
  loginIdentifier: byId('login-identifier'),
  loginPassword: byId('login-password'),
  loginError: byId('login-error'),
  loginButton: byId('login-button'),
  logoutButton: byId('logout-button'),
  accountAvatar: byId('account-avatar'),
  accountName: byId('account-name'),
  accountHandle: byId('account-handle'),
  accountEmail: byId('account-email'),
  accountRole: byId('account-role'),
  accountSync: byId('account-sync'),
  accountCharacter: byId('account-character'),
  accountChibi: byId('account-chibi'),
}

function text(element, value) {
  if (!element) return
  element.textContent =
    value === null || value === undefined ? '' : String(value)
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function unwrap(value, key) {
  if (value && typeof value === 'object' && key in value) return value[key]
  return value
}

function errorStatus(error) {
  const candidate = Number(error && (error.status ?? error.statusCode))
  return Number.isFinite(candidate) ? candidate : null
}

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code.toUpperCase() : ''
}

function isUnauthorized(error) {
  const code = errorCode(error)
  return (
    errorStatus(error) === 401 ||
    code === 'UNAUTHORIZED' ||
    code === 'SESSION_EXPIRED' ||
    code === 'AUTH_REQUIRED' ||
    code === 'AUTHENTICATION_REQUIRED' ||
    code === 'INVALID_SESSION'
  )
}

function isConnectionError(error) {
  const status = errorStatus(error)
  const code = errorCode(error)
  if (code === 'INVALID_DESKTOP_API_INPUT') return false
  if (status === 0 || (status !== null && status >= 500)) return true
  if (
    code.includes('NETWORK') ||
    code.includes('OFFLINE') ||
    code.includes('TIMEOUT') ||
    code.includes('CONNECTION') ||
    code.includes('ECONN')
  ) {
    return true
  }
  return status === null
}

function isAmbiguousStartError(error) {
  const status = errorStatus(error)
  if (errorCode(error) === 'INVALID_DESKTOP_API_INPUT') return false
  return (
    status === null ||
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  )
}

function readableError(error, fallback = 'No pudimos completar la acción.') {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(finiteNumber(totalSeconds)))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(totalSeconds) {
  const minutes = Math.max(0, Math.round(finiteNumber(totalSeconds) / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}

function formatSessionDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return dateTimeFormatter.format(date)
}

function initials(user) {
  const source = String(user?.displayName || user?.username || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  )
}

function createClientRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function currentSession() {
  const candidate = state.overview?.activeSession
  if (!candidate || !['active', 'paused'].includes(candidate.status))
    return null
  return candidate
}

function elapsedSeconds(session) {
  if (!session) return 0
  const atSnapshot = Math.max(
    0,
    finiteNumber(
      session.effectiveFocusedSeconds ??
        session.accumulatedFocusedSeconds ??
        session.focusedSeconds,
    ),
  )
  if (session.status !== 'active') return atSnapshot
  return (
    atSnapshot +
    Math.max(0, Math.floor((state.now - state.sessionSnapshotAt) / 1000))
  )
}

function timerDetails(session) {
  if (!session) {
    return { value: 0, finished: false, flowtime: false }
  }
  const elapsed = elapsedSeconds(session)
  const flowtime = session.method === 'flowtime'
  const remaining = Math.max(
    0,
    finiteNumber(session.plannedDurationSeconds) - elapsed,
  )
  return {
    value: flowtime ? elapsed : remaining,
    finished: !flowtime && remaining === 0,
    flowtime,
  }
}

function methodDefinition() {
  return METHODS[state.selectedMethod] || METHODS.pomodoro
}

function selectedDurations() {
  const definition = methodDefinition()
  if (state.selectedMethod === 'custom') {
    return {
      focusMinutes: state.customFocusMinutes,
      breakMinutes: state.customBreakMinutes,
    }
  }
  return {
    focusMinutes: definition.focusMinutes,
    breakMinutes: definition.breakMinutes,
  }
}

async function callApi(name, ...args) {
  if (!api || typeof api[name] !== 'function') {
    const error = new Error(
      `La integración de escritorio no expone api.${name}.`,
    )
    error.code = 'DESKTOP_BRIDGE_UNAVAILABLE'
    throw error
  }
  const result = await api[name](...args)
  if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'ok')) {
    return result
  }
  if (result.ok === true) return result.data

  const payload =
    result.error && typeof result.error === 'object' ? result.error : {}
  const error = new Error(
    typeof payload.message === 'string'
      ? payload.message
      : 'Konea no pudo completar la solicitud.',
  )
  if (Number.isInteger(payload.status)) error.status = payload.status
  if (typeof payload.code === 'string') error.code = payload.code
  if (payload.fields && typeof payload.fields === 'object') {
    error.fields = payload.fields
  }
  throw error
}

function setConnection(connectionState, label) {
  state.connectionState = connectionState
  state.connectionLabel = label
  if (elements.connectionPill)
    elements.connectionPill.dataset.state = connectionState
  text(elements.connectionLabel, label)
  text(
    elements.accountSync,
    connectionState === 'online'
      ? 'Conectada'
      : connectionState === 'degraded'
        ? 'Con información parcial'
        : connectionState === 'checking'
          ? 'Comprobando'
          : 'Sin conexión',
  )
}

function showFeedback(message, tone = 'info', options = {}) {
  if (state.feedbackTimer) {
    window.clearTimeout(state.feedbackTimer)
    state.feedbackTimer = null
  }
  text(elements.globalFeedback, message)
  elements.globalFeedback.dataset.tone = tone
  elements.globalFeedback.hidden = !message
  if (message && options.temporary) {
    state.feedbackTimer = window.setTimeout(() => {
      elements.globalFeedback.hidden = true
      state.feedbackTimer = null
    }, options.duration || 6000)
  }
}

function desktopSnapshot(kind) {
  if (kind === 'offline') {
    return {
      status: 'offline',
      sessionId: null,
      title: 'Konea no está disponible',
      course: null,
      timerLabel: '--:--',
      timerFinished: false,
    }
  }

  const session = currentSession()
  if (!state.user || !session) {
    return {
      status: kind === 'completed' ? 'completed' : 'idle',
      sessionId: null,
      title: kind === 'completed' ? 'Sesión completada' : 'Listo para estudiar',
      course: null,
      timerLabel: '--:--',
      timerFinished: false,
    }
  }

  const timer = timerDetails(session)
  return {
    status: session.status,
    sessionId: typeof session.id === 'string' ? session.id : null,
    title: session.task?.title || session.course?.name || 'Sesión libre',
    course: session.course?.name || null,
    timerLabel: formatTimer(timer.value),
    timerFinished: timer.finished,
  }
}

function sendDesktopSnapshot(kind, force = false) {
  if (!bridge || typeof bridge.updateSessionState !== 'function') return
  const snapshot = desktopSnapshot(kind)
  const serialized = JSON.stringify(snapshot)
  if (!force && serialized === state.lastDesktopSnapshot) return
  state.lastDesktopSnapshot = serialized
  try {
    const result = bridge.updateSessionState(snapshot)
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    // A renderer without the expected preload remains usable in its own window.
  }
}

function markOffline(message) {
  state.overviewReady = false
  setConnection('offline', 'Konea sin conexión')
  sendDesktopSnapshot('offline', true)
  if (message) showFeedback(message, 'error')
  renderSession()
}

function clearSensitiveSession(options = {}) {
  state.user = null
  state.overview = null
  state.overviewReady = false
  state.courses = []
  state.tasks = []
  state.courseId = ''
  state.taskId = ''
  state.pendingStart = null
  state.justCompletedUntil = 0
  state.loadVersion += 1
  state.sessionMutationVersion += 1
  renderAccount()
  renderAcademicOptions()
  renderSession()
  renderProgress()
  sendDesktopSnapshot('idle', true)
  if (options.selectAccount !== false)
    selectTab('account', { allowUnauthenticated: true })
}

function expireSession() {
  clearSensitiveSession()
  setConnection('online', 'Sesión expirada')
  showFeedback(
    'Tu sesión de Konea expiró. Ingresa nuevamente para continuar.',
    'warning',
  )
}

function handleApiFailure(error, scope) {
  if (isUnauthorized(error)) {
    expireSession()
    return
  }
  if (scope === 'academic') {
    setConnection('degraded', 'Datos académicos pendientes')
    showFeedback(
      `No pudimos actualizar materias y tareas: ${readableError(error)}`,
      'warning',
    )
    return
  }
  if (isConnectionError(error) || scope === 'overview' || scope === 'health') {
    markOffline(`No pudimos conectar con Konea: ${readableError(error)}`)
    return
  }
  showFeedback(readableError(error), 'error')
}

function selectTab(tabName, options = {}) {
  const requested = PAGE_TITLES[tabName] ? tabName : 'study'
  const requiresAccount = requested === 'study' || requested === 'progress'
  const next =
    !state.user && requiresAccount && !options.allowUnauthenticated
      ? 'account'
      : requested
  state.currentTab = next

  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === next
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
    button.tabIndex = active ? 0 : -1
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== next
  }
  text(elements.pageTitle, PAGE_TITLES[next])

  if (next !== requested) {
    showFeedback(
      'Inicia sesión con tu cuenta Konea para abrir ese espacio.',
      'warning',
    )
  }
  if (next === 'progress') renderProgress()
  if (next === 'settings') renderPreferences()
  if (next === 'account') renderAccount()
  syncKucoCardBlink()
}

function renderAccount() {
  const user = state.user
  elements.loginCard.hidden = Boolean(user)
  elements.accountCard.hidden = !user

  if (!user) {
    text(elements.sidebarAvatar, '?')
    text(elements.sidebarUserName, 'Sin sesión')
    text(elements.sidebarUserHandle, 'Inicia sesión para estudiar')
    return
  }

  const displayName = user.displayName || user.username || 'Estudiante Konea'
  const username = user.username ? `@${user.username}` : 'Cuenta Konea'
  const userInitials = initials(user)
  text(elements.sidebarAvatar, userInitials)
  text(elements.sidebarUserName, displayName)
  text(elements.sidebarUserHandle, username)
  text(elements.accountAvatar, userInitials)
  text(elements.accountName, displayName)
  text(elements.accountHandle, username)
  text(elements.accountEmail, user.email || 'No disponible')
  text(elements.accountRole, roleLabel(user.role))
}

function roleLabel(role) {
  if (role === 'admin') return 'Administración'
  if (role === 'moderator') return 'Moderación'
  return 'Estudiante'
}

function activeCourses() {
  return state.courses.filter((course) => course && course.active !== false)
}

function availableTasks() {
  const activeIds = new Set(activeCourses().map((course) => course.id))
  return state.tasks.filter(
    (task) =>
      task &&
      task.status !== 'completed' &&
      (!task.courseId || activeIds.has(task.courseId)) &&
      (!state.courseId || !task.courseId || task.courseId === state.courseId),
  )
}

function createOption(value, label) {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  return option
}

function renderAcademicOptions() {
  const courseOptions = [createOption('', 'Sesión libre')]
  for (const course of activeCourses()) {
    const suffix = course.section ? ` · ${course.section}` : ''
    courseOptions.push(
      createOption(course.id, `${course.name || 'Asignatura'}${suffix}`),
    )
  }
  elements.courseSelect.replaceChildren(...courseOptions)
  if (activeCourses().some((course) => course.id === state.courseId)) {
    elements.courseSelect.value = state.courseId
  } else {
    state.courseId = ''
    elements.courseSelect.value = ''
  }

  const taskOptions = [createOption('', 'Sin tarea vinculada')]
  const filteredTasks = availableTasks()
  for (const task of filteredTasks) {
    taskOptions.push(createOption(task.id, task.title || 'Tarea sin título'))
  }
  elements.taskSelect.replaceChildren(...taskOptions)
  if (filteredTasks.some((task) => task.id === state.taskId)) {
    elements.taskSelect.value = state.taskId
  } else {
    state.taskId = ''
    elements.taskSelect.value = ''
  }

  const academicAvailable = state.courses.length > 0 || state.tasks.length > 0
  elements.courseSelect.disabled = state.actionBusy || !state.user
  elements.taskSelect.disabled = state.actionBusy || !state.user
  elements.courseSelect.title = academicAvailable
    ? ''
    : 'No hay materias activas'
  elements.taskSelect.title = academicAvailable
    ? ''
    : 'No hay tareas pendientes'
}

function renderMethodPreview() {
  const durations = selectedDurations()
  elements.customTimes.hidden = state.selectedMethod !== 'custom'
  if (state.selectedMethod === 'flowtime') {
    text(elements.previewFocus, 'Sin límite de tiempo')
    text(elements.previewBreak, 'Finaliza cuando pierdas el estado de flujo')
  } else {
    text(
      elements.previewFocus,
      Number.isFinite(durations.focusMinutes)
        ? `${durations.focusMinutes} min de enfoque`
        : 'Define la duración del enfoque',
    )
    text(
      elements.previewBreak,
      !Number.isFinite(durations.breakMinutes)
        ? 'Define la duración de la pausa'
        : durations.breakMinutes > 0
          ? `${durations.breakMinutes} min de pausa sugerida`
          : 'Sin pausa programada',
    )
  }
}

function renderSession() {
  const session = currentSession()
  elements.sessionSetup.hidden = Boolean(session)
  elements.sessionActive.hidden = !session

  if (!session) {
    renderMethodPreview()
    const canStart =
      Boolean(state.user) &&
      state.overviewReady &&
      state.connectionState !== 'offline' &&
      !state.actionBusy
    elements.startButton.disabled = !canStart
    text(
      elements.startButtonLabel,
      state.actionBusy
        ? 'Iniciando…'
        : !state.user
          ? 'Inicia sesión para comenzar'
          : !state.overviewReady
            ? 'Comprueba tu sesión para comenzar'
            : 'Comenzar sesión',
    )
    renderAvatar()
    if (state.connectionState === 'offline') sendDesktopSnapshot('offline')
    else if (Date.now() < state.justCompletedUntil)
      sendDesktopSnapshot('completed')
    else sendDesktopSnapshot('idle')
    return
  }

  const timer = timerDetails(session)
  const paused = session.status === 'paused'
  text(
    elements.activeKicker,
    paused
      ? 'Sesión en pausa'
      : timer.finished
        ? 'Bloque cumplido'
        : 'Concentración en curso',
  )
  text(
    elements.activeTitle,
    session.task?.title || session.course?.name || 'Sesión libre',
  )
  text(elements.activeStatus, STATUS_LABELS[session.status] || 'En curso')
  elements.activeStatus.dataset.state = session.status
  text(elements.timerValue, formatTimer(timer.value))
  text(
    elements.timerCaption,
    timer.flowtime
      ? 'tiempo concentrado'
      : timer.finished
        ? 'objetivo alcanzado'
        : 'tiempo restante',
  )
  elements.timerBlock.classList.toggle('is-finished', timer.finished)
  elements.timerBlock.setAttribute(
    'aria-label',
    timer.flowtime
      ? `${formatDuration(timer.value)} transcurridos`
      : `${formatDuration(timer.value)} restantes`,
  )
  text(
    elements.activeMethod,
    METHODS[session.method]?.name || 'Método de estudio',
  )
  text(elements.activeCourse, session.course?.name || 'Sin asignatura')
  const breakSeconds = Math.max(0, finiteNumber(session.breakDurationSeconds))
  text(
    elements.activeBreak,
    breakSeconds > 0
      ? `Pausa sugerida: ${formatDuration(breakSeconds)}`
      : 'Sin pausa sugerida',
  )
  elements.activeBreak.hidden = breakSeconds === 0
  elements.completionHint.hidden = !timer.finished || paused
  elements.pauseButton.hidden = paused
  elements.resumeButton.hidden = !paused

  const disableControls =
    state.actionBusy || state.connectionState === 'offline'
  for (const control of [
    elements.pauseButton,
    elements.resumeButton,
    elements.completeButton,
    elements.cancelButton,
  ]) {
    control.disabled = disableControls
  }

  renderAvatar()
  if (state.connectionState === 'offline') sendDesktopSnapshot('offline')
  else sendDesktopSnapshot()
}

function avatarMood() {
  if (state.connectionState === 'offline') return 'offline'
  if (Date.now() < state.justCompletedUntil) return 'completed'
  const session = currentSession()
  if (session?.status === 'active') return 'focus'
  if (session?.status === 'paused') return 'paused'
  return 'idle'
}

function selectedCharacter() {
  return state.preferences.companionCharacter === 'chibi' ? 'chibi' : 'kuco'
}

function chibiSequence(mood, session) {
  if (
    mood === 'focus' &&
    ['deep_work', 'pomodoro_extended'].includes(session?.method)
  ) {
    return CHIBI_AVATAR_ASSETS.deepFocus
  }
  return CHIBI_AVATAR_ASSETS[mood] || CHIBI_AVATAR_ASSETS.idle
}

function canBlinkKucoCard() {
  return (
    state.currentTab === 'study' &&
    selectedCharacter() === 'kuco' &&
    !state.preferences.reducedMotion &&
    document.visibilityState !== 'hidden'
  )
}

function clearKucoCardBlinkTimer() {
  if (kucoCardBlinkTimer !== null) {
    window.clearTimeout(kucoCardBlinkTimer)
    kucoCardBlinkTimer = null
  }
}

function nextKucoBlinkDelay() {
  const range = KUCO_CARD_BLINK.maxDelayMs - KUCO_CARD_BLINK.minDelayMs
  return KUCO_CARD_BLINK.minDelayMs + Math.round(Math.random() * range)
}

function scheduleKucoCardBlink(delay = nextKucoBlinkDelay()) {
  clearKucoCardBlinkTimer()
  if (!canBlinkKucoCard()) return

  kucoCardBlinkTimer = window.setTimeout(() => {
    kucoCardBlinkTimer = null
    const blinkCount = Math.random() < KUCO_CARD_BLINK.doubleBlinkChance ? 2 : 1
    runKucoCardBlink(blinkCount)
  }, delay)
}

function runKucoCardBlink(remainingBlinks) {
  if (!canBlinkKucoCard()) {
    kucoCardBlinkFrame = 0
    renderAvatar()
    return
  }

  kucoCardBlinkFrame = 1
  renderAvatar()
  kucoCardBlinkTimer = window.setTimeout(() => {
    kucoCardBlinkTimer = null
    kucoCardBlinkFrame = 0
    renderAvatar()

    if (!canBlinkKucoCard()) return
    if (remainingBlinks > 1) {
      kucoCardBlinkTimer = window.setTimeout(() => {
        kucoCardBlinkTimer = null
        runKucoCardBlink(remainingBlinks - 1)
      }, KUCO_CARD_BLINK.betweenBlinksMs)
      return
    }
    scheduleKucoCardBlink()
  }, KUCO_CARD_BLINK.closedMs)
}

function syncKucoCardBlink() {
  clearKucoCardBlinkTimer()
  kucoCardBlinkFrame = 0
  renderAvatar()
  scheduleKucoCardBlink()
}

function applyCharacterFrame(
  container,
  chibiImage,
  { character, mood, frameIndex, chibiSource, label },
) {
  if (!container) return
  container.dataset.character = character
  container.dataset.mood = mood
  container.dataset.frame = String(frameIndex % 4)
  if (label) container.setAttribute('aria-label', label)
  if (
    character === 'chibi' &&
    chibiImage &&
    chibiSource &&
    chibiImage.getAttribute('src') !== chibiSource
  ) {
    chibiImage.setAttribute('src', chibiSource)
  }
}

function renderAvatar() {
  const mood = avatarMood()
  const session = currentSession()
  const reduced = state.preferences.reducedMotion
  const character = selectedCharacter()
  const sequence = chibiSequence(mood, session)
  const frameIndex = reduced
    ? 0
    : Math.floor(Date.now() / 900) % sequence.length
  const source = sequence[frameIndex % sequence.length]
  elements.buddyCard.dataset.mood = mood

  const presentation = {
    idle: ['Estoy listo cuando tú lo estés.', 'está disponible y esperando'],
    focus: ['Modo concentración activado.', 'estudia durante la sesión activa'],
    paused: ['Respira. Retomamos cuando quieras.', 'descansa durante la pausa'],
    completed: [
      '¡Buen trabajo! Sumaste una nueva sesión.',
      'celebra la sesión completada',
    ],
    offline: [
      'No encuentro Konea. Tu bloque no se modificará.',
      'espera a que vuelva la conexión',
    ],
  }[mood]
  const characterName = character === 'kuco' ? 'Kuco' : 'FocusBuddy'

  applyCharacterFrame(elements.buddyImage, elements.buddyChibi, {
    character,
    mood: character === 'kuco' ? 'idle' : mood,
    frameIndex: character === 'kuco' ? kucoCardBlinkFrame : frameIndex,
    chibiSource: source,
    label: `${characterName} ${presentation[1]}`,
  })

  const idleSequence = CHIBI_AVATAR_ASSETS.idle
  const accountFrame = reduced ? 0 : Math.floor(Date.now() / 1_450) % 4
  applyCharacterFrame(elements.accountCharacter, elements.accountChibi, {
    character,
    mood: 'idle',
    frameIndex: accountFrame,
    chibiSource: idleSequence[accountFrame % idleSequence.length],
  })

  text(elements.buddyName, characterName)
  text(elements.buddyCopy, presentation[0])
}

function renderQuickMetrics() {
  const stats = state.overview?.stats
  if (!stats) {
    for (const element of [
      elements.quickToday,
      elements.quickWeek,
      elements.quickStreak,
    ]) {
      text(element, '—')
    }
    text(elements.quickBestStreak, 'Mejor: —')
    return
  }
  text(elements.quickToday, formatDuration(stats.todayFocusedSeconds))
  text(elements.quickWeek, formatDuration(stats.weekFocusedSeconds))
  text(elements.quickStreak, `${finiteNumber(stats.currentStreakDays)} días`)
  text(
    elements.quickBestStreak,
    `Mejor: ${finiteNumber(stats.bestStreakDays)} días`,
  )
}

function emptyState(message) {
  const element = document.createElement('p')
  element.className = 'empty-state'
  element.textContent = message
  return element
}

function renderWeekChart(days) {
  elements.weekChart.replaceChildren()
  if (!days.length) {
    elements.weekChart.replaceChildren(
      emptyState('Completa tu primera sesión para visualizar tu ritmo.'),
    )
    return
  }
  const maxSeconds = Math.max(
    1,
    ...days.map((day) => finiteNumber(day.focusedSeconds)),
  )
  const rows = []
  for (const day of days.slice(0, 7)) {
    const seconds = Math.max(0, finiteNumber(day.focusedSeconds))
    const height = Math.max(
      seconds > 0 ? 8 : 2,
      Math.round((seconds / maxSeconds) * 100),
    )
    const date = new Date(`${day.date}T12:00:00`)
    const weekday = Number.isNaN(date.getTime())
      ? 'día'
      : date.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const weekdayLong = Number.isNaN(date.getTime())
      ? 'Día'
      : date.toLocaleDateString('es-CL', { weekday: 'long' })
    const row = document.createElement('div')
    row.className = 'week-bar'
    row.setAttribute(
      'aria-label',
      `${weekdayLong}: ${formatDuration(seconds)}, ${finiteNumber(day.sessions)} sesiones`,
    )
    const value = document.createElement('strong')
    value.textContent = seconds > 0 ? String(Math.round(seconds / 60)) : '–'
    const bar = document.createElement('i')
    bar.setAttribute('aria-hidden', 'true')
    bar.style.setProperty('--bar-height', `${height}%`)
    const label = document.createElement('span')
    label.textContent = weekday
    row.append(value, bar, label)
    rows.push(row)
  }
  elements.weekChart.replaceChildren(...rows)
}

function renderCourseChart(courses) {
  elements.courseChart.replaceChildren()
  if (!courses.length) {
    elements.courseChart.replaceChildren(
      emptyState('Vincula una asignatura para comparar el tiempo de estudio.'),
    )
    return
  }
  const selected = courses.slice(0, 6)
  const maxSeconds = Math.max(
    1,
    ...selected.map((course) => finiteNumber(course.focusedSeconds)),
  )
  const rows = []
  for (const course of selected) {
    const seconds = Math.max(0, finiteNumber(course.focusedSeconds))
    const width = Math.max(3, Math.round((seconds / maxSeconds) * 100))
    const row = document.createElement('div')
    row.className = 'course-row'
    const heading = document.createElement('p')
    const name = document.createElement('strong')
    name.textContent = course.courseName || 'Sin asignatura'
    const duration = document.createElement('span')
    duration.textContent = formatDuration(seconds)
    heading.append(name, duration)
    const track = document.createElement('span')
    track.className = 'course-track'
    const bar = document.createElement('i')
    bar.setAttribute('aria-hidden', 'true')
    bar.style.setProperty('--bar-width', `${width}%`)
    track.append(bar)
    const sessions = document.createElement('small')
    const count = finiteNumber(course.sessions)
    sessions.textContent = `${count} ${count === 1 ? 'sesión' : 'sesiones'}`
    row.append(heading, track, sessions)
    rows.push(row)
  }
  elements.courseChart.replaceChildren(...rows)
}

function renderHistory(sessions) {
  elements.historyList.replaceChildren()
  if (!sessions.length) {
    elements.historyList.replaceChildren(
      emptyState('Aún no tienes sesiones registradas.'),
    )
    return
  }
  const rows = []
  for (const session of sessions.slice(0, 8)) {
    const row = document.createElement('div')
    row.className = 'history-row'
    const mark = document.createElement('span')
    mark.className = 'history-mark'
    mark.dataset.state = session.status || 'unknown'
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = session.status === 'completed' ? '✓' : '•'

    const copy = document.createElement('div')
    copy.className = 'history-copy'
    const title = document.createElement('strong')
    title.textContent =
      session.task?.title || session.course?.name || 'Sin asignatura'
    const detail = document.createElement('small')
    detail.textContent = `${METHODS[session.method]?.name || 'Sesión'} · ${formatSessionDate(session.startedAt)}`
    copy.append(title, detail)

    const duration = document.createElement('span')
    duration.className = 'history-duration'
    duration.textContent = formatDuration(session.effectiveFocusedSeconds)
    const status = document.createElement('small')
    status.className = 'history-status'
    status.textContent = STATUS_LABELS[session.status] || 'Registrada'
    row.append(mark, copy, duration, status)
    rows.push(row)
  }
  elements.historyList.replaceChildren(...rows)
}

function renderProgress() {
  const overview = state.overview
  const stats = overview?.stats
  elements.progressUnavailable.hidden = Boolean(overview)
  if (!overview || !stats) {
    for (const element of [
      elements.metricToday,
      elements.metricWeek,
      elements.metricTotal,
      elements.metricSessions,
      elements.metricStreak,
      elements.weekTotal,
    ]) {
      text(element, '—')
    }
    text(elements.metricCompleted, '— completadas')
    text(elements.metricBest, 'Mejor: —')
    renderWeekChart([])
    renderCourseChart([])
    renderHistory([])
    return
  }

  text(elements.metricToday, formatDuration(stats.todayFocusedSeconds))
  text(elements.metricWeek, formatDuration(stats.weekFocusedSeconds))
  text(elements.metricTotal, formatDuration(stats.totalFocusedSeconds))
  text(elements.metricSessions, finiteNumber(stats.totalSessions))
  text(
    elements.metricCompleted,
    `${finiteNumber(stats.completedSessions)} completadas`,
  )
  text(elements.metricStreak, `${finiteNumber(stats.currentStreakDays)} días`)
  text(elements.metricBest, `Mejor: ${finiteNumber(stats.bestStreakDays)} días`)
  text(elements.weekTotal, formatDuration(stats.weekFocusedSeconds))
  renderWeekChart(asArray(overview.byDay))
  renderCourseChart(asArray(overview.byCourse))
  renderHistory(asArray(overview.recentSessions))
}

function normalizePreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  const normalized = { ...DEFAULT_PREFERENCES }
  for (const key of [
    'companionEnabled',
    'companionAlwaysOnTop',
    'compactMode',
    'closeToTray',
    'launchAtLogin',
    'notificationsEnabled',
    'reducedMotion',
  ]) {
    if (typeof source[key] === 'boolean') normalized[key] = source[key]
  }
  if (['small', 'medium', 'large'].includes(source.companionScale)) {
    normalized.companionScale = source.companionScale
  }
  if (['kuco', 'chibi'].includes(source.companionCharacter)) {
    normalized.companionCharacter = source.companionCharacter
  }
  if (
    source.companionPosition &&
    typeof source.companionPosition === 'object'
  ) {
    normalized.companionPosition = source.companionPosition
  }
  return normalized
}

function renderPreferences() {
  for (const control of document.querySelectorAll('[data-preference]')) {
    const key = control.dataset.preference
    if (!(key in state.preferences)) continue
    if (control.type === 'checkbox')
      control.checked = Boolean(state.preferences[key])
    else control.value = String(state.preferences[key])
    control.disabled = state.preferenceBusy
  }
  document.body.classList.toggle(
    'reduce-motion',
    state.preferences.reducedMotion,
  )

  const info = state.connectionInfo || {}
  text(
    elements.connectionServer,
    info.apiBaseUrl ||
      info.appUrl ||
      info.url ||
      info.origin ||
      info.server ||
      'Configurado por Konea',
  )
  text(
    elements.connectionEnvironment,
    info.environment ||
      info.mode ||
      (info.isPackaged === false ? 'Desarrollo' : 'Aplicación instalada'),
  )
  text(
    elements.connectionVersion,
    info.version || info.appVersion || 'No disponible',
  )
}

function renderAll() {
  renderAccount()
  renderAcademicOptions()
  renderSession()
  renderQuickMetrics()
  renderProgress()
  renderPreferences()
}

function upsertRecent(session) {
  if (!state.overview || !session) return
  state.overview.recentSessions = [
    session,
    ...asArray(state.overview.recentSessions).filter(
      (item) => item.id !== session.id,
    ),
  ].slice(0, 8)
}

function applySessionUpdate(session) {
  if (!state.overview || !session) return
  state.overview.activeSession = ['active', 'paused'].includes(session.status)
    ? session
    : null
  upsertRecent(session)
  state.sessionSnapshotAt = Date.now()
  state.now = Date.now()
  state.overviewReady = true
}

async function loadPreferences() {
  if (!bridge || typeof bridge.getPreferences !== 'function') return
  try {
    state.preferences = normalizePreferences(await bridge.getPreferences())
  } catch (error) {
    text(
      elements.settingsStatus,
      `No se pudieron leer los ajustes: ${readableError(error)}`,
    )
  }
}

async function loadConnectionInfo() {
  if (!bridge || typeof bridge.getConnectionInfo !== 'function') return
  try {
    const result = await bridge.getConnectionInfo()
    state.connectionInfo = result && typeof result === 'object' ? result : null
  } catch {
    state.connectionInfo = null
  }
}

async function loadAuthenticatedData(options = {}) {
  if (!state.user) return
  const requestVersion = ++state.loadVersion
  elements.refreshButton.disabled = true
  elements.progressRefresh.disabled = true
  if (!options.silent) setConnection('checking', 'Sincronizando progreso…')

  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago'
  const [overviewResult, academicResult] = await Promise.allSettled([
    callApi('getOverview', timeZone),
    callApi('getAcademic'),
  ])
  if (requestVersion !== state.loadVersion) return

  if (overviewResult.status === 'fulfilled') {
    const overview = unwrap(overviewResult.value, 'overview')
    if (overview && typeof overview === 'object') {
      state.overview = overview
      state.overviewReady = true
      state.sessionSnapshotAt = Date.now()
      state.now = Date.now()
      if (currentSession()) state.pendingStart = null
      setConnection('online', 'Progreso sincronizado')
    } else {
      handleApiFailure(
        new Error('Konea devolvió un resumen vacío.'),
        'overview',
      )
    }
  } else {
    handleApiFailure(overviewResult.reason, 'overview')
  }

  if (academicResult.status === 'fulfilled') {
    const academic =
      unwrap(academicResult.value, 'academic') || academicResult.value || {}
    state.courses = asArray(academic.courses)
    state.tasks = asArray(academic.tasks)
  } else if (isUnauthorized(academicResult.reason)) {
    expireSession()
  } else if (state.connectionState !== 'offline') {
    handleApiFailure(academicResult.reason, 'academic')
  }

  elements.refreshButton.disabled = false
  elements.progressRefresh.disabled = false
  renderAll()
}

async function refreshEverything(options = {}) {
  if (!state.user) {
    selectTab('account', { allowUnauthenticated: true })
    return
  }
  try {
    await callApi('health')
    await loadAuthenticatedData(options)
  } catch (error) {
    handleApiFailure(error, 'health')
  } finally {
    elements.refreshButton.disabled = false
    elements.progressRefresh.disabled = false
    renderAll()
  }
}

function startFingerprint(input) {
  return JSON.stringify({
    method: input.method,
    courseId: input.courseId,
    taskId: input.taskId,
    plannedDurationSeconds: input.plannedDurationSeconds,
    breakDurationSeconds: input.breakDurationSeconds,
  })
}

function validateStartInput() {
  const durations = selectedDurations()
  if (
    state.selectedMethod !== 'flowtime' &&
    (!Number.isFinite(durations.focusMinutes) ||
      !Number.isInteger(durations.focusMinutes) ||
      durations.focusMinutes < 1 ||
      durations.focusMinutes > 240)
  ) {
    throw new Error(
      'El bloque de concentración debe durar entre 1 y 240 minutos.',
    )
  }
  if (
    !Number.isFinite(durations.breakMinutes) ||
    !Number.isInteger(durations.breakMinutes) ||
    durations.breakMinutes < 0 ||
    durations.breakMinutes > 120
  ) {
    throw new Error('La pausa debe durar entre 0 y 120 minutos.')
  }
  return {
    method: state.selectedMethod,
    courseId: state.courseId || null,
    taskId: state.taskId || null,
    plannedDurationSeconds:
      state.selectedMethod === 'flowtime'
        ? 0
        : Math.round(durations.focusMinutes * 60),
    breakDurationSeconds: Math.round(durations.breakMinutes * 60),
  }
}

async function startSession(event) {
  event.preventDefault()
  if (state.actionBusy || currentSession()) return
  if (!state.user || !state.overviewReady) {
    showFeedback(
      'Primero debemos comprobar tu sesión actual con Konea.',
      'warning',
    )
    return
  }

  let draft
  try {
    draft = validateStartInput()
  } catch (error) {
    showFeedback(readableError(error), 'error')
    return
  }

  const fingerprint = startFingerprint(draft)
  if (!state.pendingStart || state.pendingStart.fingerprint !== fingerprint) {
    state.pendingStart = {
      fingerprint,
      clientRequestId: createClientRequestId(),
    }
  }

  const request = {
    ...draft,
    clientRequestId: state.pendingStart.clientRequestId,
  }
  state.actionBusy = true
  state.sessionMutationVersion += 1
  state.loadVersion += 1
  renderAll()

  try {
    const result = await callApi('startSession', request)
    const session = unwrap(result, 'session')
    if (!session || typeof session !== 'object') {
      throw new Error('Konea no devolvió la sesión iniciada.')
    }
    state.pendingStart = null
    applySessionUpdate(session)
    setConnection('online', 'Progreso sincronizado')
    showFeedback(
      'Sesión iniciada. Tu avance se sincronizará con Konea.',
      'success',
      {
        temporary: true,
      },
    )
  } catch (error) {
    if (isUnauthorized(error)) {
      expireSession()
    } else if (errorStatus(error) === 409) {
      await loadAuthenticatedData({ silent: true })
      if (currentSession()) {
        state.pendingStart = null
        showFeedback('Recuperamos la sesión que ya estaba activa.', 'success', {
          temporary: true,
        })
      } else {
        state.pendingStart = null
        showFeedback(readableError(error), 'error')
      }
    } else if (isAmbiguousStartError(error)) {
      if (isConnectionError(error))
        markOffline('Se perdió la respuesta de Konea.')
      showFeedback(
        'No sabemos si Konea recibió el inicio. Reintenta sin cambiar los datos: usaremos el mismo identificador para evitar duplicados.',
        'warning',
      )
    } else {
      state.pendingStart = null
      showFeedback(readableError(error), 'error')
    }
  } finally {
    state.actionBusy = false
    renderAll()
  }
}

async function transitionSession(action) {
  const session = currentSession()
  if (!session || state.actionBusy) return
  if (
    action === 'cancel' &&
    !window.confirm(
      '¿Cancelar esta sesión? El tiempo acumulado no se sumará a tus estadísticas.',
    )
  ) {
    return
  }

  state.actionBusy = true
  state.sessionMutationVersion += 1
  state.loadVersion += 1
  renderSession()
  try {
    const result = await callApi('transitionSession', session.id, action)
    const updated = unwrap(result, 'session')
    if (!updated || typeof updated !== 'object') {
      throw new Error('Konea no devolvió el estado actualizado.')
    }
    applySessionUpdate(updated)
    setConnection('online', 'Progreso sincronizado')
    if (action === 'complete' || action === 'cancel') {
      state.overview.activeSession = null
      if (action === 'complete') state.justCompletedUntil = Date.now() + 6000
      showFeedback(
        action === 'complete'
          ? `Sesión guardada: ${formatDuration(updated.effectiveFocusedSeconds)} de concentración.`
          : 'La sesión fue cancelada.',
        action === 'complete' ? 'success' : 'info',
        { temporary: true },
      )
      renderAll()
      sendDesktopSnapshot(action === 'complete' ? 'completed' : 'idle', true)
      void loadAuthenticatedData({ silent: true })
    } else {
      showFeedback(
        action === 'pause' ? 'Sesión pausada.' : 'Sesión reanudada.',
        'success',
        {
          temporary: true,
        },
      )
    }
  } catch (error) {
    if (isUnauthorized(error)) expireSession()
    else if (isConnectionError(error)) markOffline(readableError(error))
    else showFeedback(readableError(error), 'error')
  } finally {
    state.actionBusy = false
    renderAll()
  }
}

async function heartbeat() {
  const session = currentSession()
  if (
    !session ||
    session.status !== 'active' ||
    state.actionBusy ||
    state.heartbeatBusy
  )
    return
  const version = state.sessionMutationVersion
  const sessionId = session.id
  state.heartbeatBusy = true
  try {
    const result = await callApi('transitionSession', sessionId, 'heartbeat')
    if (
      version !== state.sessionMutationVersion ||
      currentSession()?.id !== sessionId
    )
      return
    const updated = unwrap(result, 'session')
    if (!updated || typeof updated !== 'object') return
    applySessionUpdate(updated)
    setConnection('online', 'Progreso sincronizado')
    if (updated.status === 'paused') {
      showFeedback(
        'La sesión se pausó automáticamente porque FocusBuddy perdió conexión. Puedes reanudarla cuando quieras.',
        'warning',
      )
    }
    renderAll()
  } catch (error) {
    if (version !== state.sessionMutationVersion) return
    if (isUnauthorized(error)) expireSession()
    else
      markOffline(`No pudimos sincronizar el bloque: ${readableError(error)}`)
  } finally {
    state.heartbeatBusy = false
  }
}

async function login(event) {
  event.preventDefault()
  const identifier = elements.loginIdentifier.value.trim()
  const password = elements.loginPassword.value
  elements.loginError.hidden = true
  if (!identifier || !password) {
    text(elements.loginError, 'Ingresa tu correo o usuario y tu contraseña.')
    elements.loginError.hidden = false
    return
  }

  elements.loginButton.disabled = true
  text(elements.loginButton, 'Ingresando…')
  try {
    const result = await callApi('login', { identifier, password })
    const user = unwrap(result, 'user')
    if (!user || typeof user !== 'object')
      throw new Error('Konea no devolvió la cuenta autenticada.')
    state.user = user
    elements.loginPassword.value = ''
    renderAccount()
    await loadAuthenticatedData()
    selectTab('study')
    showFeedback('Cuenta conectada. Bienvenido a FocusBuddy.', 'success', {
      temporary: true,
    })
  } catch (error) {
    text(
      elements.loginError,
      readableError(error, 'No pudimos ingresar a Konea.'),
    )
    elements.loginError.hidden = false
    if (isConnectionError(error)) {
      setConnection('offline', 'Konea sin conexión')
      sendDesktopSnapshot('offline', true)
    }
  } finally {
    elements.loginButton.disabled = false
    text(elements.loginButton, 'Ingresar a Konea')
  }
}

async function logout() {
  if (state.actionBusy) return
  state.actionBusy = true
  clearSensitiveSession({ selectAccount: true })
  showFeedback('Cerrando tu sesión de Konea…', 'info')
  try {
    await callApi('logout')
    setConnection('online', 'Conectado a Konea')
    showFeedback('Sesión cerrada en este equipo.', 'success', {
      temporary: true,
    })
  } catch (error) {
    if (isConnectionError(error)) {
      setConnection('offline', 'Konea sin conexión')
      sendDesktopSnapshot('idle', true)
      showFeedback(
        'La vista local quedó protegida, pero Konea no confirmó el cierre remoto. Reintenta al recuperar conexión.',
        'warning',
      )
    } else {
      showFeedback(readableError(error), 'error')
    }
  } finally {
    state.actionBusy = false
  }
}

async function updatePreference(control) {
  if (
    !bridge ||
    typeof bridge.updatePreferences !== 'function' ||
    state.preferenceBusy
  ) {
    text(
      elements.settingsStatus,
      'La integración de escritorio no permite cambiar preferencias.',
    )
    renderPreferences()
    return
  }
  const key = control.dataset.preference
  const value = control.type === 'checkbox' ? control.checked : control.value
  const previous = { ...state.preferences }
  state.preferences = normalizePreferences({
    ...state.preferences,
    [key]: value,
  })
  state.preferenceBusy = true
  renderPreferences()
  text(elements.settingsStatus, 'Guardando ajuste…')
  try {
    const result = await bridge.updatePreferences({ [key]: value })
    if (result && typeof result === 'object')
      state.preferences = normalizePreferences(result)
    text(elements.settingsStatus, 'Ajuste guardado en este equipo.')
  } catch (error) {
    state.preferences = previous
    text(elements.settingsStatus, `No se pudo guardar: ${readableError(error)}`)
  } finally {
    state.preferenceBusy = false
    renderPreferences()
    syncKucoCardBlink()
  }
}

function installPreferenceSubscription() {
  if (!bridge || typeof bridge.onPreferences !== 'function') return
  try {
    const unsubscribe = bridge.onPreferences((preferences) => {
      state.preferences = normalizePreferences(preferences)
      renderPreferences()
      syncKucoCardBlink()
    })
    if (typeof unsubscribe === 'function')
      state.unsubscribePreferences = unsubscribe
  } catch {
    // Preferences remain available through explicit reads and writes.
  }
}

function installEvents() {
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab))
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      const tabs = Array.from(document.querySelectorAll('[data-tab]'))
      const index = tabs.indexOf(tab)
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const next = tabs[(index + direction + tabs.length) % tabs.length]
      event.preventDefault()
      next.focus()
      selectTab(next.dataset.tab)
    })
  }

  for (const radio of document.querySelectorAll('input[name="study-method"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked || !METHODS[radio.value]) return
      state.selectedMethod = radio.value
      renderMethodPreview()
    })
  }

  elements.customFocus.addEventListener('input', () => {
    state.customFocusMinutes = elements.customFocus.valueAsNumber
    renderMethodPreview()
  })
  elements.customBreak.addEventListener('input', () => {
    state.customBreakMinutes = elements.customBreak.valueAsNumber
    renderMethodPreview()
  })
  elements.courseSelect.addEventListener('change', () => {
    state.courseId = elements.courseSelect.value
    const selectedTask = state.tasks.find((task) => task.id === state.taskId)
    if (selectedTask?.courseId && selectedTask.courseId !== state.courseId)
      state.taskId = ''
    renderAcademicOptions()
  })
  elements.taskSelect.addEventListener('change', () => {
    state.taskId = elements.taskSelect.value
    const selectedTask = state.tasks.find((task) => task.id === state.taskId)
    if (selectedTask?.courseId) state.courseId = selectedTask.courseId
    renderAcademicOptions()
  })

  elements.sessionForm.addEventListener('submit', startSession)
  elements.pauseButton.addEventListener(
    'click',
    () => void transitionSession('pause'),
  )
  elements.resumeButton.addEventListener(
    'click',
    () => void transitionSession('resume'),
  )
  elements.completeButton.addEventListener(
    'click',
    () => void transitionSession('complete'),
  )
  elements.cancelButton.addEventListener(
    'click',
    () => void transitionSession('cancel'),
  )
  elements.loginForm.addEventListener('submit', login)
  elements.logoutButton.addEventListener('click', () => void logout())
  elements.refreshButton.addEventListener(
    'click',
    () => void refreshEverything(),
  )
  elements.progressRefresh.addEventListener(
    'click',
    () => void refreshEverything(),
  )

  for (const control of document.querySelectorAll('[data-preference]')) {
    control.addEventListener('change', () => void updatePreference(control))
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user)
      void refreshEverything({ silent: true })
    syncKucoCardBlink()
  })
  window.addEventListener('pagehide', () => {
    clearKucoCardBlinkTimer()
    sendDesktopSnapshot('idle', true)
    if (state.unsubscribePreferences) state.unsubscribePreferences()
  })
}

function preloadAvatarAssets() {
  const uniqueSources = new Set([
    KUCO_SPRITE_SHEET,
    ...Object.values(CHIBI_AVATAR_ASSETS).flat(),
  ])
  for (const source of uniqueSources) {
    const image = new Image()
    image.src = source
  }
}

function hideStartupOverlay() {
  elements.startupOverlay.classList.add('is-leaving')
  window.setTimeout(() => {
    elements.startupOverlay.hidden = true
  }, 240)
}

async function initialize() {
  installEvents()
  preloadAvatarAssets()
  installPreferenceSubscription()
  await Promise.allSettled([loadPreferences(), loadConnectionInfo()])
  renderPreferences()
  syncKucoCardBlink()

  if (!bridge || !api) {
    markOffline('FocusBuddy no encontró el bridge seguro de la aplicación.')
    clearSensitiveSession({ selectAccount: true })
    text(
      elements.loginError,
      'La integración local no está disponible. Reinicia FocusBuddy.',
    )
    elements.loginError.hidden = false
    hideStartupOverlay()
    return
  }

  try {
    text(elements.startupLabel, 'Conectando con Konea…')
    await callApi('health')
    setConnection('online', 'Conectado a Konea')
    const result = await callApi('getCurrentUser')
    const user = unwrap(result, 'user')
    state.user = user && typeof user === 'object' ? user : null
    renderAccount()
    if (state.user) {
      text(elements.startupLabel, 'Recuperando tu sesión…')
      await loadAuthenticatedData({ silent: true })
    } else {
      sendDesktopSnapshot('idle', true)
      selectTab('account', { allowUnauthenticated: true })
    }
  } catch (error) {
    if (isUnauthorized(error)) {
      clearSensitiveSession({ selectAccount: true })
      setConnection('online', 'Conectado a Konea')
    } else {
      markOffline(`No pudimos iniciar FocusBuddy: ${readableError(error)}`)
      clearSensitiveSession({ selectAccount: true })
      sendDesktopSnapshot('offline', true)
    }
  } finally {
    renderAll()
    hideStartupOverlay()
  }
}

window.setInterval(() => {
  state.now = Date.now()
  renderSession()
  renderAvatar()
}, 1000)

window.setInterval(() => {
  void heartbeat()
}, 30000)

void initialize()

const SESSION_STATUSES = new Set([
  'idle',
  'active',
  'paused',
  'completed',
  'offline',
])

const AVATAR_SCENES = new Set([
  'idle',
  'typing',
  'typingConcentrated',
  'writing',
  'writingConcentrated',
  'studying',
  'typingTired',
  'studyingTired',
  'break',
  'celebrate',
  'clapping',
  'typingSleeping',
  'studyingSleeping',
])

const DEFAULT_AVATAR_SCENES = Object.freeze({
  idle: 'idle',
  active: 'typing',
  paused: 'break',
  completed: 'celebrate',
  offline: 'idle',
})

const DEFAULT_SESSION_STATE = Object.freeze({
  status: 'idle',
  avatarScene: 'idle',
  sessionId: null,
  title: 'Listo para estudiar',
  course: null,
  timerLabel: '--:--',
  timerFinished: false,
})

function cleanText(value, maximumLength) {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maximumLength) : null
}

function normalizeSessionState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_SESSION_STATE }
  }

  const status = SESSION_STATUSES.has(value.status) ? value.status : 'idle'
  const timerLabel = cleanText(value.timerLabel, 12)

  return {
    status,
    // Presentation identifiers only: paths and URLs must never cross the IPC
    // boundary to choose a companion image.
    avatarScene: AVATAR_SCENES.has(value.avatarScene)
      ? value.avatarScene
      : DEFAULT_AVATAR_SCENES[status],
    sessionId: cleanText(value.sessionId, 64),
    title:
      cleanText(value.title, 100) ??
      (status === 'offline'
        ? 'Konea no está disponible'
        : 'Listo para estudiar'),
    course: cleanText(value.course, 100),
    timerLabel: /^\d{1,3}:\d{2}(?::\d{2})?$/.test(timerLabel ?? '')
      ? timerLabel
      : status === 'idle' || status === 'offline'
        ? '--:--'
        : '00:00',
    timerFinished: value.timerFinished === true,
  }
}

module.exports = { DEFAULT_SESSION_STATE, normalizeSessionState }

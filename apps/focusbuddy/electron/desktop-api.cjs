const { buildApiUrl, normalizeApiBaseUrl } = require('./api-url.cjs')

const DESKTOP_API_OPERATIONS = Object.freeze([
  'health.get',
  'auth.login',
  'auth.me',
  'auth.logout',
  'academic.dashboard',
  'study.overview',
  'study.sessions.list',
  'study.sessions.events',
  'study.sessions.start',
  'study.sessions.transition',
])

const STUDY_METHODS = new Set([
  'pomodoro',
  'pomodoro_extended',
  'deep_work',
  'flowtime',
  'custom',
])
const STUDY_STATUSES = new Set(['active', 'paused', 'completed', 'cancelled'])
const STUDY_TRANSITIONS = new Set([
  'heartbeat',
  'pause',
  'resume',
  'complete',
  'cancel',
])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class DesktopApiInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DesktopApiInputError'
  }
}

class DesktopApiResponseError extends Error {
  constructor(status, body) {
    super('Konea API request failed')
    this.name = 'DesktopApiResponseError'
    this.status = status
    this.body = body
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function objectInput(value, operation, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return {}
  if (!isPlainObject(value)) {
    throw new DesktopApiInputError(
      `Los datos de ${operation} deben enviarse como un objeto.`,
    )
  }
  return value
}

function assertOnlyKeys(input, allowedKeys, operation) {
  const allowed = new Set(allowedKeys)
  const unknown = Object.keys(input).find((key) => !allowed.has(key))
  if (unknown) {
    throw new DesktopApiInputError(
      `Los datos de ${operation} contienen campos no permitidos.`,
    )
  }
}

function requiredString(value, label, { min = 1, max = 1_000 } = {}) {
  if (typeof value !== 'string') {
    throw new DesktopApiInputError(`${label} debe ser texto.`)
  }
  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) {
    throw new DesktopApiInputError(`${label} no tiene una longitud válida.`)
  }
  return normalized
}

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new DesktopApiInputError(`${label} debe ser un UUID válido.`)
  }
  return value.toLowerCase()
}

function optionalUuid(value, label) {
  if (value === undefined || value === null || value === '') return null
  return uuid(value, label)
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new DesktopApiInputError(
      `${label} debe ser un entero entre ${minimum} y ${maximum}.`,
    )
  }
  return value
}

function validateNoInput(value, operation) {
  const input = objectInput(value, operation, { optional: true })
  assertOnlyKeys(input, [], operation)
  return undefined
}

function validateLogin(value) {
  const input = objectInput(value, 'inicio de sesión')
  assertOnlyKeys(input, ['identifier', 'password'], 'inicio de sesión')
  const identifier = requiredString(input.identifier, 'El identificador', {
    max: 320,
  }).toLowerCase()
  if (!USERNAME_PATTERN.test(identifier) && !EMAIL_PATTERN.test(identifier)) {
    throw new DesktopApiInputError(
      'El identificador debe ser un correo o nombre de usuario válido.',
    )
  }
  if (typeof input.password !== 'string') {
    throw new DesktopApiInputError('La contraseña debe ser texto.')
  }
  if (input.password.length < 1 || input.password.length > 128) {
    throw new DesktopApiInputError(
      'La contraseña no tiene una longitud válida.',
    )
  }
  return { identifier, password: input.password }
}

function validateOverview(value) {
  const input = objectInput(value, 'resumen de estudio', { optional: true })
  assertOnlyKeys(input, ['timeZone'], 'resumen de estudio')
  return {
    timeZone:
      input.timeZone === undefined
        ? 'America/Santiago'
        : requiredString(input.timeZone, 'La zona horaria', { max: 100 }),
  }
}

function validateSessionList(value) {
  const input = objectInput(value, 'historial de estudio', { optional: true })
  assertOnlyKeys(input, ['limit', 'cursor', 'status'], 'historial de estudio')
  const result = {}
  if (input.limit !== undefined) {
    result.limit = integer(input.limit, 'El límite', 1, 100)
  }
  if (input.cursor !== undefined) {
    const cursor = requiredString(input.cursor, 'El cursor', { max: 100 })
    const parsed = new Date(cursor)
    if (
      !Number.isFinite(parsed.getTime()) ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(cursor)
    ) {
      throw new DesktopApiInputError(
        'El cursor debe ser una fecha ISO con zona.',
      )
    }
    result.cursor = cursor
  }
  if (input.status !== undefined) {
    if (!STUDY_STATUSES.has(input.status)) {
      throw new DesktopApiInputError('El estado de estudio no es válido.')
    }
    result.status = input.status
  }
  return result
}

function validateSessionReference(value, operation) {
  const input = objectInput(value, operation)
  assertOnlyKeys(input, ['sessionId'], operation)
  return { sessionId: uuid(input.sessionId, 'El identificador de sesión') }
}

function validateSessionStart(value) {
  const input = objectInput(value, 'inicio de sesión de estudio')
  assertOnlyKeys(
    input,
    [
      'clientRequestId',
      'method',
      'courseId',
      'taskId',
      'plannedDurationSeconds',
      'breakDurationSeconds',
    ],
    'inicio de sesión de estudio',
  )

  const clientRequestId = uuid(
    input.clientRequestId,
    'El identificador de solicitud',
  )
  if (!STUDY_METHODS.has(input.method)) {
    throw new DesktopApiInputError('El método de estudio no es válido.')
  }
  const plannedDurationSeconds = integer(
    input.plannedDurationSeconds,
    'La duración planificada',
    0,
    14_400,
  )
  if (input.method === 'flowtime' && plannedDurationSeconds !== 0) {
    throw new DesktopApiInputError(
      'Flowtime debe usar una duración planificada de 0 segundos.',
    )
  }
  if (input.method !== 'flowtime' && plannedDurationSeconds < 60) {
    throw new DesktopApiInputError(
      'La duración planificada debe ser de al menos 60 segundos.',
    )
  }

  return {
    clientRequestId,
    method: input.method,
    courseId: optionalUuid(input.courseId, 'La asignatura'),
    taskId: optionalUuid(input.taskId, 'La tarea'),
    plannedDurationSeconds,
    breakDurationSeconds:
      input.breakDurationSeconds === undefined
        ? 0
        : integer(input.breakDurationSeconds, 'La pausa', 0, 7_200),
  }
}

function validateSessionTransition(value) {
  const input = objectInput(value, 'transición de estudio')
  assertOnlyKeys(input, ['sessionId', 'action'], 'transición de estudio')
  const sessionId = uuid(input.sessionId, 'El identificador de sesión')
  if (!STUDY_TRANSITIONS.has(input.action)) {
    throw new DesktopApiInputError('La transición de estudio no es válida.')
  }
  return { sessionId, action: input.action }
}

function queryString(input) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

const operationDefinitions = Object.freeze({
  'health.get': (value) => {
    validateNoInput(value, 'estado de la API')
    return { method: 'GET', path: '/health' }
  },
  'auth.login': (value) => ({
    method: 'POST',
    path: '/auth/login',
    body: validateLogin(value),
  }),
  'auth.me': (value) => {
    validateNoInput(value, 'consulta de sesión')
    return { method: 'GET', path: '/auth/me' }
  },
  'auth.logout': (value) => {
    validateNoInput(value, 'cierre de sesión')
    return { method: 'POST', path: '/auth/logout' }
  },
  'academic.dashboard': (value) => {
    validateNoInput(value, 'panel académico')
    return { method: 'GET', path: '/academic' }
  },
  'study.overview': (value) => {
    const input = validateOverview(value)
    return {
      method: 'GET',
      path: `/study/overview${queryString(input)}`,
    }
  },
  'study.sessions.list': (value) => {
    const input = validateSessionList(value)
    return {
      method: 'GET',
      path: `/study/sessions${queryString(input)}`,
    }
  },
  'study.sessions.events': (value) => {
    const input = validateSessionReference(value, 'eventos de estudio')
    return {
      method: 'GET',
      path: `/study/sessions/${encodeURIComponent(input.sessionId)}/events`,
    }
  },
  'study.sessions.start': (value) => ({
    method: 'POST',
    path: '/study/sessions',
    body: validateSessionStart(value),
  }),
  'study.sessions.transition': (value) => {
    const input = validateSessionTransition(value)
    return {
      method: 'PATCH',
      path: `/study/sessions/${encodeURIComponent(input.sessionId)}`,
      body: { action: input.action },
    }
  },
})

function cleanText(value, fallback, maximum = 300) {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maximum) : fallback
}

function cleanCode(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? value
    : fallback
}

function cleanFields(value) {
  if (!isPlainObject(value)) return undefined
  const fields = {}
  for (const [key, messages] of Object.entries(value).slice(0, 25)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key) || !Array.isArray(messages))
      continue
    const cleaned = messages
      .slice(0, 5)
      .map((message) => cleanText(message, '', 200))
      .filter(Boolean)
    if (cleaned.length > 0) fields[key] = cleaned
  }
  return Object.keys(fields).length > 0 ? fields : undefined
}

function sanitizedError(error) {
  if (error instanceof DesktopApiInputError) {
    return {
      status: 0,
      code: 'INVALID_DESKTOP_API_INPUT',
      message: cleanText(error.message, 'La solicitud local no es válida.'),
    }
  }

  if (error instanceof DesktopApiResponseError) {
    const envelope = isPlainObject(error.body) ? error.body.error : undefined
    const apiError = isPlainObject(envelope) ? envelope : {}
    const fields = cleanFields(apiError.details?.fields)
    return {
      status:
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status <= 599
          ? error.status
          : 0,
      code: cleanCode(apiError.code, 'REQUEST_FAILED'),
      message: cleanText(
        apiError.message,
        'Konea no pudo completar la solicitud.',
      ),
      ...(fields ? { fields } : {}),
    }
  }

  return {
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'No fue posible conectar con Konea.',
  }
}

async function parseResponseBody(response) {
  if (response.status === 204) return null
  try {
    return await response.json()
  } catch {
    if (response.ok) {
      throw new DesktopApiResponseError(502, {
        error: {
          code: 'INVALID_API_RESPONSE',
          message: 'Konea devolvió una respuesta no válida.',
        },
      })
    }
    return {}
  }
}

function createDesktopApiClient({ apiBaseUrl, fetchImpl } = {}) {
  const normalizedBase = normalizeApiBaseUrl(apiBaseUrl)
  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'FocusBuddy requiere una implementación fetch asociada a su sesión.',
    )
  }

  async function request(operation, payload) {
    const defineOperation = operationDefinitions[operation]
    if (!Object.hasOwn(operationDefinitions, operation) || !defineOperation) {
      throw new DesktopApiInputError(
        'La operación solicitada no está permitida.',
      )
    }
    const definition = defineOperation(payload)
    const hasBody = definition.body !== undefined
    const response = await fetchImpl(
      buildApiUrl(normalizedBase, definition.path),
      {
        method: definition.method,
        credentials: 'include',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(definition.body) } : {}),
      },
    )
    if (
      !response ||
      typeof response.status !== 'number' ||
      typeof response.ok !== 'boolean' ||
      typeof response.json !== 'function'
    ) {
      throw new Error('Invalid fetch response')
    }
    const body = await parseResponseBody(response)
    if (!response.ok) throw new DesktopApiResponseError(response.status, body)
    return body
  }

  return Object.freeze({
    operations: DESKTOP_API_OPERATIONS,
    async invoke(operation, payload) {
      try {
        return { ok: true, data: await request(operation, payload) }
      } catch (error) {
        return { ok: false, error: sanitizedError(error) }
      }
    },
  })
}

module.exports = {
  DESKTOP_API_OPERATIONS,
  createDesktopApiClient,
}

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  DESKTOP_API_OPERATIONS,
  createDesktopApiClient,
} = require('./desktop-api.cjs')

const API_BASE_URL = 'https://konea.example/api/v1'
const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const COURSE_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientWith(fetchImpl) {
  return createDesktopApiClient({ apiBaseUrl: API_BASE_URL, fetchImpl })
}

describe('FocusBuddy desktop API client', () => {
  it('exposes only an immutable operation allowlist and an IPC-safe invoke method', () => {
    const client = clientWith(async () => jsonResponse({}))
    assert.deepEqual(client.operations, DESKTOP_API_OPERATIONS)
    assert.equal(Object.isFrozen(client), true)
    assert.equal(Object.isFrozen(client.operations), true)
    assert.deepEqual(Object.keys(client).sort(), ['invoke', 'operations'])
  })

  it('logs in with normalized input and credentialed JSON fetch', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse({ user: { id: 'user-1', username: 'ana' } })
    })

    const result = await client.invoke('auth.login', {
      identifier: ' ANA.P ',
      password: 'CampusSeguro2026!',
    })

    assert.deepEqual(result, {
      ok: true,
      data: { user: { id: 'user-1', username: 'ana' } },
    })
    assert.equal(calls[0][0], `${API_BASE_URL}/auth/login`)
    const { signal, ...options } = calls[0][1]
    assert.equal(signal instanceof AbortSignal, true)
    assert.equal(signal.aborted, false)
    assert.deepEqual(options, {
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: 'ana.p',
        password: 'CampusSeguro2026!',
      }),
    })
  })

  it('rejects unknown operations and strict invalid login data before fetch', async () => {
    let calls = 0
    const client = clientWith(async () => {
      calls += 1
      return jsonResponse({})
    })

    const unknown = await client.invoke('request.any.url', {
      url: 'https://malicious.example',
    })
    const invalid = await client.invoke('auth.login', {
      identifier: 'a',
      password: 'secret',
      apiUrl: 'https://malicious.example',
    })

    assert.equal(calls, 0)
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, 'INVALID_DESKTOP_API_INPUT')
    assert.equal(invalid.ok, false)
    assert.equal(invalid.error.code, 'INVALID_DESKTOP_API_INPUT')
    assert.doesNotMatch(JSON.stringify(invalid), /secret|malicious/i)
  })

  it('validates and normalizes idempotent study starts', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse(
        { session: { id: SESSION_ID }, idempotent: false },
        { status: 201 },
      )
    })

    const result = await client.invoke('study.sessions.start', {
      clientRequestId: REQUEST_ID.toUpperCase(),
      method: 'pomodoro',
      courseId: COURSE_ID,
      plannedDurationSeconds: 1_500,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      clientRequestId: REQUEST_ID,
      method: 'pomodoro',
      courseId: COURSE_ID,
      taskId: null,
      plannedDurationSeconds: 1_500,
      breakDurationSeconds: 0,
    })

    const invalidFlowtime = await client.invoke('study.sessions.start', {
      clientRequestId: REQUEST_ID,
      method: 'flowtime',
      plannedDurationSeconds: 1_500,
    })
    assert.equal(invalidFlowtime.ok, false)
    assert.equal(invalidFlowtime.error.code, 'INVALID_DESKTOP_API_INPUT')

    const overUiLimit = await client.invoke('study.sessions.start', {
      clientRequestId: REQUEST_ID,
      method: 'custom',
      plannedDurationSeconds: 14_401,
    })
    assert.equal(overUiLimit.ok, false)
    assert.equal(overUiLimit.error.code, 'INVALID_DESKTOP_API_INPUT')
    assert.equal(calls.length, 1)
  })

  it('allowlists transitions and places only a validated action in the body', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse({ session: { id: SESSION_ID, status: 'paused' } })
    })

    const result = await client.invoke('study.sessions.transition', {
      sessionId: SESSION_ID,
      action: 'pause',
    })
    assert.equal(result.ok, true)
    assert.equal(calls[0][0], `${API_BASE_URL}/study/sessions/${SESSION_ID}`)
    assert.equal(calls[0][1].method, 'PATCH')
    assert.equal(calls[0][1].credentials, 'include')
    assert.equal(calls[0][1].body, '{"action":"pause"}')

    const invalid = await client.invoke('study.sessions.transition', {
      sessionId: SESSION_ID,
      action: 'delete',
    })
    assert.equal(invalid.ok, false)
    assert.equal(calls.length, 1)
  })

  it('builds bounded read queries without exposing a generic path', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse({ activeSession: null })
    })

    await client.invoke('health.get')
    await client.invoke('study.overview', { timeZone: 'America/Santiago' })
    await client.invoke('study.sessions.list', {
      limit: 15,
      cursor: '2026-09-08T10:30:00.000Z',
      status: 'completed',
    })
    await client.invoke('study.sessions.events', { sessionId: SESSION_ID })

    assert.equal(calls[0][0], `${API_BASE_URL}/health`)
    assert.equal(calls[0][1].credentials, 'include')
    assert.equal(
      calls[1][0],
      `${API_BASE_URL}/study/overview?timeZone=America%2FSantiago`,
    )
    assert.equal(calls[1][1].credentials, 'include')
    assert.equal(
      calls[2][0],
      `${API_BASE_URL}/study/sessions?limit=15&cursor=2026-09-08T10%3A30%3A00.000Z&status=completed`,
    )
    assert.equal(
      calls[3][0],
      `${API_BASE_URL}/study/sessions/${SESSION_ID}/events`,
    )
  })

  it('returns serializable sanitized API and network failures', async () => {
    const apiClient = clientWith(async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revisa\u0000 la solicitud.',
            details: {
              fields: {
                action: ['Valor inválido'],
                '<unsafe>': ['ignored'],
              },
            },
          },
        },
        { status: 400 },
      ),
    )
    const apiFailure = await apiClient.invoke('study.sessions.transition', {
      sessionId: SESSION_ID,
      action: 'pause',
    })
    assert.deepEqual(apiFailure, {
      ok: false,
      error: {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Revisa  la solicitud.',
        fields: { action: ['Valor inválido'] },
      },
    })
    assert.equal(Object.hasOwn(apiFailure.error, 'stack'), false)

    const networkClient = clientWith(async () => {
      throw new Error('connect ECONNREFUSED https://host/?password=secret')
    })
    const networkFailure = await networkClient.invoke('auth.me')
    assert.deepEqual(networkFailure, {
      ok: false,
      error: {
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'No fue posible conectar con Konea.',
      },
    })
    assert.doesNotMatch(JSON.stringify(networkFailure), /password|secret|host/i)
  })

  it('maps logout 204 and malformed successes to stable IPC envelopes', async () => {
    const logoutClient = clientWith(
      async () => new Response(null, { status: 204 }),
    )
    assert.deepEqual(await logoutClient.invoke('auth.logout'), {
      ok: true,
      data: null,
    })

    const malformedClient = clientWith(
      async () => new Response('<html>bad gateway</html>', { status: 200 }),
    )
    assert.deepEqual(await malformedClient.invoke('auth.me'), {
      ok: false,
      error: {
        status: 502,
        code: 'INVALID_API_RESPONSE',
        message: 'Konea devolvió una respuesta no válida.',
      },
    })
  })

  it('bounds stalled fetch and body decoding without retrying writes', async () => {
    let calls = 0
    let signal
    const client = createDesktopApiClient({
      apiBaseUrl: API_BASE_URL,
      timeoutMs: 5,
      fetchImpl: (_url, options) => {
        calls += 1
        signal = options.signal
        return new Promise(() => {})
      },
    })
    const failure = await client.invoke('auth.password.change', {
      currentPassword: 'current-password',
      newPassword: 'new-password-safe',
    })
    assert.equal(failure.ok, false)
    assert.equal(failure.error.code, 'REQUEST_TIMEOUT')
    assert.equal(signal.aborted, true)
    assert.equal(calls, 1)
    const bodyClient = createDesktopApiClient({
      apiBaseUrl: API_BASE_URL,
      timeoutMs: 5,
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        json: () => new Promise(() => {}),
      }),
    })
    assert.equal(
      (await bodyClient.invoke('auth.me')).error.code,
      'REQUEST_TIMEOUT',
    )
  })

  it('validates account changes with named operations and no arbitrary fields', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse({ user: { id: 'user-1' } })
    })
    assert.equal(
      (
        await client.invoke('auth.account.update', {
          displayName: 'Ana Perez',
          username: ' ANA.P ',
          email: ' ANA@EXAMPLE.TEST ',
          currentPassword: 'password-current',
        })
      ).ok,
      true,
    )
    assert.equal(calls[0][0], `${API_BASE_URL}/auth/account`)
    assert.equal(calls[0][1].method, 'PATCH')
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      displayName: 'Ana Perez',
      username: 'ana.p',
      email: 'ana@example.test',
      currentPassword: 'password-current',
    })
    assert.equal(
      (
        await client.invoke('auth.account.update', {
          displayName: 'Ana',
          username: 'ana',
          email: 'ana@example.test',
          currentPassword: 'password',
          role: 'admin',
        })
      ).ok,
      false,
    )
    assert.equal(
      (
        await client.invoke('auth.password.change', {
          currentPassword: 'password',
          newPassword: 'short',
        })
      ).ok,
      false,
    )
    assert.equal(calls.length, 1)
  })

  it('updates only an owned task status through a bounded named operation', async () => {
    const calls = []
    const client = clientWith(async (...args) => {
      calls.push(args)
      return jsonResponse({ task: { id: COURSE_ID, status: 'completed' } })
    })
    assert.equal(
      (
        await client.invoke('academic.tasks.updateStatus', {
          taskId: COURSE_ID,
          status: 'completed',
        })
      ).ok,
      true,
    )
    assert.equal(calls[0][0], `${API_BASE_URL}/academic/tasks/${COURSE_ID}`)
    assert.equal(calls[0][1].method, 'PATCH')
    assert.equal(calls[0][1].body, '{"status":"completed"}')
    assert.equal(
      (
        await client.invoke('academic.tasks.updateStatus', {
          taskId: COURSE_ID,
          status: 'deleted',
        })
      ).ok,
      false,
    )
    assert.equal(
      (
        await client.invoke('academic.tasks.updateStatus', {
          taskId: COURSE_ID,
          status: 'completed',
          userId: 'other',
        })
      ).ok,
      false,
    )
    assert.equal(calls.length, 1)
  })
})

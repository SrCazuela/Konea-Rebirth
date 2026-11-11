const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { it } = require('node:test')
const vm = require('node:vm')

const source = readFileSync(path.join(__dirname, 'desktop.js'), 'utf8')
function rendererFunction(name) {
  const expression = new RegExp(
    `(?:async )?function ${name}\\([^]*?(?=\\n(?:async )?function \\w|\\nwindow\\.setInterval)`,
  )
  const match = source.match(expression)
  assert.ok(match, `Missing renderer function ${name}`)
  return match[0]
}

function fixture(responses = {}) {
  const calls = []
  const pendingTimers = new Map()
  let nextTimer = 0
  const user = { id: 'account-1', displayName: 'Ana' }
  const state = {
    user,
    overview: { activeSession: null },
    overviewReady: true,
    loadVersion: 0,
    sessionMutationVersion: 0,
    syncInFlight: 0,
    actionBusy: false,
    accountBusy: false,
    heartbeatBusy: false,
    heartbeatRetryTimer: null,
    lastSyncAt: 0,
    preferences: { companionEnabled: true },
    courses: [],
    tasks: [],
    connectionState: 'online',
  }
  const context = vm.createContext({
    state,
    calls,
    Date,
    Intl,
    window: {
      confirm: () => true,
      setTimeout: (callback, delay) => {
        const id = ++nextTimer
        pendingTimers.set(id, { callback, delay })
        return id
      },
      clearTimeout: (id) => pendingTimers.delete(id),
    },
    document: { visibilityState: 'visible' },
    elements: { refreshButton: {}, progressRefresh: {} },
    callApi: async (name, ...args) => {
      calls.push([name, ...args])
      if (Object.hasOwn(responses, name))
        return typeof responses[name] === 'function'
          ? responses[name](...args)
          : responses[name]
      if (name === 'getCurrentUser') return { user }
      if (name === 'getAcademic') return { courses: [], tasks: [] }
      if (name === 'getOverview') return { activeSession: null }
      throw new Error('Unexpected API call')
    },
    unwrap: (value, key) => value?.[key] ?? value,
    asArray: (value) => (Array.isArray(value) ? value : []),
    currentSession: () => state.overview?.activeSession,
    isUnauthorized: (error) => error?.status === 401,
    isConnectionError: (error) => error?.status === 0 || error?.status >= 500,
    errorStatus: (error) => error?.status,
    readableError: (error) => error?.message,
    setConnection: (status) => {
      state.connectionState = status
    },
    expireSession: () => {
      state.user = null
      state.overview = null
      state.loadVersion += 1
    },
    handleApiFailure: (error) => {
      state.connectionState = error?.status === 401 ? 'expired' : 'offline'
    },
    markOffline: () => {
      state.connectionState = 'offline'
    },
    applySessionUpdate: (session) => {
      state.overview.activeSession = session
    },
    renderAll: () => {},
    renderAccount: () => {},
    renderAcademicOptions: () => {},
    renderSession: () => {},
    renderProgress: () => {},
    sendDesktopSnapshot: () => {},
    text: () => {},
    selectTab: () => {},
    showFeedback: () => {},
  })
  vm.runInContext(
    [
      'loadAuthenticatedData',
      'refreshEverything',
      'heartbeat',
      'clearHeartbeatRetry',
      'queueHeartbeatRetry',
      'clearSensitiveSession',
      'taskForCompletion',
      'completeSelectedTask',
      'refreshIfDue',
    ]
      .map(rendererFunction)
      .join('\n'),
    context,
  )
  return { state, calls, context, pendingTimers }
}

it('reconciles sessions, tasks and account changes independently of local heartbeat status', async () => {
  const { state, calls, context } = fixture({
    getCurrentUser: {
      user: { id: 'account-1', displayName: 'Ana actualizada' },
    },
    getOverview: { activeSession: { id: 'session-web', status: 'paused' } },
    getAcademic: {
      courses: [{ id: 'course-web' }],
      tasks: [{ id: 'task-web' }],
    },
  })
  await context.refreshEverything({ silent: true })
  assert.equal(state.overview.activeSession.status, 'paused')
  assert.equal(state.user.displayName, 'Ana actualizada')
  assert.equal(state.tasks[0].id, 'task-web')
  assert.deepEqual(calls.map(([name]) => name).sort(), [
    'getAcademic',
    'getCurrentUser',
    'getOverview',
  ])
  assert.equal(state.syncInFlight, 0)
})

it('coalesces background refreshes and ignores snapshots invalidated by a local mutation', async () => {
  let resolveOverview
  const { state, calls, context } = fixture({
    getOverview: () =>
      new Promise((resolve) => {
        resolveOverview = resolve
      }),
  })
  const pending = context.refreshEverything({ silent: true })
  await context.refreshEverything({ silent: true })
  assert.equal(calls.length, 3)
  state.loadVersion += 1
  state.sessionMutationVersion += 1
  state.overview = { activeSession: { id: 'new-local', status: 'active' } }
  resolveOverview({ activeSession: { id: 'old-web', status: 'paused' } })
  await pending
  assert.equal(state.overview.activeSession.id, 'new-local')
  assert.equal(state.syncInFlight, 0)
})

it('reconciles a heartbeat conflict after completion on the web without declaring an outage', async () => {
  const { state, calls, context } = fixture({
    transitionSession: async () => {
      throw Object.assign(new Error('Changed elsewhere'), { status: 409 })
    },
  })
  state.overview.activeSession = { id: 'session-web', status: 'active' }
  await context.heartbeat()
  assert.equal(state.overview.activeSession, null)
  assert.equal(state.connectionState, 'online')
  assert.ok(calls.some(([name]) => name === 'getOverview'))
  assert.equal(state.heartbeatBusy, false)
})

it('does not overlap a heartbeat with a pending canonical snapshot', async () => {
  const { state, calls, context } = fixture()
  state.overview.activeSession = { id: 'session-web', status: 'active' }
  state.syncInFlight = 1
  await context.heartbeat()
  assert.equal(calls.length, 0)
})

it('defers and coalesces heartbeat ticks until a slow canonical snapshot completes', async () => {
  let resolveOverview
  let activeState
  const session = { id: 'active-web-session', status: 'active' }
  const { state, calls, context, pendingTimers } = fixture({
    getOverview: () =>
      new Promise((resolve) => {
        resolveOverview = resolve
      }),
    transitionSession: () => {
      assert.equal(
        activeState.syncInFlight,
        0,
        'Heartbeat must wait for pending reads',
      )
      return { session }
    },
  })
  activeState = state
  state.overview.activeSession = session
  const reading = context.refreshEverything({ silent: true })
  await context.heartbeat()
  await context.heartbeat()
  await context.heartbeat()
  assert.equal(
    pendingTimers.size,
    1,
    'Repeated ticks must share a single retry',
  )
  assert.equal(calls.filter(([name]) => name === 'transitionSession').length, 0)
  const [firstId, firstTimer] = [...pendingTimers][0]
  assert.equal(firstTimer.delay, 1000)
  pendingTimers.delete(firstId)
  firstTimer.callback()
  await Promise.resolve()
  assert.equal(pendingTimers.size, 1, 'Still-busy reads requeue only one retry')
  resolveOverview({ activeSession: session })
  await reading
  const [retryId, retry] = [...pendingTimers][0]
  assert.equal(retry.delay, 1000)
  pendingTimers.delete(retryId)
  retry.callback()
  await new Promise(setImmediate)
  assert.equal(calls.filter(([name]) => name === 'transitionSession').length, 1)
  assert.equal(pendingTimers.size, 0)
  assert.equal(state.heartbeatRetryTimer, null)
  assert.equal(state.heartbeatBusy, false)
})

it('cancels a queued heartbeat when refreshed state is paused or the account logs out', async () => {
  const { state, calls, context, pendingTimers } = fixture()
  state.overview.activeSession = { id: 'session-web', status: 'active' }
  state.syncInFlight = 1
  await context.heartbeat()
  assert.equal(pendingTimers.size, 1)
  state.overview.activeSession.status = 'paused'
  const [id, timer] = [...pendingTimers][0]
  pendingTimers.delete(id)
  timer.callback()
  await Promise.resolve()
  assert.equal(calls.length, 0)
  assert.equal(pendingTimers.size, 0)
  state.overview.activeSession.status = 'active'
  await context.heartbeat()
  assert.equal(pendingTimers.size, 1)
  context.clearSensitiveSession({ selectAccount: false })
  assert.equal(state.user, null)
  assert.equal(state.heartbeatRetryTimer, null)
  assert.equal(pendingTimers.size, 0)
})

it('does not restore stale account data after a revoked session', async () => {
  const { state, context } = fixture({
    getCurrentUser: async () => {
      throw { status: 401 }
    },
    getOverview: { activeSession: { id: 'secret-session', status: 'active' } },
  })
  await context.refreshEverything({ silent: true })
  assert.equal(state.user, null)
  assert.equal(state.overview, null)
})

it('completes a selected task only after explicit confirmation, independently of study completion', async () => {
  let completed = false
  const task = { id: 'task-1', title: 'Preparar guía', status: 'pending' }
  const { state, context, calls } = fixture({
    getAcademic: () => ({
      courses: [],
      tasks: [{ ...task, status: completed ? 'completed' : 'pending' }],
    }),
    updateTaskStatus: () => {
      completed = true
      return { task: { ...task, status: 'completed' } }
    },
  })
  state.taskId = task.id
  await context.refreshEverything({ silent: true })
  assert.equal(calls.filter(([name]) => name === 'updateTaskStatus').length, 0)
  context.window.confirm = () => false
  await context.completeSelectedTask()
  assert.equal(completed, false)
  context.window.confirm = () => true
  await context.completeSelectedTask()
  assert.equal(completed, true)
  assert.equal(calls.filter(([name]) => name === 'updateTaskStatus').length, 1)
  assert.equal(state.tasks[0].status, 'completed')
  assert.equal(state.actionBusy, false)
})

it('keeps the floating companion synchronized while the main window is hidden without polling too often', async () => {
  const { state, context, calls } = fixture()
  context.document.visibilityState = 'hidden'
  let now = 10_000
  context.Date = { now: () => now }
  await context.refreshIfDue()
  assert.equal(calls.length, 0)
  now = 30_000
  await context.refreshIfDue()
  assert.equal(calls.length, 3)
  now = 40_000
  await context.refreshIfDue()
  assert.equal(calls.length, 3)
  now = 60_000
  state.preferences.companionEnabled = false
  await context.refreshIfDue()
  assert.equal(calls.length, 3)
  context.document.visibilityState = 'visible'
  await context.refreshIfDue()
  assert.equal(calls.length, 6)
})

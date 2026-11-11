const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, before, describe, it } = require('node:test')

describe('FocusBuddy desktop preload contract', () => {
  const calls = []
  const listeners = new Map()
  let bridge
  let originalLoad

  before(() => {
    originalLoad = Module._load
    Module._load = function loadWithElectronMock(request, parent, isMain) {
      if (request !== 'electron') return originalLoad(request, parent, isMain)
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, 'focusBuddyDesktop')
            bridge = value
          },
        },
        ipcRenderer: {
          async invoke(channel, ...args) {
            calls.push({ channel, args })
            if (channel !== 'focusbuddy:api') return { local: true }
            const [operation] = args
            if (operation === 'auth.login') {
              return {
                ok: false,
                error: {
                  status: 401,
                  code: 'INVALID_CREDENTIALS',
                  message: 'Credenciales incorrectas.',
                  fields: { identifier: ['Inválido'] },
                },
              }
            }
            return { ok: true, data: { operation } }
          },
          send(channel, ...args) {
            calls.push({ channel, args })
          },
          on(channel, listener) {
            listeners.set(channel, listener)
          },
          removeListener(channel, listener) {
            if (listeners.get(channel) === listener) listeners.delete(channel)
          },
        },
      }
    }

    delete require.cache[require.resolve('./preload.cjs')]
    require('./preload.cjs')
  })

  after(() => {
    Module._load = originalLoad
    delete require.cache[require.resolve('./preload.cjs')]
  })

  it('exposes frozen named capabilities and serializable successful API envelopes', async () => {
    assert.ok(Object.isFrozen(bridge))
    assert.ok(Object.isFrozen(bridge.api))
    assert.equal(Object.hasOwn(bridge, 'ipcRenderer'), false)

    const result = await bridge.api.getCurrentUser()
    assert.deepEqual(result, { ok: true, data: { operation: 'auth.me' } })
    assert.deepEqual(calls.at(-1), {
      channel: 'focusbuddy:api',
      args: ['auth.me', undefined],
    })
  })

  it('keeps error metadata in a serializable envelope across the context bridge', async () => {
    const result = structuredClone(
      await bridge.api.login({ identifier: 'student', password: 'incorrect' }),
    )
    assert.deepEqual(result, {
      ok: false,
      error: {
        message: 'Credenciales incorrectas.',
        status: 401,
        code: 'INVALID_CREDENTIALS',
        fields: { identifier: ['Inválido'] },
      },
    })
  })

  it('maps renderer-friendly arguments onto allowlisted operations', async () => {
    await bridge.api.updateTaskStatus(
      '11111111-1111-4111-8111-111111111111',
      'completed',
    )
    assert.deepEqual(calls.at(-1).args, [
      'academic.tasks.updateStatus',
      { taskId: '11111111-1111-4111-8111-111111111111', status: 'completed' },
    ])
    const account = {
      displayName: 'Ana',
      username: 'ana',
      email: 'ana@example.test',
      currentPassword: 'current-test',
    }
    await bridge.api.updateAccount(account)
    assert.deepEqual(calls.at(-1).args, ['auth.account.update', account])
    const password = {
      currentPassword: 'current-test',
      newPassword: 'new-test-password',
    }
    await bridge.api.changePassword(password)
    assert.deepEqual(calls.at(-1).args, ['auth.password.change', password])
    await bridge.api.getOverview('America/Santiago')
    assert.deepEqual(calls.at(-1).args, [
      'study.overview',
      { timeZone: 'America/Santiago' },
    ])

    await bridge.api.transitionSession(
      '018f4f5d-3566-7aa3-9e46-2b60c0ed927d',
      'pause',
    )
    assert.deepEqual(calls.at(-1).args, [
      'study.sessions.transition',
      {
        sessionId: '018f4f5d-3566-7aa3-9e46-2b60c0ed927d',
        action: 'pause',
      },
    ])
  })

  it('keeps preferences and presentation snapshots on dedicated channels', async () => {
    await bridge.updatePreferences({ reducedMotion: true })
    assert.deepEqual(calls.at(-1), {
      channel: 'focusbuddy:update-preferences',
      args: [{ reducedMotion: true }],
    })

    bridge.updateSessionState({ status: 'idle' })
    assert.deepEqual(calls.at(-1), {
      channel: 'focusbuddy:update-session-state',
      args: [{ status: 'idle' }],
    })

    const unsubscribe = bridge.onPreferences(() => {})
    assert.equal(typeof unsubscribe, 'function')
    assert.ok(listeners.has('focusbuddy:preferences-changed'))
    unsubscribe()
    assert.equal(listeners.has('focusbuddy:preferences-changed'), false)
  })
})

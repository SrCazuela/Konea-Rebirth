const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  DEFAULT_SESSION_STATE,
  normalizeSessionState,
} = require('./session-state.cjs')

describe('FocusBuddy desktop session snapshots', () => {
  it('falls back to an idle state for untrusted values', () => {
    assert.deepEqual(normalizeSessionState(null), DEFAULT_SESSION_STATE)
    assert.deepEqual(normalizeSessionState([]), DEFAULT_SESSION_STATE)
  })

  it('keeps only the bounded display fields required by the companion', () => {
    const state = normalizeSessionState({
      status: 'active',
      sessionId: 'session-123',
      title: `  Álgebra\u0000${'x'.repeat(150)}  `,
      course: 'Matemáticas',
      timerLabel: '24:59',
      timerFinished: false,
      accessToken: 'never-copy-this',
    })

    assert.equal(state.status, 'active')
    assert.equal(state.sessionId, 'session-123')
    assert.equal(state.title.length, 100)
    assert.equal(state.timerLabel, '24:59')
    assert.equal(Object.hasOwn(state, 'accessToken'), false)
  })

  it('rejects malformed timers and unknown statuses', () => {
    const state = normalizeSessionState({
      status: 'root',
      timerLabel: '<script>',
      timerFinished: 'yes',
    })

    assert.equal(state.status, 'idle')
    assert.equal(state.timerLabel, '--:--')
    assert.equal(state.timerFinished, false)
  })
})

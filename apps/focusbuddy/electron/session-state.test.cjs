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
    assert.equal(state.avatarScene, 'typing')
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

  it('preserves every supported scene without copying unrelated fields', () => {
    const scenes = [
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
    ]
    for (const avatarScene of scenes) {
      const state = normalizeSessionState({
        status: 'active',
        avatarScene,
        imageUrl: 'https://untrusted.example/avatar.png',
        credentials: { token: 'never-copy-this' },
      })
      assert.equal(state.avatarScene, avatarScene)
      assert.equal(Object.hasOwn(state, 'imageUrl'), false)
      assert.equal(Object.hasOwn(state, 'credentials'), false)
    }
  })

  it('uses a status-specific scene for missing or unsafe scene values', () => {
    const expected = {
      idle: 'idle',
      active: 'typing',
      paused: 'break',
      completed: 'celebrate',
      offline: 'idle',
    }
    const unsafeValues = [
      undefined,
      null,
      '',
      'unknown',
      'Typing',
      'https://untrusted.example/avatar.png',
      'file:///C:/private.png',
      '../../private.png',
      '__proto__',
      { scene: 'typing' },
      ['typing'],
    ]
    for (const [status, scene] of Object.entries(expected)) {
      for (const avatarScene of unsafeValues) {
        assert.equal(
          normalizeSessionState({ status, avatarScene }).avatarScene,
          scene,
        )
      }
    }
  })
})

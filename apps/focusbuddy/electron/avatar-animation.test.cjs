const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createAnimator } = require('./avatar-animation.js')

function fakeClock() {
  let now = 0
  let sequence = 0
  const pending = new Map()
  return {
    setTimeout(callback, delay) {
      const id = ++sequence
      pending.set(id, { at: now + delay, callback })
      return id
    },
    clearTimeout(id) {
      pending.delete(id)
    },
    advance(milliseconds) {
      const end = now + milliseconds
      let ticks = 0
      while (pending.size) {
        const [id, job] = [...pending.entries()].sort(
          (left, right) => left[1].at - right[1].at || left[0] - right[0],
        )[0]
        if (job.at > end) break
        if (++ticks > 100_000) throw new Error('Animation timer did not settle')
        now = job.at
        pending.delete(id)
        job.callback()
      }
      now = end
    },
    pendingCount() {
      return pending.size
    },
  }
}

function fixture(overrides = {}) {
  const clock = fakeClock()
  const rendered = []
  const animator = createAnimator({
    animations: {
      idle: {
        frames: [{ frame: 'open', durationMs: 250 }],
        blink: {
          frames: [
            { frame: 'half', durationMs: 45 },
            { frame: 'closed', durationMs: 95 },
            { frame: 'half', durationMs: 45 },
          ],
          minDelayMs: 1_000,
          maxDelayMs: 1_000,
          doubleBlinkChance: 0,
        },
      },
      typing: {
        frames: [
          { frame: 'typing-one', durationMs: 120 },
          { frame: 'typing-two', durationMs: 180 },
        ],
      },
    },
    initialState: 'idle',
    onFrame: (frame) => rendered.push(frame),
    random: () => 0.5,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    ...overrides,
  })
  return { clock, rendered, animator }
}

test('blink uses short eyelid frames and restores open eyes between blinks', () => {
  const { animator, clock, rendered } = fixture()
  clock.advance(999)
  assert.equal(animator.getSnapshot().frame, 'open')
  clock.advance(1)
  assert.equal(animator.getSnapshot().frame, 'half')
  clock.advance(45)
  assert.equal(animator.getSnapshot().frame, 'closed')
  clock.advance(95)
  assert.equal(animator.getSnapshot().frame, 'half')
  clock.advance(45)
  assert.equal(animator.getSnapshot().frame, 'open')
  assert.equal(animator.getSnapshot().blinking, false)
  assert.deepEqual(
    rendered.map(({ frame }) => frame),
    ['open', 'half', 'closed', 'half', 'open'],
  )
})

test('frequent unchanged status snapshots do not postpone the next blink', () => {
  const { animator, clock } = fixture()
  for (let elapsed = 0; elapsed < 1_000; elapsed += 100) {
    animator.update({
      state: 'idle',
      enabled: true,
      visible: true,
      reducedMotion: false,
    })
    clock.advance(100)
  }
  assert.equal(animator.getSnapshot().blinking, true)
  assert.equal(animator.getSnapshot().frame, 'half')
  animator.update({ state: 'idle' })
  clock.advance(45)
  assert.equal(animator.getSnapshot().frame, 'closed')
})

test('movement frames use their own durations instead of wall-clock modulo', () => {
  const { animator, clock } = fixture({ initialState: 'typing' })
  clock.advance(119)
  assert.equal(animator.getSnapshot().frame, 'typing-one')
  clock.advance(1)
  assert.equal(animator.getSnapshot().frame, 'typing-two')
  clock.advance(179)
  assert.equal(animator.getSnapshot().frame, 'typing-two')
  clock.advance(1)
  assert.equal(animator.getSnapshot().frame, 'typing-one')
})

test('state changes during a blink cancel its old timers and show a fresh pose', () => {
  const { animator, clock } = fixture()
  clock.advance(1_045)
  assert.equal(animator.getSnapshot().frame, 'closed')
  animator.update({ state: 'typing' })
  assert.equal(animator.getSnapshot().frame, 'typing-one')
  assert.equal(animator.getSnapshot().blinking, false)
  clock.advance(120)
  assert.equal(animator.getSnapshot().frame, 'typing-two')
  clock.advance(180)
  assert.equal(animator.getSnapshot().frame, 'typing-one')
})

test('hidden, disabled, and reduced-motion avatars reset open and release timers', () => {
  for (const [name, value] of [
    ['visible', false],
    ['enabled', false],
    ['reducedMotion', true],
  ]) {
    const { animator, clock } = fixture()
    clock.advance(1_045)
    animator.update({ [name]: value })
    assert.equal(animator.getSnapshot().frame, 'open')
    assert.equal(animator.getSnapshot().blinking, false)
    assert.equal(clock.pendingCount(), 0)
    clock.advance(10_000)
    assert.equal(animator.getSnapshot().frame, 'open')
    animator.update({ [name]: !value })
    clock.advance(1_000)
    assert.equal(animator.getSnapshot().blinking, true)
    animator.dispose()
  }
})

test('double blink includes an open gap and finishes open before the next idle wait', () => {
  const { animator, clock } = fixture({
    animations: {
      idle: {
        frames: [0],
        blink: {
          frames: [{ frame: 1, durationMs: 100 }],
          minDelayMs: 1_000,
          maxDelayMs: 1_000,
          doubleBlinkChance: 1,
          betweenBlinksMs: 140,
        },
      },
    },
  })
  clock.advance(1_000)
  assert.equal(animator.getSnapshot().frame, 1)
  clock.advance(100)
  assert.equal(animator.getSnapshot().frame, 0)
  clock.advance(139)
  assert.equal(animator.getSnapshot().frame, 0)
  clock.advance(1)
  assert.equal(animator.getSnapshot().frame, 1)
  clock.advance(100)
  assert.equal(animator.getSnapshot().frame, 0)
  clock.advance(999)
  assert.equal(animator.getSnapshot().frame, 0)
})

test('blinking overlays movement without skipping to a different pose', () => {
  const { animator, clock } = fixture({
    animations: {
      idle: {
        frames: [
          { frame: 'one', durationMs: 600 },
          { frame: 'two', durationMs: 600 },
        ],
        blink: {
          frames: [{ frame: 'blink', durationMs: 100 }],
          minDelayMs: 1_000,
          maxDelayMs: 1_000,
          doubleBlinkChance: 0,
        },
      },
    },
  })
  clock.advance(1_000)
  assert.equal(animator.getSnapshot().frame, 'blink')
  clock.advance(100)
  assert.equal(animator.getSnapshot().frame, 'two')
  clock.advance(599)
  assert.equal(animator.getSnapshot().frame, 'two')
  clock.advance(1)
  assert.equal(animator.getSnapshot().frame, 'one')
})

test('dispose removes all scheduled work and restores open eyes permanently', () => {
  const { animator, clock, rendered } = fixture()
  clock.advance(1_045)
  animator.dispose()
  assert.equal(animator.getSnapshot().frame, 'open')
  assert.equal(clock.pendingCount(), 0)
  const count = rendered.length
  animator.update({ state: 'typing' })
  clock.advance(10_000)
  assert.equal(rendered.length, count)
})

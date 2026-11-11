const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')
const vm = require('node:vm')
const {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
  resolveMotionPolicy,
} = require('./preferences.cjs')

describe('FocusBuddy desktop preferences', () => {
  it('uses conservative defaults for missing or malformed data', () => {
    assert.deepEqual(normalizePreferences(null), DEFAULT_PREFERENCES)
    assert.deepEqual(
      normalizePreferences({
        companionEnabled: 'yes',
        companionCharacter: 'dragon',
        companionScale: 'huge',
        companionPosition: { x: '10', y: 20 },
      }),
      DEFAULT_PREFERENCES,
    )
  })

  it('normalizes a valid companion position and supported scale', () => {
    const preferences = normalizePreferences({
      companionEnabled: false,
      companionCharacter: 'chibi',
      companionScale: 'large',
      companionPosition: { x: 10.4, y: -20.7 },
      notificationsEnabled: true,
    })

    assert.equal(preferences.companionEnabled, false)
    assert.equal(preferences.companionCharacter, 'chibi')
    assert.equal(preferences.companionScale, 'large')
    assert.deepEqual(preferences.companionPosition, { x: 10, y: -21 })
    assert.equal(preferences.notificationsEnabled, true)
  })

  it('ignores unknown fields when applying a partial update', () => {
    const preferences = mergePreferences(DEFAULT_PREFERENCES, {
      compactMode: true,
      arbitrarySecret: 'do-not-store',
    })

    assert.equal(preferences.compactMode, true)
    assert.equal(Object.hasOwn(preferences, 'arbitrarySecret'), false)
  })

  it('uses the official chibi for existing preference files without a character choice', () => {
    const preferences = normalizePreferences({
      companionEnabled: true,
      companionScale: 'small',
    })

    assert.equal(preferences.companionCharacter, 'chibi')
    assert.equal(preferences.companionScale, 'small')
  })

  it('migrates the unversioned Kuco default while preserving other settings', () => {
    const preferences = normalizePreferences({
      companionCharacter: 'kuco',
      companionEnabled: false,
      companionScale: 'large',
      reducedMotion: true,
      companionPosition: { x: -80, y: 420 },
    })

    assert.equal(preferences.companionCharacter, 'chibi')
    assert.equal(preferences.companionCharacterVersion, 1)
    assert.equal(preferences.companionEnabled, false)
    assert.equal(preferences.companionScale, 'large')
    assert.equal(preferences.reducedMotion, true)
    assert.deepEqual(preferences.companionPosition, { x: -80, y: 420 })
    assert.deepEqual(
      normalizePreferences(JSON.parse(JSON.stringify(preferences))),
      preferences,
    )
  })

  it('preserves an explicit Kuco selection through restart and unrelated updates', () => {
    const selected = mergePreferences(
      { companionCharacter: 'kuco', companionScale: 'small' },
      { companionCharacter: 'kuco' },
    )
    const restored = normalizePreferences(JSON.parse(JSON.stringify(selected)))
    const updated = mergePreferences(restored, { reducedMotion: true })

    assert.equal(selected.companionCharacter, 'kuco')
    assert.deepEqual(restored, selected)
    assert.equal(updated.companionCharacter, 'kuco')
    assert.equal(updated.companionScale, 'small')
    assert.equal(updated.reducedMotion, true)
    assert.equal(
      mergePreferences(updated, { companionCharacter: 'chibi' })
        .companionCharacter,
      'chibi',
    )
  })

  it('keeps migration metadata controlled by the application', () => {
    const selected = mergePreferences(DEFAULT_PREFERENCES, {
      companionCharacter: 'kuco',
      companionCharacterVersion: 999,
    })
    assert.equal(selected.companionCharacter, 'kuco')
    assert.equal(selected.companionCharacterVersion, 1)
    assert.equal(
      mergePreferences(selected, { companionCharacterVersion: null })
        .companionCharacter,
      'kuco',
    )
  })

  it('migrates legacy motion choices without discarding reduced motion', () => {
    for (const [legacy, expected] of [
      [true, 'reduced'],
      [false, 'system'],
      [undefined, 'system'],
      ['false', 'system'],
    ]) {
      const preferences = normalizePreferences({ reducedMotion: legacy })
      assert.equal(preferences.motionPreference, expected)
      assert.equal(preferences.reducedMotion, expected === 'reduced')
      assert.deepEqual(
        normalizePreferences(JSON.parse(JSON.stringify(preferences))),
        preferences,
      )
    }
  })

  it('resolves each motion mode against both system preferences', () => {
    for (const [mode, systemReduced, expected] of [
      ['system', false, false],
      ['system', true, true],
      ['full', false, false],
      ['full', true, false],
      ['reduced', false, true],
      ['reduced', true, true],
    ]) {
      assert.equal(
        resolveMotionPolicy({ motionPreference: mode }, systemReduced),
        expected,
        `${mode} with systemReduced=${systemReduced}`,
      )
    }
    assert.equal(resolveMotionPolicy({ reducedMotion: true }, false), true)
    assert.equal(resolveMotionPolicy(null, true), true)
    assert.equal(resolveMotionPolicy(null, 'false'), false)
  })

  it('shares the same policy with browser renderers without requiring Node', () => {
    const context = vm.createContext({ window: {} })
    vm.runInContext(
      readFileSync(path.join(__dirname, 'motion-policy.js'), 'utf8'),
      context,
    )
    const browserPolicy = context.FocusBuddyMotion
    assert.equal(typeof browserPolicy.resolveMotionPreference, 'function')
    for (const preferences of [
      null,
      { reducedMotion: true },
      { motionPreference: 'full', reducedMotion: true },
      { motionPreference: 'reduced', reducedMotion: false },
      { motionPreference: 'system' },
      { motionPreference: 'invalid' },
    ]) {
      for (const systemReduced of [true, false]) {
        assert.equal(
          browserPolicy.resolveMotionPolicy(preferences, systemReduced),
          resolveMotionPolicy(preferences, systemReduced),
        )
      }
    }
    assert.equal(
      browserPolicy.resolveMotionPreference({ reducedMotion: true }),
      'reduced',
    )
  })

  it('keeps an explicit motion mode authoritative over a stale legacy flag', () => {
    const full = normalizePreferences({
      motionPreference: 'full',
      reducedMotion: true,
    })
    assert.equal(full.motionPreference, 'full')
    assert.equal(full.reducedMotion, false)
    assert.equal(resolveMotionPolicy(full, true), false)
    const reduced = normalizePreferences({
      motionPreference: 'reduced',
      reducedMotion: false,
    })
    assert.equal(reduced.reducedMotion, true)
    assert.equal(resolveMotionPolicy(reduced, false), true)
  })

  it('updates the mode when a legacy client changes the compatibility flag', () => {
    const full = normalizePreferences({ motionPreference: 'full' })
    const reduced = mergePreferences(full, { reducedMotion: true })
    assert.equal(reduced.motionPreference, 'reduced')
    assert.equal(reduced.reducedMotion, true)
    const system = mergePreferences(reduced, { reducedMotion: false })
    assert.equal(system.motionPreference, 'system')
    assert.equal(system.reducedMotion, false)
    assert.equal(resolveMotionPolicy(system, true), true)
  })

  it('prioritizes an explicit mode when a patch also contains the legacy flag', () => {
    const full = mergePreferences(DEFAULT_PREFERENCES, {
      motionPreference: 'full',
      reducedMotion: true,
    })
    assert.equal(full.motionPreference, 'full')
    assert.equal(full.reducedMotion, false)
    const reduced = mergePreferences(full, {
      motionPreference: 'reduced',
      reducedMotion: false,
    })
    assert.equal(reduced.motionPreference, 'reduced')
    assert.equal(reduced.reducedMotion, true)
  })

  it('preserves a mode through unrelated or malformed partial updates', () => {
    const full = normalizePreferences({ motionPreference: 'full' })
    for (const patch of [
      { compactMode: true },
      { motionPreference: 'sometimes' },
      { motionPreference: null, reducedMotion: 'yes' },
    ]) {
      const updated = mergePreferences(full, patch)
      assert.equal(updated.motionPreference, 'full')
      assert.equal(updated.reducedMotion, false)
    }
    assert.equal(
      normalizePreferences({ motionPreference: 'invalid', reducedMotion: true })
        .motionPreference,
      'reduced',
    )
  })
})

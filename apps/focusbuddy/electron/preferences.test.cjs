const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
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
})

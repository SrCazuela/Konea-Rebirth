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
        companionScale: 'huge',
        companionPosition: { x: '10', y: 20 },
      }),
      DEFAULT_PREFERENCES,
    )
  })

  it('normalizes a valid companion position and supported scale', () => {
    const preferences = normalizePreferences({
      companionEnabled: false,
      companionScale: 'large',
      companionPosition: { x: 10.4, y: -20.7 },
      notificationsEnabled: true,
    })

    assert.equal(preferences.companionEnabled, false)
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
})

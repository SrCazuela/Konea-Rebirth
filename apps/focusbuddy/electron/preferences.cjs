const {
  resolveMotionPreference,
  resolveMotionPolicy,
} = require('./motion-policy.js')

const COMPANION_SCALES = new Set(['small', 'medium', 'large'])
const COMPANION_CHARACTERS = new Set(['kuco', 'chibi'])
const COMPANION_CHARACTER_VERSION = 1

const DEFAULT_PREFERENCES = Object.freeze({
  companionEnabled: true,
  companionAlwaysOnTop: true,
  companionCharacter: 'chibi',
  companionCharacterVersion: COMPANION_CHARACTER_VERSION,
  companionScale: 'medium',
  compactMode: false,
  closeToTray: true,
  launchAtLogin: false,
  notificationsEnabled: false,
  motionPreference: 'system',
  reducedMotion: false,
  companionPosition: null,
})

function finiteInteger(value) {
  return Number.isFinite(value) ? Math.round(value) : null
}

function normalizePosition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const x = finiteInteger(value.x)
  const y = finiteInteger(value.y)
  return x === null || y === null ? null : { x, y }
}

function normalizePreferences(value) {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  // Keep an existing accessibility choice when migrating legacy files. Once
  // a mode exists, it is authoritative over the compatibility boolean.
  const motionPreference = resolveMotionPreference(candidate)

  return {
    companionEnabled:
      typeof candidate.companionEnabled === 'boolean'
        ? candidate.companionEnabled
        : DEFAULT_PREFERENCES.companionEnabled,
    companionAlwaysOnTop:
      typeof candidate.companionAlwaysOnTop === 'boolean'
        ? candidate.companionAlwaysOnTop
        : DEFAULT_PREFERENCES.companionAlwaysOnTop,
    // Legacy files stored Kuco even when the user had never selected it.
    // Migrate once; versioned files preserve every subsequent explicit choice.
    companionCharacter:
      candidate.companionCharacterVersion === COMPANION_CHARACTER_VERSION &&
      COMPANION_CHARACTERS.has(candidate.companionCharacter)
        ? candidate.companionCharacter
        : DEFAULT_PREFERENCES.companionCharacter,
    companionCharacterVersion: COMPANION_CHARACTER_VERSION,
    companionScale: COMPANION_SCALES.has(candidate.companionScale)
      ? candidate.companionScale
      : DEFAULT_PREFERENCES.companionScale,
    compactMode:
      typeof candidate.compactMode === 'boolean'
        ? candidate.compactMode
        : DEFAULT_PREFERENCES.compactMode,
    closeToTray:
      typeof candidate.closeToTray === 'boolean'
        ? candidate.closeToTray
        : DEFAULT_PREFERENCES.closeToTray,
    launchAtLogin:
      typeof candidate.launchAtLogin === 'boolean'
        ? candidate.launchAtLogin
        : DEFAULT_PREFERENCES.launchAtLogin,
    notificationsEnabled:
      typeof candidate.notificationsEnabled === 'boolean'
        ? candidate.notificationsEnabled
        : DEFAULT_PREFERENCES.notificationsEnabled,
    motionPreference,
    reducedMotion: motionPreference === 'reduced',
    companionPosition: normalizePosition(candidate.companionPosition),
  }
}

function mergePreferences(current, patch) {
  const safeCurrent = normalizePreferences(current)
  const safePatch =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const allowedPatch = {}

  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (key !== 'companionCharacterVersion' && Object.hasOwn(safePatch, key))
      allowedPatch[key] = safePatch[key]
  }

  if (
    resolveMotionPreference({
      motionPreference: allowedPatch.motionPreference,
    }) !== allowedPatch.motionPreference
  ) {
    // Older clients still send only reducedMotion. Treat that as a deliberate
    // change without allowing unrelated or malformed updates to reset a mode.
    allowedPatch.motionPreference =
      typeof allowedPatch.reducedMotion === 'boolean'
        ? allowedPatch.reducedMotion
          ? 'reduced'
          : 'system'
        : safeCurrent.motionPreference
  }

  return normalizePreferences({ ...safeCurrent, ...allowedPatch })
}

module.exports = {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
  resolveMotionPolicy,
}

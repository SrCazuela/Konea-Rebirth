const COMPANION_SCALES = new Set(['small', 'medium', 'large'])

const DEFAULT_PREFERENCES = Object.freeze({
  companionEnabled: true,
  companionAlwaysOnTop: true,
  companionScale: 'medium',
  compactMode: false,
  closeToTray: true,
  launchAtLogin: false,
  notificationsEnabled: false,
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

  return {
    companionEnabled:
      typeof candidate.companionEnabled === 'boolean'
        ? candidate.companionEnabled
        : DEFAULT_PREFERENCES.companionEnabled,
    companionAlwaysOnTop:
      typeof candidate.companionAlwaysOnTop === 'boolean'
        ? candidate.companionAlwaysOnTop
        : DEFAULT_PREFERENCES.companionAlwaysOnTop,
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
    reducedMotion:
      typeof candidate.reducedMotion === 'boolean'
        ? candidate.reducedMotion
        : DEFAULT_PREFERENCES.reducedMotion,
    companionPosition: normalizePosition(candidate.companionPosition),
  }
}

function mergePreferences(current, patch) {
  const safeCurrent = normalizePreferences(current)
  const safePatch =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const allowedPatch = {}

  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (Object.hasOwn(safePatch, key)) allowedPatch[key] = safePatch[key]
  }

  return normalizePreferences({ ...safeCurrent, ...allowedPatch })
}

module.exports = {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
}

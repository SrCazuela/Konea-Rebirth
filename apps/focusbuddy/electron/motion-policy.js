;(function installMotionPolicy(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (typeof window === 'object' || typeof module === 'undefined')
    root.FocusBuddyMotion = api
})(typeof globalThis === 'object' ? globalThis : this, function motionPolicy() {
  'use strict'

  const MODES = new Set(['system', 'full', 'reduced'])

  function resolveMotionPreference(value) {
    const candidate =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    if (MODES.has(candidate.motionPreference)) return candidate.motionPreference
    return candidate.reducedMotion === true ? 'reduced' : 'system'
  }

  function resolveMotionPolicy(value, systemReduced = false) {
    const mode = resolveMotionPreference(value)
    if (mode === 'full') return false
    if (mode === 'reduced') return true
    return systemReduced === true
  }

  return Object.freeze({ resolveMotionPreference, resolveMotionPolicy })
})

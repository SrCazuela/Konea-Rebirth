;(function installAnimationController(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  // Keep the browser entry available when a web bundler wraps this UMD file
  // in CommonJS; Node's unit tests still receive only the module export.
  if (typeof window === 'object' || typeof module === 'undefined')
    root.FocusBuddyAnimation = api
})(typeof globalThis === 'object' ? globalThis : this, function animationApi() {
  'use strict'

  function duration(value, fallback) {
    return Number.isFinite(value) && value > 0
      ? Math.max(1, Math.round(value))
      : fallback
  }

  function normalizeFrames(source, fallbackDuration) {
    return (Array.isArray(source) ? source : []).flatMap((entry) => {
      if (entry === undefined || entry === null) return []
      const descriptor =
        typeof entry === 'object' && Object.hasOwn(entry, 'frame')
          ? entry
          : { frame: entry }
      return [
        {
          frame: descriptor.frame,
          durationMs: duration(descriptor.durationMs, fallbackDuration),
        },
      ]
    })
  }

  function normalizeAnimation(source) {
    const frames = normalizeFrames(source?.frames, 900)
    if (frames.length === 0)
      throw new TypeError('An avatar state needs a frame')
    const blinkFrames = normalizeFrames(source?.blink?.frames, 95)
    const minimum = duration(source?.blink?.minDelayMs, 3_200)
    return {
      frames,
      blink:
        blinkFrames.length === 0
          ? null
          : {
              frames: blinkFrames,
              minDelayMs: minimum,
              maxDelayMs: Math.max(
                minimum,
                duration(source.blink.maxDelayMs, 6_400),
              ),
              doubleBlinkChance: Number.isFinite(source.blink.doubleBlinkChance)
                ? Math.min(1, Math.max(0, source.blink.doubleBlinkChance))
                : 0.12,
              betweenBlinksMs: duration(source.blink.betweenBlinksMs, 140),
            },
    }
  }

  function createAnimator(options) {
    if (!options || typeof options.onFrame !== 'function') {
      throw new TypeError('An avatar animator needs an onFrame callback')
    }
    const animations = new Map(
      Object.entries(options.animations ?? {}).map(([key, value]) => [
        key,
        normalizeAnimation(value),
      ]),
    )
    if (animations.size === 0) throw new TypeError('No avatar animations found')
    const fallbackState = animations.has(options.initialState)
      ? options.initialState
      : animations.keys().next().value
    const setTimer =
      options.setTimeout ??
      ((callback, delay) => globalThis.setTimeout(callback, delay))
    const clearTimer =
      options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer))
    const random = options.random ?? Math.random
    let state = fallbackState
    let enabled = options.enabled !== false
    let visible = options.visible !== false
    let reducedMotion = options.reducedMotion === true
    let frameIndex = 0
    let blinkIndex = -1
    let blinking = false
    let remainingBlinks = 0
    let frameTimer = null
    let blinkTimer = null
    let disposed = false

    function currentAnimation() {
      return animations.get(state)
    }

    function canAnimate() {
      return !disposed && enabled && visible && !reducedMotion
    }

    function getSnapshot() {
      const animation = currentAnimation()
      return Object.freeze({
        state,
        frame: blinking
          ? animation.blink.frames[blinkIndex].frame
          : animation.frames[frameIndex].frame,
        frameIndex,
        blinkIndex,
        blinking,
        enabled,
        visible,
        reducedMotion,
        disposed,
      })
    }

    function emitFrame() {
      options.onFrame(getSnapshot())
    }

    function clearTimers() {
      if (frameTimer !== null) clearTimer(frameTimer)
      if (blinkTimer !== null) clearTimer(blinkTimer)
      frameTimer = null
      blinkTimer = null
    }

    function randomUnit() {
      const value = random()
      return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5
    }

    function scheduleFrame() {
      const animation = currentAnimation()
      if (!canAnimate() || blinking || animation.frames.length < 2) return
      frameTimer = setTimer(() => {
        frameTimer = null
        if (!canAnimate() || blinking) return
        frameIndex = (frameIndex + 1) % currentAnimation().frames.length
        emitFrame()
        scheduleFrame()
      }, animation.frames[frameIndex].durationMs)
    }

    function scheduleBlink() {
      const blink = currentAnimation().blink
      if (!canAnimate() || !blink) return
      const delay =
        blink.minDelayMs +
        Math.round(randomUnit() * (blink.maxDelayMs - blink.minDelayMs))
      blinkTimer = setTimer(() => {
        blinkTimer = null
        if (!canAnimate()) return
        remainingBlinks = randomUnit() < blink.doubleBlinkChance ? 2 : 1
        beginBlink()
      }, delay)
    }

    function beginBlink() {
      if (!canAnimate() || !currentAnimation().blink) return
      if (frameTimer !== null) clearTimer(frameTimer)
      frameTimer = null
      blinking = true
      blinkIndex = 0
      remainingBlinks -= 1
      emitFrame()
      scheduleBlinkFrame()
    }

    function scheduleBlinkFrame() {
      const blink = currentAnimation().blink
      blinkTimer = setTimer(() => {
        blinkTimer = null
        if (!canAnimate()) return
        blinkIndex += 1
        if (blinkIndex < blink.frames.length) {
          emitFrame()
          scheduleBlinkFrame()
          return
        }
        // Blinks are an overlay, not one more movement frame. Always restore
        // the open frame before a double blink, the next pose, or another wait.
        blinking = false
        blinkIndex = -1
        emitFrame()
        if (remainingBlinks > 0) {
          blinkTimer = setTimer(() => {
            blinkTimer = null
            beginBlink()
          }, blink.betweenBlinksMs)
        } else {
          scheduleFrame()
          scheduleBlink()
        }
      }, blink.frames[blinkIndex].durationMs)
    }

    function resetAnimation() {
      clearTimers()
      frameIndex = 0
      blinkIndex = -1
      blinking = false
      remainingBlinks = 0
      emitFrame()
      scheduleFrame()
      scheduleBlink()
    }

    function update(next = {}) {
      if (disposed) return getSnapshot()
      const nextState = Object.hasOwn(next, 'state')
        ? animations.has(next.state)
          ? next.state
          : fallbackState
        : state
      const nextEnabled = Object.hasOwn(next, 'enabled')
        ? next.enabled !== false
        : enabled
      const nextVisible = Object.hasOwn(next, 'visible')
        ? next.visible !== false
        : visible
      const nextReduced = Object.hasOwn(next, 'reducedMotion')
        ? next.reducedMotion === true
        : reducedMotion
      if (
        nextState === state &&
        nextEnabled === enabled &&
        nextVisible === visible &&
        nextReduced === reducedMotion
      ) {
        return getSnapshot()
      }
      state = nextState
      enabled = nextEnabled
      visible = nextVisible
      reducedMotion = nextReduced
      resetAnimation()
      return getSnapshot()
    }

    function dispose() {
      if (disposed) return
      disposed = true
      clearTimers()
      frameIndex = 0
      blinkIndex = -1
      blinking = false
      remainingBlinks = 0
      emitFrame()
    }

    resetAnimation()
    return Object.freeze({ update, getSnapshot, dispose })
  }

  return Object.freeze({ createAnimator })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  navigationScrollBehavior,
  portalScrollBehavior,
} from './navigation-accessibility'

afterEach(() => vi.unstubAllGlobals())

describe('accessible section navigation', () => {
  it('never animates explicit scrolling when Windows requests reduced motion', () => {
    expect(navigationScrollBehavior(true, true)).toBe('instant')
    expect(navigationScrollBehavior(false, true)).toBe('instant')
  })

  it('honors the app pause independently of the Windows preference', () => {
    expect(navigationScrollBehavior(false, false)).toBe('instant')
    expect(navigationScrollBehavior(true, false)).toBe('smooth')
  })

  it('keeps history restoration immediate even when animation is enabled', () => {
    expect(navigationScrollBehavior(true, false, false)).toBe('instant')
  })

  it('reads settings again when a queued scroll runs after the app is paused', () => {
    let motion = 'on'
    vi.stubGlobal('document', {
      querySelector: () => ({ getAttribute: () => motion }),
    })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(portalScrollBehavior()).toBe('smooth')
    motion = 'off'
    expect(portalScrollBehavior()).toBe('instant')
  })

  it('respects changes in the system preference for later chat autoscrolls', () => {
    let reduced = false
    vi.stubGlobal('document', {
      querySelector: () => ({ getAttribute: () => 'on' }),
    })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
    expect(portalScrollBehavior()).toBe('smooth')
    reduced = true
    expect(portalScrollBehavior()).toBe('instant')
  })

  it('still honors reduced motion when used without a portal shell', () => {
    vi.stubGlobal('document', { querySelector: () => null })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(portalScrollBehavior()).toBe('instant')
  })
})

import { describe, expect, it } from 'vitest'
import { canonicalizeAssistantHash } from './assistant-navigation'

describe('KUCO saved links', () => {
  it('preserves the conversation or requests destination of previous links', () => {
    expect(canonicalizeAssistantHash('#duco')).toBe('#kuco')
    expect(canonicalizeAssistantHash('#duco-requests')).toBe('#kuco-requests')
  })

  it('keeps current and unrelated routes unchanged', () => {
    for (const hash of [
      '#kuco',
      '#kuco-requests',
      '#feed',
      '#chat',
      '#profile',
    ]) {
      expect(canonicalizeAssistantHash(hash)).toBe(hash)
    }
  })

  it('does not rewrite partial matches or unexpected link formats', () => {
    for (const hash of ['#duco-requests-extra', '#duco/requests', 'duco:123']) {
      expect(canonicalizeAssistantHash(hash)).toBe(hash)
    }
  })
})

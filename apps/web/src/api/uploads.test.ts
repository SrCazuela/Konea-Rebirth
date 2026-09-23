import { afterEach, describe, expect, it, vi } from 'vitest'
import { absoluteUploadUrl, safeExternalUrl } from './uploads'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('URL helpers', () => {
  it('only accepts credential-free HTTPS links or local HTTP', () => {
    expect(safeExternalUrl('https://example.com/project')).toBe(
      'https://example.com/project',
    )
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,unsafe')).toBeNull()
    expect(safeExternalUrl('http://example.com/unsafe')).toBeNull()
    expect(safeExternalUrl('https://user:secret@example.com')).toBeNull()
    expect(safeExternalUrl('/relative')).toBeNull()
  })

  it('resolves upload paths while rejecting active or local protocols', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:5173' },
    })

    const localPath =
      '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.png'
    expect(absoluteUploadUrl(localPath)).toBe(
      `http://localhost:5173${localPath}`,
    )
    expect(absoluteUploadUrl('https://cdn.example.com/avatar.png')).toBe(
      'https://cdn.example.com/avatar.png',
    )
    expect(absoluteUploadUrl('javascript:alert(1)')).toBe('')
    expect(absoluteUploadUrl('file:///C:/secret.txt')).toBe('')
    expect(absoluteUploadUrl('/api/v1/uploads/files/../secret.png')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import {
  isFocusBuddyDesktopRuntime,
  normalizeFocusBuddyDownloadUrl,
} from './focusbuddy-download'

describe('normalizeFocusBuddyDownloadUrl', () => {
  it('accepts and normalizes an HTTPS release asset', () => {
    expect(
      normalizeFocusBuddyDownloadUrl(
        '  https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe  ',
      ),
    ).toBe(
      'https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe',
    )
  })

  it.each([
    undefined,
    null,
    '',
    '/downloads/focusbuddy.exe',
    'http://localhost/focusbuddy.exe',
    'http://downloads.example/focusbuddy.exe',
    'javascript:alert(1)',
    'file:///C:/focusbuddy.exe',
    'https://user:password@downloads.example/focusbuddy.exe',
    'https://downloads.example/focusbuddy.exe?token=secret',
    'https://downloads.example/focusbuddy.exe#temporary-link',
  ])('rejects an unsafe or unpublished value: %s', (value) => {
    expect(normalizeFocusBuddyDownloadUrl(value)).toBeNull()
  })
})

describe('isFocusBuddyDesktopRuntime', () => {
  it('recognizes the bridge exposed by the installed Electron client', () => {
    expect(isFocusBuddyDesktopRuntime({ platform: 'win32' })).toBe(true)
  })

  it('keeps the download call to action visible in a regular browser', () => {
    expect(isFocusBuddyDesktopRuntime(undefined)).toBe(false)
    expect(isFocusBuddyDesktopRuntime(null)).toBe(false)
  })
})

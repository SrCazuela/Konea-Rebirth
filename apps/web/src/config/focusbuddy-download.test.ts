import { describe, expect, it } from 'vitest'
import {
  getFocusBuddyDesktopChannel,
  getFocusBuddyLaunchUrl,
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

  it('accepts a versioned official release without changing the asset', () => {
    const url =
      'https://github.com/SrCazuela/Konea-Rebirth/releases/download/focusbuddy-v0.1.1/Konea-FocusBuddy-Windows-x64.exe'
    expect(normalizeFocusBuddyDownloadUrl(url)).toBe(url)
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
    'https://localhost/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe',
    'https://github.com.evil.example/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe',
    'https://github.com:8443/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe',
    'https://github.com/another-owner/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe',
    'https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Local-0.1.1-x64.exe',
    'https://github.com/SrCazuela/Konea-Rebirth/blob/main/Konea-FocusBuddy-Windows-x64.exe',
    'https://github.com/SrCazuela/Konea-Rebirth/releases/latest/download/Konea-FocusBuddy-Windows-x64.exe?token=secret',
  ])('rejects an unsafe or unpublished value: %s', (value) => {
    expect(normalizeFocusBuddyDownloadUrl(value)).toBeNull()
  })
})

describe('FocusBuddy desktop channels', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    '127.0.0.1',
    '::1',
    '[::1]',
  ])(
    'opens the separate local client on loopback host %s, including production previews',
    (hostname) => {
      expect(getFocusBuddyDesktopChannel(hostname)).toBe('local')
      expect(getFocusBuddyLaunchUrl(hostname)).toBe(
        'konea-focusbuddy-local://open',
      )
    },
  )

  it.each([
    'konea-campus-connect.divine-mule-7232.chatgpt.site',
    'preview.chatgpt.site',
    'localhost.evil.example',
    '192.168.1.5',
    '',
  ])(
    'reserves the official protocol for non-loopback origins: %s',
    (hostname) => {
      expect(getFocusBuddyDesktopChannel(hostname)).toBe('production')
      expect(getFocusBuddyLaunchUrl(hostname)).toBe('konea-focusbuddy://open')
    },
  )

  it('never includes an account, token, API endpoint or arbitrary input in the launch URL', () => {
    const untrustedHost = 'localhost?token=private&api=http://localhost:3000'
    expect(getFocusBuddyLaunchUrl(untrustedHost)).toBe(
      'konea-focusbuddy://open',
    )
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

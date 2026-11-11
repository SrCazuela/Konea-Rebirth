const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  DEFAULT_API_BASE_URL,
  apiBaseUrlFromAppUrl,
  buildApiUrl,
  normalizeApiBaseUrl,
  normalizeChannelApiUrl,
  selectApiBaseUrl,
} = require('./api-url.cjs')

describe('FocusBuddy API URL', () => {
  it('accepts HTTPS and exact loopback HTTP endpoints', () => {
    assert.equal(
      normalizeApiBaseUrl('https://api.konea.example/api/v1/'),
      'https://api.konea.example/api/v1',
    )
    assert.equal(
      normalizeApiBaseUrl('http://localhost:3000/api/v1/'),
      DEFAULT_API_BASE_URL,
    )
    assert.equal(
      normalizeApiBaseUrl('http://127.0.0.1:3000/api/v1'),
      'http://127.0.0.1:3000/api/v1',
    )
    assert.equal(
      normalizeApiBaseUrl('http://[::1]:3000/api/v1'),
      'http://[::1]:3000/api/v1',
    )
  })

  it('rejects credentials, ambiguous suffixes and unsafe protocols', () => {
    assert.throws(() =>
      normalizeApiBaseUrl('https://user:secret@api.konea.example/api/v1'),
    )
    assert.throws(() =>
      normalizeApiBaseUrl('https://api.konea.example/api/v1?token=secret'),
    )
    assert.throws(() =>
      normalizeApiBaseUrl('https://api.konea.example/api/v1#secret'),
    )
    assert.throws(() =>
      normalizeApiBaseUrl('http://localhost.evil.example:3000/api/v1'),
    )
    assert.throws(() => normalizeApiBaseUrl('file:///C:/konea/api/v1'))
  })

  it('derives the same-origin API root from a trusted web URL', () => {
    assert.equal(
      apiBaseUrlFromAppUrl(
        'https://konea.example/portal?ignored=true#focusbuddy',
      ),
      'https://konea.example/api/v1',
    )
    assert.equal(
      apiBaseUrlFromAppUrl('http://localhost:5173/#focusbuddy'),
      'http://localhost:5173/api/v1',
    )
  })

  it('only builds resource URLs contained by the configured API base', () => {
    assert.equal(
      buildApiUrl(
        'https://konea.example/api/v1',
        '/study/overview?timeZone=America%2FSantiago',
      ),
      'https://konea.example/api/v1/study/overview?timeZone=America%2FSantiago',
    )
    assert.throws(() =>
      buildApiUrl('https://konea.example/api/v1', '//malicious.example/path'),
    )
    assert.throws(() =>
      buildApiUrl('https://konea.example/api/v1', '/../auth/login'),
    )
    assert.throws(() =>
      buildApiUrl('https://konea.example/api/v1', '/auth/login#secret'),
    )
  })

  it('locks packaged selection to its channel and fails closed without valid configuration', () => {
    assert.equal(
      selectApiBaseUrl({
        isPackaged: true,
        channel: 'production',
        commandLineValue: 'https://phishing.example/api/v1',
        environmentValue: 'https://other.example/api/v1',
        packagedValue: 'https://api.konea.example/api/v1/',
      }),
      'https://api.konea.example/api/v1',
    )
    assert.throws(() =>
      selectApiBaseUrl({
        isPackaged: true,
        channel: 'production',
        commandLineValue: 'https://phishing.example/api/v1',
        packagedValue: 'http://unsafe.example/api/v1',
        appUrl: 'https://konea.example/#focusbuddy',
      }),
    )
    assert.throws(() =>
      selectApiBaseUrl({ isPackaged: true, channel: 'production' }),
    )
    assert.equal(selectApiBaseUrl({}), DEFAULT_API_BASE_URL)
    assert.equal(
      selectApiBaseUrl({
        packagedValue: 'https://previous-build.example/api/v1',
      }),
      DEFAULT_API_BASE_URL,
    )
    assert.throws(() =>
      selectApiBaseUrl({ environmentValue: 'https://remote.example/api/v1' }),
    )
  })

  it('keeps local endpoints on loopback and official endpoints on public HTTPS', () => {
    assert.equal(
      normalizeChannelApiUrl('http://localhost:3010/api/v1', 'local'),
      'http://localhost:3010/api/v1',
    )
    assert.equal(
      normalizeChannelApiUrl('https://api.konea.example/api/v1', 'production'),
      'https://api.konea.example/api/v1',
    )
    assert.throws(() =>
      normalizeChannelApiUrl('https://api.konea.example/api/v1', 'local'),
    )
    for (const unsafe of [
      'http://api.konea.example/api/v1',
      'https://localhost:3000/api/v1',
      'https://127.0.0.2/api/v1',
      'https://192.168.0.1/api/v1',
      'https://10.0.0.1/api/v1',
      'https://[::1]/api/v1',
      'https://[fc00::1]/api/v1',
      'https://service.local/api/v1',
      'https://localhost.evil.local/api/v1',
      'https://api/api/v1',
    ])
      assert.throws(() => normalizeChannelApiUrl(unsafe, 'production'))
  })
})

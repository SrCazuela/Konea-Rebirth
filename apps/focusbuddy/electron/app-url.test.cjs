const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  DEFAULT_APP_URL,
  isSafeExternalUrl,
  normalizeAppUrl,
  selectAppUrl,
} = require('./app-url.cjs')

describe('FocusBuddy app URL', () => {
  it('accepts HTTPS deployments and forces the FocusBuddy route', () => {
    assert.equal(
      normalizeAppUrl(
        'https://konea.example/portal?temporary_token=secret#chat',
      ),
      'https://konea.example/portal#focusbuddy',
    )
  })

  it('accepts HTTP only for local development', () => {
    assert.equal(
      normalizeAppUrl('http://localhost:5173/'),
      'http://localhost:5173/#focusbuddy',
    )
    assert.equal(
      normalizeAppUrl('http://[::1]:5173/'),
      'http://[::1]:5173/#focusbuddy',
    )
    assert.throws(() => normalizeAppUrl('http://konea.example/'))
    assert.throws(() => normalizeAppUrl('http://localhost.evil.example/'))
  })

  it('rejects unsafe protocols and embedded credentials', () => {
    assert.throws(() => normalizeAppUrl('javascript:alert(1)'))
    assert.throws(() => normalizeAppUrl('file:///C:/secreto.txt'))
    assert.throws(() => normalizeAppUrl('https://user:secret@konea.example/'))
  })

  it('only opens HTTPS or local HTTP links in the system browser', () => {
    assert.equal(isSafeExternalUrl('https://duoc.cl/ayuda'), true)
    assert.equal(isSafeExternalUrl('http://localhost:5173/ayuda'), true)
    assert.equal(isSafeExternalUrl('http://example.test/'), false)
    assert.equal(isSafeExternalUrl('file:///C:/secreto.txt'), false)
  })

  it('locks packaged builds to their baked public endpoint', () => {
    assert.equal(
      selectAppUrl({
        isPackaged: true,
        commandLineValue: 'https://phishing.example',
        environmentValue: 'https://other-phishing.example',
        packagedValue: 'https://konea.example/app',
      }),
      'https://konea.example/app#focusbuddy',
    )
    assert.equal(
      selectAppUrl({
        isPackaged: true,
        commandLineValue: 'https://phishing.example',
        environmentValue: 'https://other-phishing.example',
        packagedValue: 'http://unsafe.example',
      }),
      DEFAULT_APP_URL,
    )
  })

  it('keeps safe endpoint overrides available during development', () => {
    assert.equal(
      selectAppUrl({
        isPackaged: false,
        commandLineValue: 'https://preview.konea.example',
        environmentValue: 'https://ignored.example',
        packagedValue: null,
      }),
      'https://preview.konea.example/#focusbuddy',
    )
  })
})

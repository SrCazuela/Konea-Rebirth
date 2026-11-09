const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { describe, it } = require('node:test')
const path = require('node:path')
const vm = require('node:vm')

const desktopHtml = readFileSync(path.join(__dirname, 'desktop.html'), 'utf8')
const desktopCss = readFileSync(path.join(__dirname, 'desktop.css'), 'utf8')
const desktopJavaScript = readFileSync(
  path.join(__dirname, 'desktop.js'),
  'utf8',
)
const avatarLibrary = require('./avatar-library.js')

describe('FocusBuddy local desktop renderer', () => {
  it('parses as standalone JavaScript', () => {
    assert.doesNotThrow(() => new vm.Script(desktopJavaScript))
  })

  it('uses a strict local-only content security policy', () => {
    assert.match(desktopHtml, /default-src 'none'/)
    assert.match(desktopHtml, /script-src 'self'/)
    assert.match(desktopHtml, /style-src 'self'/)
    assert.match(desktopHtml, /img-src 'self'/)
    assert.match(desktopHtml, /connect-src 'none'/)
    assert.match(desktopHtml, /object-src 'none'/)
    assert.match(desktopHtml, /base-uri 'none'/)
    assert.match(desktopHtml, /form-action 'none'/)
    assert.doesNotMatch(desktopHtml, /unsafe-inline|unsafe-eval/)
    assert.doesNotMatch(desktopHtml, /<script(?![^>]*\bsrc=)/i)
  })

  it('does not use HTML parsing sinks for API or account data', () => {
    assert.doesNotMatch(
      desktopJavaScript,
      /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write/,
    )
    assert.match(desktopJavaScript, /\.textContent\s*=/)
    assert.match(desktopJavaScript, /replaceChildren/)
  })

  it('contains the complete local navigation and study controls', () => {
    for (const panel of ['study', 'progress', 'settings', 'account']) {
      assert.match(desktopHtml, new RegExp(`data-panel="${panel}"`))
      assert.match(desktopHtml, new RegExp(`data-tab="${panel}"`))
    }
    for (const method of [
      'pomodoro',
      'pomodoro_extended',
      'deep_work',
      'flowtime',
      'custom',
    ]) {
      assert.match(desktopHtml, new RegExp(`value="${method}"`))
    }
    assert.match(desktopHtml, /id="pause-button"/)
    assert.match(desktopHtml, /id="resume-button"/)
    assert.match(desktopHtml, /id="complete-button"/)
    assert.match(desktopHtml, /id="cancel-button"/)
  })

  it('uses the official chibi by default and keeps Kuco as a local option', () => {
    assert.match(desktopHtml, /data-character="chibi"/)
    assert.match(desktopHtml, /data-preference="companionCharacter"/)
    assert.match(desktopHtml, /Kuco · búho animado/)
    assert.match(desktopCss, /owl-shimeji-provisional\.png/)
    assert.match(desktopJavaScript, /companionCharacter: 'chibi'/)
    assert.doesNotMatch(desktopHtml, /data-character="kuco"/)
    assert.match(desktopHtml, /\.\/assets\/avatar-hq\/idle-1\.png/)
    assert.ok(
      avatarLibrary
        .sourcesForScene('typing')
        .includes('./assets/avatar-hq/typing-1.png'),
    )
    assert.ok(
      avatarLibrary
        .sourcesForScene('writingConcentrated')
        .includes('./assets/avatar-hq/writing-concentrated-1.png'),
    )
    assert.doesNotMatch(desktopHtml + desktopJavaScript, /avatar-official/)
    assert.doesNotMatch(desktopHtml + desktopJavaScript, /avatar-cutout/)
    assert.doesNotMatch(desktopHtml + desktopJavaScript, /https?:\/\//)
  })

  it('loads the shared animation engine and artist library before each renderer', () => {
    for (const [htmlFile, rendererFile] of [
      ['desktop.html', 'desktop.js'],
      ['companion.html', 'companion.js'],
    ]) {
      const html = readFileSync(path.join(__dirname, htmlFile), 'utf8')
      const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(
        (match) => path.basename(match[1]),
      )
      for (const dependency of ['avatar-animation.js', 'avatar-library.js']) {
        assert.ok(
          scripts.includes(dependency),
          `${htmlFile} omits ${dependency}`,
        )
        assert.ok(scripts.indexOf(dependency) < scripts.indexOf(rendererFile))
      }
      assert.ok(scripts.includes(rendererFile))
    }
  })

  it('does not draw circular ornaments behind either character', () => {
    assert.doesNotMatch(desktopHtml, /buddy-orbit|account-orbit/)
    assert.doesNotMatch(desktopCss, /\.buddy-orbit|\.account-orbit/)
  })

  it('keeps Kuco facing forward in the study card and blinks naturally', () => {
    assert.match(
      desktopJavaScript,
      /window\.FocusBuddyAnimation\.createAnimator/,
    )
    assert.match(
      desktopJavaScript,
      /avatarAnimations\.study\.update\(\{\s*state: character === 'kuco' \? 'kuco:idle'/,
    )
    assert.deepEqual(
      avatarLibrary.kuco.idle.frames.map(({ frame }) => frame),
      [0],
    )
    assert.deepEqual(
      avatarLibrary.kuco.idle.blink.frames.map(({ frame }) => frame),
      [1],
    )
    assert.ok(avatarLibrary.kuco.idle.blink.frames[0].durationMs < 200)
    assert.match(
      desktopCss,
      /\.buddy-card \.buddy-image\[data-character='kuco'\] \{\s*animation: none;/,
    )
  })

  it('targets the bounded preload contract', () => {
    for (const method of [
      'health',
      'getCurrentUser',
      'login',
      'logout',
      'getOverview',
      'getAcademic',
      'startSession',
      'transitionSession',
    ]) {
      assert.match(desktopJavaScript, new RegExp(`['"]${method}['"]`))
    }
    for (const method of [
      'getPreferences',
      'updatePreferences',
      'updateSessionState',
      'getConnectionInfo',
      'onPreferences',
    ]) {
      assert.match(desktopJavaScript, new RegExp(`bridge\\.${method}`))
    }
    assert.match(desktopJavaScript, /Object\.hasOwn\(result, 'ok'\)/)
    assert.match(
      desktopJavaScript,
      /if \(result\.ok === true\) return result\.data/,
    )
  })

  it('clears sensitive companion state and preserves ambiguous start ids', () => {
    assert.match(desktopJavaScript, /function clearSensitiveSession/)
    assert.match(desktopJavaScript, /sendDesktopSnapshot\('idle', true\)/)
    assert.match(desktopJavaScript, /sendDesktopSnapshot\('offline', true\)/)
    assert.match(desktopJavaScript, /state\.pendingStart\.clientRequestId/)
    assert.match(desktopJavaScript, /isAmbiguousStartError/)
    assert.match(desktopJavaScript, /window\.addEventListener\('pagehide'/)
  })

  it('provides compact layouts and reduced-motion behavior', () => {
    assert.match(desktopCss, /@media \(max-width: 410px\)/)
    assert.match(desktopCss, /@media \(max-width: 860px\)/)
    assert.match(desktopCss, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(desktopCss, /body\.reduce-motion/)
  })
})

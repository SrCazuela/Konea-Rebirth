const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const {
  UI_SCHEME,
  UI_ORIGIN,
  UI_CSP,
  UI_SCHEME_REGISTRATION,
  uiPageUrl,
  isTrustedUiPageUrl,
  resourceForUiUrl,
  createUiProtocolHandler,
  registerUiProtocolForSession,
} = require('./ui-protocol.cjs')
const { releaseIdentity } = require('./release-channel.cjs')
const manifest = require('./assets/avatar-hq/source-manifest.json')

describe('FocusBuddy bundled UI protocol', () => {
  it('trusts only its two exact internal pages and never grants CSP or fetch bypasses', () => {
    assert.equal(uiPageUrl('desktop'), `${UI_ORIGIN}/desktop.html`)
    assert.equal(uiPageUrl('companion'), `${UI_ORIGIN}/companion.html`)
    assert.equal(isTrustedUiPageUrl(uiPageUrl('desktop'), 'desktop'), true)
    assert.equal(isTrustedUiPageUrl(uiPageUrl('companion'), 'desktop'), false)
    assert.equal(
      isTrustedUiPageUrl('https://konea.example/desktop.html', 'desktop'),
      false,
    )
    assert.equal(
      isTrustedUiPageUrl(`${uiPageUrl('desktop')}#other`, 'desktop'),
      false,
    )
    assert.throws(() => uiPageUrl('../main.cjs'))
    assert.deepEqual(UI_SCHEME_REGISTRATION, {
      scheme: UI_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: false,
        corsEnabled: false,
        bypassCSP: false,
      },
    })
  })

  it('rejects traversal, hidden runtime files, external origins, suffixes and noncanonical paths before disk access', async () => {
    const reads = []
    const handler = createUiProtocolHandler({
      readResource: async (file) => {
        reads.push(file)
        return Buffer.from('unexpected')
      },
    })
    for (const url of [
      'file:///C:/Windows/win.ini',
      'https://api.konea.example/api/v1/auth/me',
      `${UI_SCHEME}://app.evil/desktop.html`,
      `${UI_SCHEME}://user@app/desktop.html`,
      `${UI_SCHEME}://app:8080/desktop.html`,
      `${UI_ORIGIN}/../desktop.html`,
      `${UI_ORIGIN}/assets/../../main.cjs`,
      `${UI_ORIGIN}/%2e%2e/desktop.html`,
      `${UI_ORIGIN}/assets%2favatar-hq/idle-1.png`,
      `${UI_ORIGIN}/assets\\avatar-hq\\idle-1.png`,
      `${UI_ORIGIN}/desktop.html?file=../../.env`,
      `${UI_ORIGIN}/desktop.html#fragment`,
      `${UI_ORIGIN}//desktop.html`,
      `${UI_ORIGIN}/main.cjs`,
      `${UI_ORIGIN}/preload.cjs`,
      `${UI_ORIGIN}/package.json`,
      `${UI_ORIGIN}/assets/avatar-hq/source-manifest.json`,
    ]) {
      assert.equal(resourceForUiUrl(url), null, url)
      const response = await handler({ url, method: 'GET' })
      assert.equal(response.status, 404, url)
      assert.equal(await response.text(), 'Not found')
    }
    assert.deepEqual(reads, [])
  })

  it('serves real packaged HTML, scripts, branding and all 35 sprites with strict MIME and response policies', async () => {
    const handler = createUiProtocolHandler()
    const fixtures = [
      ['desktop.html', 'text/html; charset=utf-8'],
      ['companion.html', 'text/html; charset=utf-8'],
      ['desktop.css', 'text/css; charset=utf-8'],
      ['desktop.js', 'text/javascript; charset=utf-8'],
      ['avatar-animation.js', 'text/javascript; charset=utf-8'],
      ['motion-policy.js', 'text/javascript; charset=utf-8'],
      ['assets/branding/konea-mark.svg', 'image/svg+xml'],
      ...manifest.files.map((asset) => [
        `assets/avatar-hq/${asset.local}`,
        'image/png',
      ]),
    ]
    for (const [file, mime] of fixtures) {
      const response = await handler({
        url: `${UI_ORIGIN}/${file}`,
        method: 'GET',
      })
      assert.equal(response.status, 200, file)
      assert.equal(response.headers.get('content-type'), mime)
      assert.equal(response.headers.get('content-security-policy'), UI_CSP)
      assert.equal(
        response.headers.get('cross-origin-opener-policy'),
        'same-origin',
      )
      assert.equal(
        response.headers.get('cross-origin-resource-policy'),
        'same-origin',
      )
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        await readFile(path.join(__dirname, file)),
      )
    }
  })

  it('supports HEAD without a body, blocks writes and hides file-system errors', async () => {
    let calls = 0
    const handler = createUiProtocolHandler({
      readResource: async () => {
        calls += 1
        return Buffer.from('source')
      },
    })
    const head = await handler({ url: uiPageUrl('desktop'), method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    const write = await handler({ url: uiPageUrl('desktop'), method: 'POST' })
    assert.equal(write.status, 405)
    assert.equal(write.headers.get('allow'), 'GET, HEAD')
    assert.equal(calls, 1)
    const failing = createUiProtocolHandler({
      readResource: async () => {
        throw new Error('C:/private/file or secret')
      },
    })
    const missing = await failing({ url: uiPageUrl('desktop'), method: 'GET' })
    assert.equal(missing.status, 404)
    assert.equal(await missing.text(), 'Not found')
  })

  it('registers the local-only handler separately on the session of each release channel', async () => {
    const sessions = []
    for (const channel of ['local', 'production']) {
      const registered = []
      const session = {
        partition: releaseIdentity(channel).partition,
        protocol: { handle: async (...args) => registered.push(args) },
      }
      await registerUiProtocolForSession(session)
      assert.equal(registered.length, 1)
      assert.equal(registered[0][0], UI_SCHEME)
      assert.equal(
        (await registered[0][1]({ url: uiPageUrl('desktop'), method: 'GET' }))
          .status,
        200,
      )
      sessions.push(session)
    }
    assert.notEqual(sessions[0].partition, sessions[1].partition)
    assert.notEqual(sessions[0].protocol, sessions[1].protocol)
  })
})

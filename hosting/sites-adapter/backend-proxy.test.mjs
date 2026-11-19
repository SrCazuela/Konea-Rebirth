import assert from 'node:assert/strict'
import test from 'node:test'
import {
  proxyBackend,
  sessionCookie,
  validateBackendOrigin,
} from './backend-proxy.mjs'

const environment = {
  KONEA_BACKEND_ORIGIN: 'https://konea-api-test.onrender.com',
  SITES_BACKEND_TOKEN: 'a'.repeat(48),
}
const site = 'https://konea.example.chatgpt.site'

test('only the configured Render HTTPS origin is accepted', () => {
  assert.equal(
    validateBackendOrigin(environment.KONEA_BACKEND_ORIGIN),
    environment.KONEA_BACKEND_ORIGIN,
  )
  for (const invalid of [
    'http://konea.onrender.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://konea.onrender.com.evil.example',
    'https://user:secret@konea.onrender.com',
    'https://konea.onrender.com/path',
    'https://konea.onrender.com?secret=value',
  ])
    assert.throws(() => validateBackendOrigin(invalid))
})

test('only the Konea cookie is forwarded, rejecting duplicate or invalid values', () => {
  assert.equal(
    sessionCookie(
      'chatgpt_secret=private; konea_session=abc_123-456; other=secret',
    ),
    'konea_session=abc_123-456',
  )
  assert.equal(sessionCookie('konea_session=one; konea_session=two'), null)
  assert.equal(sessionCookie('konea_session=abc,unknown=secret'), null)
})

test('streamed bodies and cookie responses preserve login without platform credentials', async () => {
  const request = new Request(`${site}/api/v1/auth/login?test=1`, {
    method: 'POST',
    headers: {
      origin: site,
      'content-type': 'application/json',
      cookie: 'platform_session=private; konea_session=abc123',
      authorization: 'Bearer platform-secret',
      'oai-authenticated-user-email': 'private@example.test',
      'x-konea-proxy-token': 'visitor-controlled',
      'x-forwarded-for': '1.2.3.4',
    },
    body: '{"username":"demo"}',
  })
  const response = await proxyBackend(
    request,
    environment,
    async (url, init) => {
      assert.equal(
        url,
        `${environment.KONEA_BACKEND_ORIGIN}/api/v1/auth/login?test=1`,
      )
      assert.equal(init.redirect, 'manual')
      assert.equal(init.headers.get('cookie'), 'konea_session=abc123')
      for (const key of [
        'authorization',
        'oai-authenticated-user-email',
        'x-forwarded-for',
      ]) {
        assert.equal(init.headers.get(key), null)
      }
      assert.equal(
        init.headers.get('x-konea-proxy-token'),
        environment.SITES_BACKEND_TOKEN,
      )
      assert.equal(await new Response(init.body).text(), '{"username":"demo"}')
      return new Response('{"ok":true}', {
        headers: {
          'content-type': 'application/json',
          'set-cookie':
            'konea_session=new123; Path=/; HttpOnly; Secure; SameSite=Lax',
        },
      })
    },
  )
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /^konea_session=new123;/)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { ok: true })
})

test('cross-origin writes never reach the backend', async () => {
  const response = await proxyBackend(
    new Request(`${site}/api/v1/posts`, {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: '{}',
    }),
    environment,
    () => {
      throw new Error('Must not be called')
    },
  )
  assert.equal(response.status, 403)
})

test('missing configuration returns an actionable error without leaking secrets', async () => {
  const response = await proxyBackend(new Request(`${site}/api/v1/auth/me`), {})
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'HOSTING_NOT_CONFIGURED')
})

test('backend failures and redirects do not leak credentials or redirect the visitor', async () => {
  const request = new Request(`${site}/api/v1/auth/me`)
  const unavailable = await proxyBackend(request, environment, () => {
    throw new Error('secret')
  })
  assert.equal(unavailable.status, 503)
  assert.ok(!(await unavailable.text()).includes('secret'))
  const redirect = await proxyBackend(request, environment, async () =>
    Response.redirect('https://evil.example'),
  )
  assert.equal(redirect.status, 502)
  assert.equal(redirect.headers.get('location'), null)
})

test('only secure, host-only Konea response cookies can reach the browser', async () => {
  for (const cookie of [
    'platform_session=secret; Secure; HttpOnly',
    'konea_session=value; Domain=onrender.com; Secure; HttpOnly',
    'konea_session=value; HttpOnly',
  ]) {
    const response = await proxyBackend(
      new Request(`${site}/api/v1/auth/me`),
      environment,
      async () => new Response('{}', { headers: { 'set-cookie': cookie } }),
    )
    assert.equal(response.headers.get('set-cookie'), null)
  }
})

test('images and HEAD replies retain status and file headers', async () => {
  const response = await proxyBackend(
    new Request(`${site}/api/v1/uploads/files/image.png`, { method: 'HEAD' }),
    environment,
    async () =>
      new Response(null, {
        status: 206,
        headers: {
          'content-type': 'image/png',
          'content-range': 'bytes 0-10/50',
        },
      }),
  )
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(response.headers.get('content-range'), 'bytes 0-10/50')
  assert.equal(await response.text(), '')
})

test('infrastructure HTML errors become a safe starting response without replaying writes', async () => {
  for (const status of [429, 502, 503, 504]) {
    let fetchCount = 0
    let cancelled = false
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `<html>Just a moment: ${environment.SITES_BACKEND_TOKEN}</html>`,
          ),
        )
      },
      cancel() {
        cancelled = true
      },
    })
    const response = await proxyBackend(
      new Request(`${site}/api/v1/auth/login`, {
        method: 'POST',
        headers: { origin: site, 'content-type': 'application/json' },
        body: '{}',
      }),
      environment,
      async (_url, init) => {
        fetchCount += 1
        assert.equal(init.method, 'POST')
        return new Response(upstreamBody, {
          status,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'set-cookie': 'platform_session=private; Secure; HttpOnly',
          },
        })
      },
    )
    assert.equal(fetchCount, 1)
    assert.equal(cancelled, true)
    assert.equal(response.status, 503)
    assert.match(response.headers.get('content-type'), /^application\/json/)
    assert.equal(response.headers.get('retry-after'), '5')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('set-cookie'), null)
    const body = await response.json()
    assert.equal(body.error.code, 'BACKEND_STARTING')
    assert.match(body.error.message, /hasta un minuto/)
    assert.ok(!JSON.stringify(body).includes(environment.SITES_BACKEND_TOKEN))
    assert.ok(!JSON.stringify(body).includes('<html>'))
  }
})

test('JSON API limits and other structured errors keep their own codes and retry headers', async () => {
  for (const [status, contentType] of [
    [429, 'application/json; charset=utf-8'],
    [429, 'Application/Problem+JSON; charset=UTF-8'],
    [503, 'application/vnd.konea.error+json'],
  ]) {
    const body = JSON.stringify({
      error: { code: 'APPLICATION_LIMIT', message: 'Application response' },
    })
    const response = await proxyBackend(
      new Request(`${site}/api/v1/auth/me`),
      environment,
      async () =>
        new Response(body, {
          status,
          headers: { 'content-type': contentType, 'retry-after': '42' },
        }),
    )
    assert.equal(response.status, status)
    assert.equal(response.headers.get('content-type'), contentType)
    assert.equal(response.headers.get('retry-after'), '42')
    assert.equal(await response.text(), body)
  }
})

test('successful binary downloads pass through unchanged', async () => {
  const bytes = new Uint8Array([0, 255, 137, 80, 78, 71, 13, 10])
  const response = await proxyBackend(
    new Request(`${site}/api/v1/uploads/files/image.png`),
    environment,
    async () =>
      new Response(bytes, {
        headers: { 'content-type': 'image/png', etag: 'image-version' },
      }),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.equal(response.headers.get('etag'), 'image-version')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
})

test('HEAD infrastructure failures release the upstream and return no body', async () => {
  let cancelled = false
  const response = await proxyBackend(
    new Request(`${site}/api/v1/health`, { method: 'HEAD' }),
    environment,
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
        { status: 503, headers: { 'content-type': 'text/plain' } },
      ),
  )
  assert.equal(cancelled, true)
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '5')
  assert.equal(await response.text(), '')
})

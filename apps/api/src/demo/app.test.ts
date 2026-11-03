import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDemoApp } from './app.js'
import type { DemoConfiguration } from './config.js'

const configuration: DemoConfiguration = {
  publicOrigin: 'https://test-konea-demo.trycloudflare.com',
  gateUser: 'konea',
  gatePassword: 'test-only-access-password-at-least-20',
  apiHost: '127.0.0.1',
  apiPort: 4310,
  uploadsDirectory: 'not-used-by-test-api',
}
const host = new URL(configuration.publicOrigin).host
let directory: string
let app: ReturnType<typeof createDemoApp>

function authorized(path: string) {
  return request(app)
    .get(path)
    .set('Host', host)
    .set('X-Forwarded-Proto', 'https')
    .auth(configuration.gateUser, configuration.gatePassword)
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'konea-public-demo-'))
  const webDirectory = join(directory, 'dist')
  await mkdir(join(webDirectory, 'assets'), { recursive: true })
  await mkdir(join(directory, 'private'), { recursive: true })
  await writeFile(
    join(webDirectory, 'index.html'),
    '<!doctype html><title>Konea demo</title>',
  )
  await writeFile(join(webDirectory, 'assets/main.js'), 'console.log("demo")')
  await writeFile(
    join(webDirectory, 'assets/main.js.map'),
    '{"sourcesContent":["private-source"]}',
  )
  await writeFile(join(webDirectory, '.env'), 'SECRET=never-serve-this')
  await writeFile(
    join(directory, 'private/secret.json'),
    '{"secret":"never-serve-this"}',
  )
  await symlink(
    join(directory, 'private'),
    join(webDirectory, 'assets/private'),
    'junction',
  )

  const api = express()
  api.get('/api/v1/health', (_request, response) =>
    response.json({ status: 'ok' }),
  )
  api.post('/api/v1/test', (_request, response) =>
    response.json({ status: 'ok' }),
  )
  api.post('/api/v1/duco/messages', (_request, response) =>
    response.json({ status: 'ok' }),
  )
  api.get('/api/v1/duco/messages', (_request, response) =>
    response.json({ messages: [] }),
  )
  api.use((_request, response) =>
    response.status(404).json({ error: { code: 'API_NOT_FOUND' } }),
  )
  app = createDemoApp({ configuration, webDirectory, apiApp: api })
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('password-protected compiled demo server', () => {
  it.each(['/', '/assets/main.js', '/api/v1/health', '/.env', '/unknown'])(
    'requires the access gate before serving %s',
    async (path) => {
      const response = await request(app)
        .get(path)
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
      expect(response.status).toBe(401)
      expect(response.headers['www-authenticate']).toContain(
        'Basic realm="Konea demo"',
      )
      expect(response.headers['cache-control']).toContain('no-store')
      expect(response.text).not.toContain('never-serve-this')
    },
  )

  it('rejects invalid and malformed credentials without echoing them', async () => {
    for (const authorization of [
      'Basic !!!',
      'Bearer secret-token',
      `Basic ${Buffer.from('konea:wrong').toString('base64')}`,
    ]) {
      const response = await request(app)
        .get('/')
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
        .set('Authorization', authorization)
      expect(response.status).toBe(401)
      expect(response.text).not.toContain('wrong')
      expect(response.text).not.toContain('secret-token')
    }
  })

  it('serves the actual compiled HTML, assets and same-origin API', async () => {
    const page = await authorized('/')
    expect(page.status).toBe(200)
    expect(page.text).toContain('<title>Konea demo</title>')
    expect(page.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    )
    expect(page.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive')
    expect((await authorized('/assets/main.js')).text).toBe(
      'console.log("demo")',
    )
    expect((await authorized('/api/v1/health')).body).toEqual({ status: 'ok' })
  })

  it('supports SPA navigation but never masks an unknown API route as HTML', async () => {
    expect(
      (await authorized('/students/test').set('Accept', 'text/html')).text,
    ).toContain('Konea demo')
    const api = await authorized('/api/v1/missing').set('Accept', 'text/html')
    expect(api.status).toBe(404)
    expect(api.body.error.code).toBe('API_NOT_FOUND')
    const asset = await authorized('/assets/missing.js').set(
      'Accept',
      'text/html',
    )
    expect(asset.status).toBe(404)
    expect(asset.body.error.code).toBe('NOT_FOUND')
  })

  it.each([
    '/.env',
    '/%2eenv',
    '/.local/secrets.json',
    '/assets/main.js.map',
    '/assets/private/secret.json',
    '/assets/%2e%2e/.env',
  ])(
    'does not serve hidden files, source maps or escaped files at %s',
    async (path) => {
      const response = await authorized(path).set('Accept', 'application/json')
      expect(response.status).toBe(404)
      expect(response.text).not.toContain('never-serve-this')
      expect(response.text).not.toContain('private-source')
    },
  )

  it('rejects foreign Hosts even with a forged forwarded Host', async () => {
    const response = await authorized('/')
      .set('Host', 'evil.invalid')
      .set('X-Forwarded-Host', host)
    expect(response.status).toBe(421)
  })

  it('does not issue an access challenge over a non-HTTPS public request', async () => {
    const response = await request(app)
      .get('/')
      .set('Host', host)
      .set('X-Forwarded-Proto', 'http')
    expect(response.status).toBe(426)
    expect(response.headers['www-authenticate']).toBeUndefined()
  })

  it('rejects cross-origin reads and writes, including browser writes without Origin', async () => {
    expect(
      (await authorized('/api/v1/health').set('Origin', 'https://evil.invalid'))
        .status,
    ).toBe(403)
    for (const origin of [undefined, 'https://evil.invalid']) {
      const pending = request(app)
        .post('/api/v1/test')
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
        .auth(configuration.gateUser, configuration.gatePassword)
      if (origin) pending.set('Origin', origin)
      expect((await pending).status).toBe(403)
    }
    const response = await request(app)
      .post('/api/v1/test')
      .set('Host', host)
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', configuration.publicOrigin)
      .auth(configuration.gateUser, configuration.gatePassword)
    expect(response.status).toBe(200)
  })

  it('limits paid AI messages without limiting reads, including case-insensitive API paths', async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await request(app)
        .post(
          index % 2 === 0 ? '/api/v1/duco/messages' : '/api/v1/DUCO/MESSAGES/',
        )
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-For', '198.51.100.91')
        .set('Origin', configuration.publicOrigin)
        .auth(configuration.gateUser, configuration.gatePassword)
      expect(response.status).toBe(200)
    }
    const limited = await request(app)
      .post('/api/v1/duco/messages')
      .set('Host', host)
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '198.51.100.91')
      .set('Origin', configuration.publicOrigin)
      .auth(configuration.gateUser, configuration.gatePassword)
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('DEMO_DUCO_LIMIT_REACHED')
    const messages = await authorized('/api/v1/duco/messages').set(
      'X-Forwarded-For',
      '198.51.100.91',
    )
    expect(messages.status).toBe(200)
  })

  it.each(['/api/v1/auth/register', '/api/v1/AUTH/REGISTER/'])(
    'disables new account registration only in the demo wrapper at %s',
    async (path) => {
      const response = await request(app)
        .post(path)
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
        .set('Origin', configuration.publicOrigin)
        .auth(configuration.gateUser, configuration.gatePassword)
      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe('DEMO_REGISTRATION_DISABLED')
    },
  )
})

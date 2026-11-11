import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { hostingProxyGuard } from './hosting-proxy.js'

const token = 'test-only-private-proxy-token-123456789'

function appFor(secret?: string) {
  const app = express()
  app.use(hostingProxyGuard(secret))
  app.use((_request, response) => response.json({ ok: true }))
  return app
}

describe('hosting proxy boundary', () => {
  it('keeps local deployments unchanged when no token is configured', async () => {
    await request(appFor()).post('/api/v1/kuco/messages').expect(200)
  })

  it('allows the health probe without exposing private API operations', async () => {
    const app = appFor(token)
    await request(app).get('/api/v1/health').expect(200)
    await request(app).head('/api/v1/health/').expect(200)
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/health/database',
      '/api/v1/health/extra',
    ]) {
      const response = await request(app).get(path).expect(403)
      expect(response.body.error.code).toBe('HOSTING_PROXY_REQUIRED')
    }
    await request(app).post('/api/v1/health').expect(403)
  })

  it('rejects absent or incorrect secrets, including a different length', async () => {
    const app = appFor(token)
    for (const supplied of ['', 'short', `${token}extra`]) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Konea-Proxy-Token', supplied)
        .expect(403)
    }
  })

  it('allows only the configured server secret', async () => {
    await request(appFor(token))
      .post('/api/v1/auth/login')
      .set('X-Konea-Proxy-Token', token)
      .expect(200)
  })
})

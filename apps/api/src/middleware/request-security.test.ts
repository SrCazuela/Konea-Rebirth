import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { trustedWriteOrigin } from './request-security.js'

function createTestApp() {
  const app = express()
  app.use(
    trustedWriteOrigin(['http://localhost:5173', 'https://konea.example']),
  )
  app.all('/resource', (_request, response) => response.json({ ok: true }))
  return app
}

describe('trustedWriteOrigin', () => {
  it('allows reads and trusted browser writes', async () => {
    const app = createTestApp()

    await request(app)
      .get('/resource')
      .set('Origin', 'https://malicious.example')
      .expect(200)
    await request(app)
      .post('/resource')
      .set('Origin', 'https://konea.example')
      .expect(200)
    await request(app).post('/resource').expect(200)
  })

  it('rejects browser writes from an untrusted origin', async () => {
    const response = await request(createTestApp())
      .delete('/resource')
      .set('Origin', 'https://malicious.example')
      .expect(403)

    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN')
  })
})

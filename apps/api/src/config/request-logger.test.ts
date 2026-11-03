import express from 'express'
import { pinoHttp } from 'pino-http'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { requestLoggerOptions } from './request-logger.js'

describe('request logger credential redaction', () => {
  it.each([200, 500])(
    'redacts credentials on a real HTTP response with status %i',
    async (status) => {
      const lines: string[] = []
      const app = express()
      app.use(
        pinoHttp(requestLoggerOptions, {
          write(message) {
            lines.push(message)
          },
        }),
      )

      // All credentials in this regression test are deliberately fictitious.
      const authorization = 'Bearer test-only-authorization-value'
      const incomingCookie = 'session=test-only-incoming-session-value'
      const accessAssertion = 'test-only-cloudflare-assertion-value'
      const proxyToken = 'test-only-sites-proxy-token-value'
      const outgoingCookies = [
        'session=test-only-outgoing-session-value; HttpOnly; SameSite=Lax',
        'refresh=test-only-refresh-value; HttpOnly; SameSite=Lax',
      ]

      app.get('/session', (incoming, response) => {
        incoming.log.info('Synthetic authenticated request')
        response.setHeader('Set-Cookie', outgoingCookies)
        response.status(status).json({ ok: status === 200 })
      })

      const response = await request(app)
        .get('/session')
        .set('Authorization', authorization)
        .set('Cookie', incomingCookie)
        .set('Cf-Access-Jwt-Assertion', accessAssertion)
        .set('X-Konea-Proxy-Token', proxyToken)
        .expect(status)

      // Redaction affects logging only, not the response sent to the browser.
      expect(response.headers['set-cookie']).toEqual(outgoingCookies)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      const output = lines.join('')
      for (const credential of [
        authorization,
        incomingCookie,
        accessAssertion,
        proxyToken,
        ...outgoingCookies,
        'test-only-outgoing-session-value',
        'test-only-refresh-value',
      ]) {
        expect(output).not.toContain(credential)
      }

      const completion = JSON.parse(lines.at(-1)!)
      expect(completion.req.headers.authorization).toBe('[Redacted]')
      expect(completion.req.headers.cookie).toBe('[Redacted]')
      expect(completion.req.headers['cf-access-jwt-assertion']).toBe(
        '[Redacted]',
      )
      expect(completion.req.headers['x-konea-proxy-token']).toBe('[Redacted]')
      expect(completion.res.headers['set-cookie']).toBe('[Redacted]')
      expect(completion.res.statusCode).toBe(status)
      expect(completion.req.method).toBe('GET')
      expect(completion.req.url).toBe('/session')
    },
  )
})

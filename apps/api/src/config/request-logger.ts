import type { Options } from 'pino-http'

// Keep authentication credentials out of both request and response logs.
export const requestLoggerOptions: Options = {
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["cf-access-jwt-assertion"]',
    'req.headers["x-konea-proxy-token"]',
    'res.headers["set-cookie"]',
  ],
}

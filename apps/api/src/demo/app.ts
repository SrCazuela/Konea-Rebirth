import { createHash, timingSafeEqual } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import express, { type RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import type { DemoConfiguration } from './config.js'

type DemoAppOptions = {
  configuration: DemoConfiguration
  webDirectory: string
  apiApp: RequestHandler
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

function isInside(directory: string, candidate: string) {
  const path = relative(directory, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/** Kept separate from createApp so tests and failed validation never connect to a DB. */
export function createDemoApp({
  configuration,
  webDirectory,
  apiApp,
}: DemoAppOptions) {
  const webRoot = realpathSync(webDirectory)
  const indexFile = realpathSync(resolve(webRoot, 'index.html'))
  if (!isInside(webRoot, indexFile)) {
    throw new Error(
      'The demo index must remain inside the compiled web directory.',
    )
  }

  const publicUrl = new URL(configuration.publicOrigin)
  const expectedCredentials = createHash('sha256')
    .update(`${configuration.gateUser}:${configuration.gatePassword}`)
    .digest()
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          ...(publicUrl.protocol === 'http:'
            ? { upgradeInsecureRequests: null }
            : {}),
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  )
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'private, no-store')
    response.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    next()
  })

  // Host is supplied by cloudflared, never trust X-Forwarded-Host from a visitor.
  app.use((request, response, next) => {
    if (request.get('host')?.toLowerCase() !== publicUrl.host) {
      response.status(421).json({ error: { code: 'DEMO_HOST_REJECTED' } })
      return
    }
    if (
      publicUrl.protocol === 'https:' &&
      request.get('x-forwarded-proto') !== 'https'
    ) {
      response.status(426).json({ error: { code: 'DEMO_HTTPS_REQUIRED' } })
      return
    }
    const origin = request.get('origin')
    if (
      (origin !== undefined && origin !== configuration.publicOrigin) ||
      (!safeMethods.has(request.method) &&
        origin !== configuration.publicOrigin)
    ) {
      response.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN' } })
      return
    }
    next()
  })

  const failedAccessLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_DEMO_ACCESS_ATTEMPTS' } },
  })

  app.use((request, response, next) => {
    const authorization = request.get('authorization') ?? ''
    const credentials = /^Basic ([a-zA-Z0-9+/]+={0,2})$/i.exec(
      authorization,
    )?.[1]
    let authenticated = false
    if (credentials && credentials.length <= 1024) {
      const submitted = createHash('sha256')
        .update(Buffer.from(credentials, 'base64'))
        .digest()
      authenticated = timingSafeEqual(expectedCredentials, submitted)
    }
    if (authenticated) {
      next()
      return
    }
    failedAccessLimiter(request, response, () => {
      response.set(
        'WWW-Authenticate',
        'Basic realm="Konea demo", charset="UTF-8"',
      )
      response.status(401).json({ error: { code: 'DEMO_ACCESS_REQUIRED' } })
    })
  })

  app.use((request, response, next) => {
    if (
      request.method === 'POST' &&
      request.path.toLowerCase().replace(/\/+$/, '') === '/api/v1/auth/register'
    ) {
      response.status(403).json({
        error: {
          code: 'DEMO_REGISTRATION_DISABLED',
          message:
            'El registro no esta disponible en esta demostracion. Utiliza las cuentas facilitadas por el equipo.',
        },
      })
      return
    }
    next()
  })

  // A shared presentation link must not turn the owner's paid AI key into an
  // unlimited public endpoint. Only message generation consumes this allowance.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1_000,
      limit: 20,
      skip: (request) =>
        request.method !== 'POST' ||
        request.path.toLowerCase().replace(/\/+$/, '') !==
          '/api/v1/duco/messages',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'DEMO_DUCO_LIMIT_REACHED',
          message:
            'La demostracion permite 20 consultas a DUCO cada 15 minutos por conexion.',
        },
      },
    }),
  )

  app.use((request, response, next) => {
    if (request.path === '/api' || request.path.startsWith('/api/')) {
      apiApp(request, response, next)
      return
    }
    next()
  })

  app.use(async (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      next()
      return
    }

    let pathname: string
    try {
      pathname = decodeURIComponent(request.path)
    } catch {
      response.status(400).json({ error: { code: 'INVALID_PATH' } })
      return
    }
    if (
      pathname.includes('\\') ||
      pathname.includes('\0') ||
      pathname.split('/').some((segment) => segment.startsWith('.')) ||
      pathname.endsWith('.map')
    ) {
      next()
      return
    }

    const candidate = resolve(webRoot, `.${pathname}`)
    if (!isInside(webRoot, candidate)) {
      next()
      return
    }
    try {
      const file = await realpath(candidate)
      if (!isInside(webRoot, file) || !(await stat(file)).isFile()) {
        next()
        return
      }
      response.sendFile(file, { cacheControl: false, dotfiles: 'deny' })
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR'].includes(String(error.code))
      ) {
        next()
        return
      }
      next(error)
    }
  })

  app.use((request, response, next) => {
    if (
      ['GET', 'HEAD'].includes(request.method) &&
      request.accepts('html') &&
      !extname(request.path) &&
      !request.path.startsWith('/api') &&
      !request.path.split('/').some((segment) => segment.startsWith('.'))
    ) {
      response.sendFile(indexFile, { cacheControl: false, dotfiles: 'deny' })
      return
    }
    next()
  })

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND' } })
  })
  // Do not use Express' default HTML handler: production errors must not expose paths.
  app.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(500).json({ error: { code: 'DEMO_INTERNAL_ERROR' } })
    },
  )

  return app
}

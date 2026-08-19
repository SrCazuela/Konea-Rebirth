import cors from 'cors'
import cookieParser from 'cookie-parser'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { ApiError } from './errors/api-error.js'
import { authRouter } from './routes/auth.js'
import { auxiliaryRouter } from './routes/auxiliary.js'
import { chatsRouter } from './routes/chats.js'
import { healthRouter } from './routes/health.js'
import { moderationRouter } from './routes/moderation.js'
import { pollsRouter } from './routes/polls.js'
import { postsRouter } from './routes/posts.js'
import { profileRouter } from './routes/profile.js'
import { qrCodesRouter } from './routes/qr-codes.js'
import { usersRouter } from './routes/users.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(
    pinoHttp({
      enabled: env.NODE_ENV !== 'test',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    }),
  )

  app.get('/api/v1', (_request, response) => {
    response.json({ name: 'Konea API', version: '0.1.0' })
  })
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/health', healthRouter)
  app.use('/api/v1/posts', postsRouter)
  app.use('/api/v1/profile', profileRouter)
  app.use('/api/v1/users', usersRouter)
  app.use('/api/v1/chats', chatsRouter)
  app.use('/api/v1/polls', pollsRouter)
  app.use('/api/v1/qr-codes', qrCodesRouter)
  app.use('/api/v1/moderation', moderationRouter)
  app.use('/api/v1', auxiliaryRouter)

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'El recurso solicitado no existe.',
      },
    })
  })

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      })
      return
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      response.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'El cuerpo de la solicitud no contiene JSON válido.',
        },
      })
      return
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      response.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'El cuerpo de la solicitud supera el límite permitido.',
        },
      })
      return
    }

    request.log.error({ err: error }, 'Unhandled request error')

    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocurrió un error inesperado.',
      },
    })
  }

  app.use(errorHandler)

  return app
}

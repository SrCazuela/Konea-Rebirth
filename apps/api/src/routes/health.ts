import { Router } from 'express'
import { checkDatabaseConnection } from '../db/client.js'
import { requireAuthentication } from '../middleware/authentication.js'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'konea-api',
    timestamp: new Date().toISOString(),
  })
})

// El endpoint de base de datos requiere autenticación para no exponer
// información interna (latencia, conectividad) a usuarios anónimos.
healthRouter.get(
  '/database',
  requireAuthentication,
  async (_request, response, next) => {
    try {
      const database = await checkDatabaseConnection()
      response.json({ status: 'ok', database })
    } catch (error) {
      next(error)
    }
  },
)

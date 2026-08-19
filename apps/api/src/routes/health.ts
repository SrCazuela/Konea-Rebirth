import { Router } from 'express'
import { checkDatabaseConnection } from '../db/client.js'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'konea-api',
    timestamp: new Date().toISOString(),
  })
})

healthRouter.get('/database', async (_request, response, next) => {
  try {
    const database = await checkDatabaseConnection()
    response.json({ status: 'ok', database })
  } catch (error) {
    next(error)
  }
})

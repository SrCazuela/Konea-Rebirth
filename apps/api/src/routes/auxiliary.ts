import { Router } from 'express'
import { ducoRouter } from './duco.js'
import { notificationsRouter } from './notifications.js'
import { reportsRouter } from './reports.js'
import { uploadsRouter } from './uploads.js'

/**
 * Routers auxiliares preparados para montarse bajo `/api/v1`.
 * Se mantiene separado de app.ts para que estos módulos puedan validarse antes
 * de exponerlos desde la aplicación principal.
 */
export const auxiliaryRouter = Router()

auxiliaryRouter.use('/uploads', uploadsRouter)
auxiliaryRouter.use('/notifications', notificationsRouter)
auxiliaryRouter.use('/duco', ducoRouter)
auxiliaryRouter.use('/reports', reportsRouter)

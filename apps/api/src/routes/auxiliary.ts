import { Router } from 'express'
import { avaCalendarRouter } from './ava-calendar.js'
import { avaImportsRouter } from './ava-imports.js'
import { academicRouter } from './academic.js'
import { ducoRouter } from './duco.js'
import { notificationsRouter } from './notifications.js'
import { reportsRouter } from './reports.js'
import { studyRouter } from './study.js'
import { uploadsRouter } from './uploads.js'

/**
 * Routers auxiliares preparados para montarse bajo `/api/v1`.
 * Se mantiene separado de app.ts para que estos módulos puedan validarse antes
 * de exponerlos desde la aplicación principal.
 */
export const auxiliaryRouter = Router()

auxiliaryRouter.use('/uploads', uploadsRouter)
auxiliaryRouter.use('/notifications', notificationsRouter)
auxiliaryRouter.use('/ava-calendar', avaCalendarRouter)
auxiliaryRouter.use('/ava-imports', avaImportsRouter)
auxiliaryRouter.use('/academic', academicRouter)
auxiliaryRouter.use('/duco', ducoRouter)
auxiliaryRouter.use('/reports', reportsRouter)
auxiliaryRouter.use('/study', studyRouter)

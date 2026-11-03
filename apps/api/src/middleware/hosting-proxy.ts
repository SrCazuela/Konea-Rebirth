import { createHash, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

export function hostingProxyGuard(secret: string | undefined): RequestHandler {
  const expected = secret ? createHash('sha256').update(secret).digest() : null

  return (request, response, next) => {
    if (
      !expected ||
      (['GET', 'HEAD'].includes(request.method) &&
        /^\/api\/v1\/health\/?$/.test(request.path))
    ) {
      next()
      return
    }

    const supplied = createHash('sha256')
      .update(request.get('x-konea-proxy-token') ?? '')
      .digest()
    if (!timingSafeEqual(expected, supplied)) {
      response.status(403).json({
        error: {
          code: 'HOSTING_PROXY_REQUIRED',
          message: 'Accede a Konea desde la dirección del sitio autorizado.',
        },
      })
      return
    }

    next()
  }
}

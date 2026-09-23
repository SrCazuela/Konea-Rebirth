import type { RequestHandler } from 'express'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export function trustedWriteOrigin(
  allowedOrigins: readonly string[],
): RequestHandler {
  const allowed = new Set(allowedOrigins)

  return (request, response, next) => {
    if (safeMethods.has(request.method)) {
      next()
      return
    }

    const origin = request.get('origin')
    // CLI, mobile and server-to-server clients commonly omit Origin. Browser
    // writes include it, so reject those that do not belong to Konea.
    if (!origin || allowed.has(origin)) {
      next()
      return
    }

    response.status(403).json({
      error: {
        code: 'UNTRUSTED_ORIGIN',
        message: 'El origen de la solicitud no está autorizado.',
      },
    })
  }
}

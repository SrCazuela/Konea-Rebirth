import { z } from 'zod'

export const localUploadPathPattern =
  /^\/api\/v1\/uploads\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:gif|jpe?g|pdf|png|webp))$/

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    const isLocalHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (
      (url.protocol === 'https:' || isLocalHttp) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    isHttpUrl,
    'Debe ser una URL HTTPS (HTTP solo se permite en localhost).',
  )

export const localUploadPathSchema = z
  .string()
  .trim()
  .regex(localUploadPathPattern, 'La ruta del archivo subido no es válida.')

export const httpOrLocalUploadUrlSchema = z.union([
  httpUrlSchema,
  localUploadPathSchema,
])

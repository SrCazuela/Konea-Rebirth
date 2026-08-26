import { z } from 'zod'
import { ApiError } from '../errors/api-error.js'

export const uuidSchema = z.string().uuid()

export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown,
) {
  const result = schema.safeParse(body)

  if (!result.success) {
    const flattened = z.flattenError(result.error)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      {
        fields: flattened.fieldErrors,
      },
    )
  }

  return result.data as z.infer<TSchema>
}

/**
 * Parsea y valida un parámetro de ruta que debe ser un UUID.
 * Lanza ApiError 400 si el valor no es un UUID válido.
 */
export function parseId(
  value: unknown,
  errorMessage = 'Se requiere un identificador válido.',
) {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    throw new ApiError(400, 'INVALID_IDENTIFIER', errorMessage)
  }
  return result.data
}

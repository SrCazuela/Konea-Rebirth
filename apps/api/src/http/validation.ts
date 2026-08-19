import { z } from 'zod'
import { ApiError } from '../errors/api-error.js'

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

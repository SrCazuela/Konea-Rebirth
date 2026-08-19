import { ApiError } from '../errors/api-error.js'

const blockedPatterns = [
  /te voy a (matar|golpear|hacer da[ñn]o|lastimar|violar)/i,
  /\b(hijo de puta|imb[eé]cil|pendejo)\b/i,
  /(eres un in[uú]til|no sirves para nada|deber[ií]as desaparecer)/i,
]

export function ensureLocallyAppropriate(content: string) {
  if (blockedPatterns.some((pattern) => pattern.test(content))) {
    throw new ApiError(
      422,
      'CONTENT_REJECTED',
      'El contenido fue rechazado por las reglas de convivencia de Konea.',
    )
  }
}

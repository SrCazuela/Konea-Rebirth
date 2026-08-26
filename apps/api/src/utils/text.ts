/**
 * Normaliza texto en español para comparaciones sin distinción de acentos
 * ni mayúsculas/minúsculas. Aplica descomposición NFD para cubrir variantes
 * como "Gráfico" ↔ "Grafico".
 */
export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

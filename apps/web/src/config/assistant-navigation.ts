// Conserva enlaces guardados antes del cambio de nombre, con rutas nuevas canónicas.
export function canonicalizeAssistantHash(hash: string) {
  if (hash === '#duco') return '#kuco'
  if (hash === '#duco-requests') return '#kuco-requests'
  return hash
}

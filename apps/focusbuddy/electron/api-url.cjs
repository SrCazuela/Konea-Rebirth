const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1'
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function invalidApiUrl(message = 'La URL de la API de Konea no es válida.') {
  return new TypeError(message)
}

function parseApiBaseUrl(candidate, { allowSuffix = false } = {}) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw invalidApiUrl()
  }

  let url
  try {
    url = new URL(candidate.trim())
  } catch {
    throw invalidApiUrl()
  }

  if (url.username || url.password) {
    throw invalidApiUrl('La URL de la API no puede incluir credenciales.')
  }
  if (!allowSuffix && (url.search || url.hash)) {
    throw invalidApiUrl('La URL base de la API no puede incluir query ni hash.')
  }

  const isSecureRemote = url.protocol === 'https:'
  const isLocalDevelopment =
    url.protocol === 'http:' && LOCAL_API_HOSTS.has(url.hostname.toLowerCase())
  if (!isSecureRemote && !isLocalDevelopment) {
    throw invalidApiUrl(
      'La API de FocusBuddy requiere HTTPS; HTTP solo se permite en loopback.',
    )
  }

  return url
}

function normalizeApiBaseUrl(candidate) {
  const url = parseApiBaseUrl(candidate)
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path || '/'

  return url.toString().replace(/\/$/, '')
}

function apiBaseUrlFromAppUrl(candidate) {
  const appUrl = parseApiBaseUrl(candidate, { allowSuffix: true })
  appUrl.pathname = '/api/v1'
  appUrl.search = ''
  appUrl.hash = ''
  return normalizeApiBaseUrl(appUrl.toString())
}

function buildApiUrl(apiBaseUrl, resourcePath) {
  const normalizedBase = normalizeApiBaseUrl(apiBaseUrl)
  if (
    typeof resourcePath !== 'string' ||
    !resourcePath.startsWith('/') ||
    resourcePath.startsWith('//') ||
    resourcePath.includes('\\') ||
    resourcePath.includes('#')
  ) {
    throw invalidApiUrl('La ruta solicitada de la API no es válida.')
  }

  let result
  try {
    result = new URL(`${normalizedBase}${resourcePath}`)
  } catch {
    throw invalidApiUrl('La ruta solicitada de la API no es válida.')
  }

  const base = new URL(`${normalizedBase}/`)
  const basePath = base.pathname.replace(/\/+$/, '')
  if (
    result.origin !== base.origin ||
    (result.pathname !== basePath &&
      !result.pathname.startsWith(`${basePath}/`))
  ) {
    throw invalidApiUrl('La ruta solicitada escapa de la API configurada.')
  }

  return result.toString()
}

function selectApiBaseUrl({
  isPackaged,
  commandLineValue,
  environmentValue,
  packagedValue,
  appUrl,
} = {}) {
  const candidates = isPackaged
    ? [packagedValue]
    : [commandLineValue, environmentValue, packagedValue]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return normalizeApiBaseUrl(candidate)
    } catch {
      // Las fuentes opcionales inválidas no deben reemplazar el fallback seguro.
    }
  }

  if (appUrl) {
    try {
      return apiBaseUrlFromAppUrl(appUrl)
    } catch {
      // El endpoint local explícito sigue siendo el último fallback.
    }
  }

  return DEFAULT_API_BASE_URL
}

module.exports = {
  DEFAULT_API_BASE_URL,
  apiBaseUrlFromAppUrl,
  buildApiUrl,
  normalizeApiBaseUrl,
  selectApiBaseUrl,
}

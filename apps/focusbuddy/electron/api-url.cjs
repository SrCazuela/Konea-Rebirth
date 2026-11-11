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

function normalizeChannelApiUrl(candidate, channel = 'local') {
  const normalized = normalizeApiBaseUrl(candidate)
  const url = new URL(normalized)
  const hostname = url.hostname.toLowerCase()
  const isLoopback = LOCAL_API_HOSTS.has(hostname)
  if (channel === 'local') {
    if (!isLoopback) {
      throw invalidApiUrl(
        'FocusBuddy Local solo puede conectarse a la API de este equipo.',
      )
    }
  } else if (channel === 'production') {
    const ipv4 = hostname.split('.').map(Number)
    const isPrivateIpv4 =
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
      (ipv4[0] === 0 ||
        ipv4[0] === 10 ||
        ipv4[0] === 127 ||
        (ipv4[0] === 169 && ipv4[1] === 254) ||
        (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
        (ipv4[0] === 192 && ipv4[1] === 168) ||
        ipv4[0] >= 224)
    const isPrivateIpv6 =
      hostname.startsWith('[') &&
      (hostname === '[::]' ||
        hostname === '[::1]' ||
        /^\[(?:fc|fd|fe[89ab])/i.test(hostname) ||
        hostname.includes('::ffff:'))
    if (
      url.protocol !== 'https:' ||
      isLoopback ||
      isPrivateIpv4 ||
      isPrivateIpv6 ||
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal)$/.test(hostname)
    ) {
      throw invalidApiUrl(
        'FocusBuddy Oficial requiere una API pública HTTPS explícita.',
      )
    }
  } else {
    throw invalidApiUrl('El canal de FocusBuddy no es válido.')
  }
  return normalized
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
  channel = 'local',
  commandLineValue,
  environmentValue,
  packagedValue,
} = {}) {
  if (isPackaged) {
    return normalizeChannelApiUrl(packagedValue, channel)
  }
  // Desarrollo nunca hereda la configuración de un instalador previo.
  return normalizeChannelApiUrl(
    commandLineValue || environmentValue || DEFAULT_API_BASE_URL,
    'local',
  )
}

module.exports = {
  DEFAULT_API_BASE_URL,
  apiBaseUrlFromAppUrl,
  buildApiUrl,
  normalizeApiBaseUrl,
  normalizeChannelApiUrl,
  selectApiBaseUrl,
}

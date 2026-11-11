const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'if-none-match',
  'if-modified-since',
  'range',
  'if-range',
]
const RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'retry-after',
]

function jsonError(status, code, message) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export function validateBackendOrigin(value) {
  const url = new URL(value)
  // This adapter targets the Render service, never an arbitrary URL supplied
  // by a visitor. Restricting the hostname also avoids accidental local access.
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.onrender\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('KONEA_BACKEND_ORIGIN must be the HTTPS Render origin')
  }
  return url.origin
}

export function sessionCookie(value) {
  const candidates = (value ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('konea_session='))
  if (candidates.length !== 1) return null
  return /^konea_session=[A-Za-z0-9_-]{1,256}$/.test(candidates[0])
    ? candidates[0]
    : null
}

export async function proxyBackend(request, environment, fetcher = fetch) {
  const incoming = new URL(request.url)
  if (
    incoming.pathname !== '/api/v1' &&
    !incoming.pathname.startsWith('/api/v1/')
  ) {
    return jsonError(404, 'NOT_FOUND', 'El recurso solicitado no existe.')
  }

  let backendOrigin
  try {
    backendOrigin = validateBackendOrigin(environment.KONEA_BACKEND_ORIGIN)
    if (
      !/^[A-Za-z0-9_-]{32,256}$/.test(environment.SITES_BACKEND_TOKEN ?? '')
    ) {
      throw new Error('Missing backend access secret')
    }
  } catch {
    return jsonError(
      503,
      'HOSTING_NOT_CONFIGURED',
      'Estamos preparando el servidor de Konea. Intenta nuevamente más tarde.',
    )
  }

  const origin = request.headers.get('origin')
  if (
    !SAFE_METHODS.has(request.method) &&
    origin &&
    origin !== incoming.origin
  ) {
    return jsonError(403, 'UNTRUSTED_ORIGIN', 'El origen no está autorizado.')
  }

  const headers = new Headers()
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  // Never forward ChatGPT identity headers, platform cookies, authorization,
  // caller-controlled proxy headers or any other Site secrets to the backend.
  const cookie = sessionCookie(request.headers.get('cookie'))
  if (cookie) headers.set('cookie', cookie)
  headers.set('origin', incoming.origin)
  headers.set('x-konea-proxy-token', environment.SITES_BACKEND_TOKEN)

  // Concatenate onto a fixed origin; new URL(userPath, base) can interpret
  // an attacker-controlled // path as a different host.
  const upstreamUrl = `${backendOrigin}${incoming.pathname}${incoming.search}`
  let upstream
  const timeout = AbortSignal.timeout(115_000)
  try {
    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, timeout]),
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      // Node's Fetch needs this for streaming request bodies; Workers accepts it.
      init.duplex = 'half'
    }
    upstream = await fetcher(upstreamUrl, init)
  } catch {
    return jsonError(
      503,
      'BACKEND_UNAVAILABLE',
      'El servidor está iniciando o no está disponible. Reintenta en un minuto.',
    )
  }

  const contentType = (upstream.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const isJson =
    contentType === 'application/json' || contentType.endsWith('+json')
  if ([429, 502, 503, 504].includes(upstream.status) && !isJson) {
    // Render can return an HTML loading or protection page before Express
    // starts. Release that stream without forwarding HTML or retrying a write.
    await upstream.body?.cancel().catch(() => {})
    const response = jsonError(
      503,
      'BACKEND_STARTING',
      'El servidor de Konea está iniciando. Puede tardar hasta un minuto; espera un momento e inténtalo nuevamente.',
    )
    response.headers.set('Retry-After', '5')
    return request.method === 'HEAD'
      ? new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      : response
  }

  // An API redirect must not forward the session to another origin.
  if (
    upstream.status >= 300 &&
    upstream.status < 400 &&
    upstream.status !== 304
  ) {
    return jsonError(
      502,
      'INVALID_BACKEND_RESPONSE',
      'El servidor no pudo responder.',
    )
  }
  const responseHeaders = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  })
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  // Render's session cookie is host-only. The browser receives it from the
  // Site origin, so Secure / HttpOnly / SameSite=Lax remain effective.
  for (const value of upstream.headers.getSetCookie()) {
    if (
      value.startsWith('konea_session=') &&
      !/;\s*domain=/i.test(value) &&
      /;\s*httponly(?:;|$)/i.test(value) &&
      /;\s*secure(?:;|$)/i.test(value)
    ) {
      responseHeaders.append('set-cookie', value)
    }
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

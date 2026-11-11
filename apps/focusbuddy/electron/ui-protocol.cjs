const { readFile } = require('node:fs/promises')
const path = require('node:path')
const avatarManifest = require('./assets/avatar-hq/source-manifest.json')

const UI_SCHEME = 'konea-focusbuddy-ui'
const UI_ORIGIN = `${UI_SCHEME}://app`
const UI_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'"
const UI_SCHEME_REGISTRATION = Object.freeze({
  scheme: UI_SCHEME,
  privileges: Object.freeze({
    standard: true,
    secure: true,
    supportFetchAPI: false,
    corsEnabled: false,
    bypassCSP: false,
  }),
})

const resourceTypes = new Map([
  ['desktop.html', 'text/html; charset=utf-8'],
  ['desktop.css', 'text/css; charset=utf-8'],
  ['desktop.js', 'text/javascript; charset=utf-8'],
  ['companion.html', 'text/html; charset=utf-8'],
  ['companion.css', 'text/css; charset=utf-8'],
  ['companion.js', 'text/javascript; charset=utf-8'],
  ['avatar-animation.js', 'text/javascript; charset=utf-8'],
  ['avatar-library.js', 'text/javascript; charset=utf-8'],
  ['assets/branding/konea-logo.svg', 'image/svg+xml'],
  ['assets/branding/konea-mark.svg', 'image/svg+xml'],
  ['owl-shimeji-provisional.png', 'image/png'],
])
if (avatarManifest.fileCount !== 35 || avatarManifest.files?.length !== 35) {
  throw new TypeError('El catálogo de sprites de FocusBuddy no es válido.')
}
for (const asset of avatarManifest.files) {
  if (!/^[a-z0-9-]+\.png$/.test(asset.local))
    throw new TypeError('El catálogo contiene una ruta de sprite no válida.')
  resourceTypes.set(`assets/avatar-hq/${asset.local}`, 'image/png')
}
const resources = new Map(
  [...resourceTypes].map(([relativePath, contentType]) => [
    `${UI_ORIGIN}/${relativePath}`,
    Object.freeze({ relativePath, contentType }),
  ]),
)

function uiPageUrl(page) {
  if (!['desktop', 'companion'].includes(page))
    throw new TypeError('La página interna de FocusBuddy no es válida.')
  return `${UI_ORIGIN}/${page}.html`
}

function isTrustedUiPageUrl(candidate, page) {
  return typeof candidate === 'string' && candidate === uiPageUrl(page)
}

function resourceForUiUrl(candidate) {
  return typeof candidate === 'string'
    ? (resources.get(candidate) ?? null)
    : null
}

function responseHeaders(contentType = 'text/plain; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': UI_CSP,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }
}

function createUiProtocolHandler({
  readResource = (relativePath) => readFile(path.join(__dirname, relativePath)),
} = {}) {
  return async (request) => {
    const resource = resourceForUiUrl(request?.url)
    if (!resource)
      return new Response('Not found', {
        status: 404,
        headers: responseHeaders(),
      })
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...responseHeaders(), Allow: 'GET, HEAD' },
      })
    }
    try {
      const bytes = await readResource(resource.relativePath)
      return new Response(request.method === 'HEAD' ? null : bytes, {
        status: 200,
        headers: responseHeaders(resource.contentType),
      })
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: responseHeaders(),
      })
    }
  }
}

async function registerUiProtocolForSession(
  appSession,
  handler = createUiProtocolHandler(),
) {
  await appSession.protocol.handle(UI_SCHEME, handler)
}

module.exports = {
  UI_SCHEME,
  UI_ORIGIN,
  UI_CSP,
  UI_SCHEME_REGISTRATION,
  uiPageUrl,
  isTrustedUiPageUrl,
  resourceForUiUrl,
  createUiProtocolHandler,
  registerUiProtocolForSession,
}

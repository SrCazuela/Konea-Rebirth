const DEFAULT_APP_URL = 'http://localhost:5173/#focusbuddy'
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseSafeWebUrl(candidate) {
  const url = new URL(candidate)
  if (url.username || url.password) {
    throw new Error('La URL de Konea no puede incluir credenciales.')
  }
  const isSecureRemote = url.protocol === 'https:'
  const isLocalDevelopment =
    url.protocol === 'http:' && localHosts.has(url.hostname.toLowerCase())
  if (!isSecureRemote && !isLocalDevelopment) {
    throw new Error(
      'FocusBuddy requiere HTTPS; HTTP solo se permite en localhost.',
    )
  }
  return url
}

function normalizeAppUrl(candidate) {
  const url = parseSafeWebUrl(candidate)
  // FocusBuddy never needs query parameters. Removing them avoids baking or
  // displaying accidental access tokens in a branded desktop window.
  url.search = ''
  url.hash = '#focusbuddy'
  return url.toString()
}

function selectAppUrl({
  isPackaged,
  commandLineValue,
  environmentValue,
  packagedValue,
}) {
  // A packaged, URL-bar-less application must not be redirectable with a
  // crafted shortcut or inherited environment variable: that would make a
  // phishing page look like Konea. Published builds only trust their baked
  // public endpoint. Runtime overrides remain available in development.
  const candidates = isPackaged
    ? [packagedValue, DEFAULT_APP_URL]
    : [commandLineValue, environmentValue, packagedValue, DEFAULT_APP_URL]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return normalizeAppUrl(candidate)
    } catch {
      // An invalid optional source does not prevent the safe fallback.
    }
  }

  return DEFAULT_APP_URL
}

function isSafeExternalUrl(candidate) {
  try {
    parseSafeWebUrl(candidate)
    return true
  } catch {
    return false
  }
}

module.exports = {
  DEFAULT_APP_URL,
  isSafeExternalUrl,
  normalizeAppUrl,
  selectAppUrl,
}

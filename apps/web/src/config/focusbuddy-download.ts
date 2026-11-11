export function normalizeFocusBuddyDownloadUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/SrCazuela\/Konea-Rebirth\/releases\/(?:latest\/download|download\/[^/]+)\/Konea-FocusBuddy-Windows-x64\.exe$/.test(
        url.pathname,
      )
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function getFocusBuddyDesktopChannel(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, '')
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(normalizedHostname)
    ? 'local'
    : 'production'
}

// Only opens the matching installed program. No session or endpoint enters this URL.
export function getFocusBuddyLaunchUrl(hostname: string) {
  return getFocusBuddyDesktopChannel(hostname) === 'local'
    ? 'konea-focusbuddy-local://open'
    : 'konea-focusbuddy://open'
}

export function isFocusBuddyDesktopRuntime(bridge: unknown) {
  return typeof bridge === 'object' && bridge !== null
}

export const focusBuddyDownloadUrl = normalizeFocusBuddyDownloadUrl(
  import.meta.env.VITE_FOCUSBUDDY_DOWNLOAD_URL,
)

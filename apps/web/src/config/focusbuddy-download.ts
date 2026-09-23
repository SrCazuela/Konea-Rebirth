export function normalizeFocusBuddyDownloadUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function isFocusBuddyDesktopRuntime(bridge: unknown) {
  return typeof bridge === 'object' && bridge !== null
}

export const focusBuddyDownloadUrl = normalizeFocusBuddyDownloadUrl(
  import.meta.env.VITE_FOCUSBUDDY_DOWNLOAD_URL,
)

/** Explicit scroll options must respect both the app and operating-system setting. */
export function navigationScrollBehavior(
  enabled: boolean,
  systemReduced: boolean,
  smoothRequested = true,
): ScrollBehavior {
  return enabled && !systemReduced && smoothRequested ? 'smooth' : 'instant'
}

/** Read the current settings at the moment a delayed or automatic scroll runs. */
export function portalScrollBehavior(): ScrollBehavior {
  return navigationScrollBehavior(
    document.querySelector('.portal-shell')?.getAttribute('data-motion') !==
      'off',
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
}

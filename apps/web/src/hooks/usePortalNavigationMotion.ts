import { useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'

/** Animate navigation once, rather than replaying whenever live data updates. */
export function usePortalNavigationMotion(
  container: RefObject<HTMLDivElement | null>,
  section: string,
  enabled: boolean,
  collapsed: boolean,
) {
  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const media = gsap.matchMedia(root)
    if (enabled) {
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const icons = root.querySelectorAll(
          '.portal-nav button.is-active .portal-icon, .portal-bottom-nav button.is-active .portal-icon',
        )
        if (!icons.length) return
        gsap.fromTo(
          icons,
          { scale: 0.82, y: 2 },
          {
            scale: 1,
            y: 0,
            duration: 0.4,
            ease: 'back.out(2)',
            clearProps: 'transform',
          },
        )
      })
    }
    // Scroll only the horizontal navigation, never the page or conversation.
    const navigation = root.querySelector<HTMLElement>('.portal-bottom-nav')
    const active = navigation?.querySelector<HTMLElement>('.is-active')
    if (navigation && active) {
      const item = active.getBoundingClientRect()
      const rail = navigation.getBoundingClientRect()
      navigation.scrollTo({
        left:
          navigation.scrollLeft +
          item.left -
          rail.left -
          (rail.width - item.width) / 2,
        behavior:
          enabled &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'instant',
      })
    }
    return () => media.revert()
  }, [container, section, enabled, collapsed])
}

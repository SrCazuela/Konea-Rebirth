import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import './PortalMotion.css'

export function PortalMotionStage({
  routeKey,
  enabled,
  children,
}: {
  routeKey: string
  enabled: boolean
  children: ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = container.current
    if (!root || !enabled) return
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', (context) => {
      gsap.fromTo(
        root,
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.32,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        },
      )

      const animated = new WeakSet<Element>()
      const animateDialogs = () => {
        root
          .querySelectorAll<HTMLElement>('[role="dialog"]')
          .forEach((dialog) => {
            if (animated.has(dialog)) return
            animated.add(dialog)
            context.add(() => {
              gsap.fromTo(
                dialog,
                { y: 16, opacity: 0, scale: 0.985 },
                {
                  y: 0,
                  opacity: 1,
                  scale: 1,
                  duration: 0.24,
                  ease: 'power2.out',
                  clearProps: 'transform,opacity',
                },
              )
            })
          })
      }
      animateDialogs()
      const observer = new MutationObserver((records) => {
        if (records.some((record) => record.addedNodes.length > 0))
          animateDialogs()
      })
      observer.observe(root, { childList: true, subtree: true })
      return () => observer.disconnect()
    })
    return () => media.revert()
  }, [routeKey, enabled])

  return (
    <div
      className="portal-view-stage"
      ref={container}
      data-portal-stage={routeKey}
    >
      {children}
    </div>
  )
}

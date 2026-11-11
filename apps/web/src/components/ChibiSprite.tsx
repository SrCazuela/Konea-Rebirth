import { useEffect, useRef } from 'react'
import {
  avatarLibrary,
  chibiImageUrl,
  createAvatarAnimator,
} from './focus-avatar-runtime'
import './ChibiSprite.css'

export function ChibiSprite({
  scene = 'idle',
  className = '',
  label = 'Tu compañero de concentración',
  animated = true,
}: {
  scene?: string
  className?: string
  label?: string
  animated?: boolean
}) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const safeScene = Object.hasOwn(avatarLibrary.chibi, scene) ? scene : 'idle'
  const initialFrame = avatarLibrary.chibi[safeScene]!.frames[0]!.frame

  useEffect(() => {
    const container = containerRef.current
    const image = imageRef.current
    if (!container || !image) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let inViewport = true
    let preloaded: HTMLImageElement[] = []
    const animator = createAvatarAnimator({
      animations: avatarLibrary.chibi,
      initialState: safeScene,
      onFrame(snapshot) {
        const source = chibiImageUrl(snapshot.frame)
        if (image.getAttribute('src') !== source)
          image.setAttribute('src', source)
        container.dataset.blinking = String(snapshot.blinking)
      },
    })
    const sync = () => {
      const visible = inViewport && document.visibilityState !== 'hidden'
      if (visible && preloaded.length === 0) {
        preloaded = avatarLibrary.sourcesForScene(safeScene).map((frame) => {
          const picture = new Image()
          picture.decoding = 'async'
          picture.src = chibiImageUrl(frame)
          return picture
        })
      } else if (!visible) {
        preloaded = []
      }
      animator.update({
        visible,
        reducedMotion:
          !animated ||
          motion.matches ||
          Boolean(container.closest('[data-motion="off"]')),
      })
    }
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? false
      sync()
    })
    observer.observe(container)
    const portal = container.closest('.portal-shell')
    const preferenceObserver = new MutationObserver(sync)
    if (portal)
      preferenceObserver.observe(portal, {
        attributes: true,
        attributeFilter: ['data-motion'],
      })
    motion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer.disconnect()
      preferenceObserver.disconnect()
      motion.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      animator.dispose()
      preloaded = []
    }
  }, [safeScene, animated])

  return (
    <span
      ref={containerRef}
      className={`chibi-sprite ${className}`}
      role="img"
      aria-label={label}
      data-scene={safeScene}
      data-animated={animated}
    >
      <span className="chibi-sprite__viewport">
        <img
          ref={imageRef}
          className="chibi-sprite__image"
          src={chibiImageUrl(initialFrame)}
          alt=""
          decoding="async"
          draggable={false}
        />
      </span>
    </span>
  )
}

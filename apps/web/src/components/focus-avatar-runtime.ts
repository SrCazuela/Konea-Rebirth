import '../../../focusbuddy/electron/avatar-animation.js'
import '../../../focusbuddy/electron/avatar-library.js'

type AnimationFrame = { frame: string | number; durationMs: number }
type Animation = {
  frames: AnimationFrame[]
  blink?: { frames: AnimationFrame[] }
}
type Animator = {
  update: (options: { visible: boolean; reducedMotion: boolean }) => void
  dispose: () => void
}

const runtime = globalThis as typeof globalThis & {
  FocusBuddyAnimation: {
    createAnimator: (options: {
      animations: Record<string, Animation>
      initialState: string
      onFrame: (snapshot: { frame: string | number; blinking: boolean }) => void
    }) => Animator
  }
  FocusBuddyAvatars: {
    chibi: Record<string, Animation>
    sceneForSession: (options: {
      mood: string
      method?: string
      focusedSeconds?: number
    }) => string
    sourcesForScene: (scene: string) => string[]
  }
}

// Reuse the exact desktop drawings. Vite fingerprints these local PNGs for
// production and loads their bytes only when a scene actually needs them.
const imports = import.meta.glob<string>(
  '../../../focusbuddy/electron/assets/avatar-hq/*.png',
  { eager: true, import: 'default', query: '?url' },
)
const sources = new Map(
  Object.entries(imports).map(([file, url]) => [file.split('/').pop(), url]),
)

export const avatarLibrary = runtime.FocusBuddyAvatars
export const createAvatarAnimator = runtime.FocusBuddyAnimation.createAnimator

export function chibiImageUrl(frame: string | number) {
  const name = typeof frame === 'string' ? frame.split('/').pop() : undefined
  return sources.get(name) ?? sources.get('idle-1.png')!
}

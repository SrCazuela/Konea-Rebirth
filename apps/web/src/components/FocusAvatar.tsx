import { ChibiSprite } from './ChibiSprite'
import { avatarLibrary } from './focus-avatar-runtime'

export type AvatarMood = 'idle' | 'focus' | 'paused' | 'completed'

const MOOD_MESSAGES: Record<AvatarMood, string> = {
  idle: 'Estoy listo cuando tú lo estés.',
  focus: 'Modo concentración activado.',
  paused: 'Respira. Retomamos cuando quieras.',
  completed: '¡Buen trabajo! Sumaste una nueva sesión.',
}

const MOOD_LABELS: Record<AvatarMood, string> = {
  idle: 'FocusBuddy está disponible y esperando',
  focus: 'FocusBuddy estudia durante la sesión activa',
  paused: 'FocusBuddy descansa durante la pausa',
  completed: 'FocusBuddy celebra la sesión completada',
}

/**
 * The web and desktop clients share the artist's poses and blink timing.
 * This presentation never changes the authoritative study session.
 */
export function FocusAvatar({
  mood,
  method,
  focusedSeconds = 0,
}: {
  mood: AvatarMood
  method?: string
  focusedSeconds?: number
}) {
  const scene = avatarLibrary.sceneForSession({ mood, method, focusedSeconds })
  return (
    <div className={`focus-avatar focus-avatar--${mood}`}>
      <div className="focus-avatar__scene">
        <span
          className="focus-avatar__spark focus-avatar__spark--one"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="focus-avatar__spark focus-avatar__spark--two"
          aria-hidden="true"
        >
          ✦
        </span>
        <ChibiSprite
          scene={scene}
          className="focus-avatar__character"
          label={MOOD_LABELS[mood]}
        />
      </div>
      <div className="focus-avatar__speech" aria-live="polite">
        <strong>FocusBuddy</strong>
        <span>{MOOD_MESSAGES[mood]}</span>
      </div>
    </div>
  )
}

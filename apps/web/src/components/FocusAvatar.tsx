import owlShimejiSpriteSheet from '../assets/focusbuddy/owl-shimeji-provisional.png'

export type AvatarMood = 'idle' | 'focus' | 'paused' | 'completed'

const MOOD_MESSAGES: Record<AvatarMood, string> = {
  idle: 'Estoy listo cuando tú lo estés.',
  focus: 'Modo concentración activado.',
  paused: 'Respira. Retomamos cuando quieras.',
  completed: '¡Buen trabajo! Sumaste una nueva sesión.',
}

const MOOD_LABELS: Record<AvatarMood, string> = {
  idle: 'Kuco está disponible y esperando',
  focus: 'Kuco estudia durante la sesión activa',
  paused: 'Kuco descansa durante la pausa',
  completed: 'Kuco celebra la sesión completada',
}

/**
 * Hoja de Kuco 4x4: una fila por estado y cuatro fotogramas por animación.
 * La presentación permanece separada del temporizador y la persistencia.
 */
export function FocusAvatar({ mood }: { mood: AvatarMood }) {
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
        <div className="focus-avatar__character">
          <span
            className="focus-avatar__sprite"
            style={{ backgroundImage: `url(${owlShimejiSpriteSheet})` }}
            role="img"
            aria-label={MOOD_LABELS[mood]}
          />
        </div>
      </div>
      <div className="focus-avatar__speech" aria-live="polite">
        <strong>Kuco</strong>
        <span>{MOOD_MESSAGES[mood]}</span>
      </div>
    </div>
  )
}

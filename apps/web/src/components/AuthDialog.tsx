import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { ApiClientError, login, register, type KoneaUser } from '../api/auth'
import './AuthDialog.css'

export type AuthMode = 'login' | 'register'

type AuthDialogProps = {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: (user: KoneaUser) => void
}

const errorMessages: Record<string, string> = {
  ACCOUNT_ALREADY_EXISTS: 'Ese correo o nombre de usuario ya está registrado.',
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  TOO_MANY_ATTEMPTS: 'Hubo demasiados intentos. Espera unos minutos.',
  VALIDATION_ERROR: 'Revisa los campos marcados e inténtalo nuevamente.',
}

const fieldMessages: Record<string, string> = {
  email: 'Ingresa un correo electrónico válido.',
  password: 'La contraseña debe tener entre 10 y 128 caracteres.',
  username: 'Usa entre 3 y 30 letras, números, puntos o guiones bajos.',
  displayName: 'Ingresa un nombre de entre 2 y 100 caracteres.',
}

function getFieldError(
  fields: Record<string, string[] | undefined> | undefined,
  field: string,
) {
  return fields?.[field]?.[0] ? fieldMessages[field] : undefined
}

export function AuthDialog({
  mode,
  onModeChange,
  onClose,
  onAuthenticated,
}: AuthDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<
    Record<string, string[] | undefined> | undefined
  >()

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', closeWithEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [onClose, submitting])

  function switchMode(nextMode: AuthMode) {
    setError(null)
    setFields(undefined)
    onModeChange(nextMode)
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setFields(undefined)

    const data = new FormData(event.currentTarget)

    try {
      const email = String(data.get('email') ?? '')
      const password = String(data.get('password') ?? '')
      const user =
        mode === 'register'
          ? await register({
              email,
              password,
              username: String(data.get('username') ?? ''),
              displayName: String(data.get('displayName') ?? ''),
            })
          : await login({ email, password })

      onAuthenticated(user)
      onClose()
    } catch (requestError) {
      if (requestError instanceof ApiClientError) {
        setError(
          errorMessages[requestError.code] ??
            'No pudimos completar la solicitud. Inténtalo nuevamente.',
        )
        setFields(requestError.fields)
      } else {
        setError(
          'No fue posible conectar con Konea. Comprueba que la API esté activa.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isRegistration = mode === 'register'
  const title = isRegistration ? 'Crea tu cuenta' : 'Qué bueno verte de nuevo'

  return (
    <div className="dialog-backdrop" onMouseDown={closeFromBackdrop}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <button
          className="dialog-close"
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="dialog-brand">
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          Konea
        </div>

        <div
          className="auth-mode-tabs"
          role="tablist"
          aria-label="Acceso a Konea"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isRegistration}
            className={!isRegistration ? 'is-active' : undefined}
            onClick={() => switchMode('login')}
          >
            Ingresar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegistration}
            className={isRegistration ? 'is-active' : undefined}
            onClick={() => switchMode('register')}
          >
            Crear cuenta
          </button>
        </div>

        <div className="dialog-heading">
          <h2 id="auth-dialog-title">{title}</h2>
          <p>
            {isRegistration
              ? 'Empieza a construir tu comunidad universitaria.'
              : 'Ingresa para volver a conectar con tu campus.'}
          </p>
        </div>

        {error ? (
          <div className="form-alert" role="alert">
            {error}
          </div>
        ) : null}

        <form key={mode} className="auth-form" onSubmit={submit} noValidate>
          {isRegistration ? (
            <div className="form-row">
              <label>
                Nombre visible
                <input
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  autoFocus
                  aria-invalid={Boolean(getFieldError(fields, 'displayName'))}
                />
                <small>{getFieldError(fields, 'displayName')}</small>
              </label>

              <label>
                Usuario
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9._]+"
                  placeholder="nombre.apellido"
                  required
                  aria-invalid={Boolean(getFieldError(fields, 'username'))}
                />
                <small>{getFieldError(fields, 'username')}</small>
              </label>
            </div>
          ) : null}

          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="estudiante@universidad.cl"
              maxLength={320}
              required
              autoFocus={!isRegistration}
              aria-invalid={Boolean(getFieldError(fields, 'email'))}
            />
            <small>{getFieldError(fields, 'email')}</small>
          </label>

          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete={
                isRegistration ? 'new-password' : 'current-password'
              }
              minLength={isRegistration ? 10 : 1}
              maxLength={128}
              required
              aria-invalid={Boolean(getFieldError(fields, 'password'))}
            />
            <small>
              {getFieldError(fields, 'password') ??
                (isRegistration ? 'Mínimo 10 caracteres.' : '')}
            </small>
          </label>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'Procesando…'
              : isRegistration
                ? 'Crear mi cuenta'
                : 'Ingresar a Konea'}
          </button>
        </form>

        <p className="dialog-footnote">
          Tu sesión se guarda en una cookie segura y no exponemos credenciales
          en el navegador.
        </p>
      </section>
    </div>
  )
}

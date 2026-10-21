import {
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { ApiClientError, login, register, type KoneaUser } from '../api/auth'
import { useModalDialog } from '../hooks/useModalDialog'
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
  INVALID_CREDENTIALS: 'El correo, usuario o contraseña no son correctos.',
  TOO_MANY_ATTEMPTS: 'Hubo demasiados intentos. Espera unos minutos.',
  VALIDATION_ERROR: 'Revisa los campos marcados e inténtalo nuevamente.',
}

const fieldMessages: Record<string, string> = {
  email: 'Ingresa un correo electrónico válido.',
  identifier: 'Ingresa un correo o nombre de usuario válido.',
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

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      {visible ? (
        <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" />
      ) : null}
    </svg>
  )
}

export function AuthDialog({
  mode,
  onModeChange,
  onClose,
  onAuthenticated,
}: AuthDialogProps) {
  const id = useId()
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<
    Record<string, string[] | undefined> | undefined
  >()

  const dialogRef = useModalDialog<HTMLElement>({
    open: true,
    onClose,
    closeDisabled: submitting,
  })

  function switchMode(nextMode: AuthMode) {
    if (submitting || nextMode === mode) return
    setError(null)
    setFields(undefined)
    setPasswordVisible(false)
    onModeChange(nextMode)
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextMode =
      event.key === 'Home'
        ? 'login'
        : event.key === 'End'
          ? 'register'
          : mode === 'login'
            ? 'register'
            : 'login'
    switchMode(nextMode)
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('[data-auth-mode="' + nextMode + '"]')
      ?.focus()
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setFields(undefined)

    const data = new FormData(event.currentTarget)

    try {
      const password = String(data.get('password') ?? '')
      const user =
        mode === 'register'
          ? await register({
              email: String(data.get('email') ?? ''),
              password,
              username: String(data.get('username') ?? ''),
              displayName: String(data.get('displayName') ?? ''),
            })
          : await login({
              identifier: String(data.get('identifier') ?? ''),
              password,
            })

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
          'No pudimos conectarnos con Konea. Espera un momento e inténtalo otra vez.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isRegistration = mode === 'register'
  const identifierField = isRegistration ? 'email' : 'identifier'
  const passwordError = getFieldError(fields, 'password')

  return (
    <div className="dialog-backdrop" onMouseDown={closeFromBackdrop}>
      <section
        ref={dialogRef}
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id + '-title'}
        tabIndex={-1}
      >
        <button
          className="dialog-close"
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>

        <aside className="auth-story" aria-label="Tu espacio en Konea">
          <p className="auth-story__eyebrow">
            <span aria-hidden="true" /> Tu campus, contigo
          </p>
          <h2>
            Conecta con tu gente.
            <br />
            <em>Encuentra tu ritmo.</em>
          </h2>
          <p className="auth-story__description">
            Las personas, las ideas y los pequeños avances que hacen grande tu
            vida estudiantil. Todo en un mismo lugar.
          </p>

          <div className="auth-story__scene" aria-hidden="true">
            <div className="auth-story__orbit auth-story__orbit--one" />
            <div className="auth-story__orbit auth-story__orbit--two" />
            <div className="auth-story__spark">✦</div>
            <div className="auth-story__focus-card">
              <span className="auth-story__card-eyebrow">
                Un momento para avanzar
              </span>
              <div className="auth-story__timer">
                <svg viewBox="0 0 70 70" fill="none">
                  <circle
                    cx="35"
                    cy="35"
                    r="30"
                    stroke="currentColor"
                    strokeOpacity=".14"
                    strokeWidth="4"
                  />
                  <circle
                    cx="35"
                    cy="35"
                    r="30"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray="145 189"
                    strokeLinecap="round"
                    transform="rotate(-90 35 35)"
                  />
                  <path
                    d="M35 19v16l10 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <div>
                  <strong>25:00</strong>
                  <span>A tu ritmo, con Kuco</span>
                </div>
              </div>
              <div className="auth-story__task">
                <span>✓</span> Un pendiente menos. Un paso más.
              </div>
            </div>
            <div className="auth-story__community-card">
              <div className="auth-story__avatars">
                <span>VA</span>
                <span>MA</span>
                <span>TÚ</span>
              </div>
              <div>
                <strong>Tu próxima gran idea</strong>
                <span>puede empezar con una conexión.</span>
              </div>
            </div>
          </div>

          <p className="auth-story__closing">
            La vida universitaria se vive mejor en comunidad.
          </p>
        </aside>

        <div className="auth-dialog__content">
          <div className="dialog-brand">
            <img src="/konea-logo.svg" alt="Konea" width="124" height="44" />
          </div>

          <div
            className="auth-mode-tabs"
            role="tablist"
            aria-label="Acceso a Konea"
          >
            <button
              id={id + '-login-tab'}
              type="button"
              role="tab"
              data-auth-mode="login"
              aria-controls={id + '-panel'}
              aria-selected={!isRegistration}
              tabIndex={!isRegistration ? 0 : -1}
              className={!isRegistration ? 'is-active' : undefined}
              onClick={() => switchMode('login')}
              onKeyDown={handleTabKey}
              disabled={submitting}
            >
              Ingresar
            </button>
            <button
              id={id + '-register-tab'}
              type="button"
              role="tab"
              data-auth-mode="register"
              aria-controls={id + '-panel'}
              aria-selected={isRegistration}
              tabIndex={isRegistration ? 0 : -1}
              className={isRegistration ? 'is-active' : undefined}
              onClick={() => switchMode('register')}
              onKeyDown={handleTabKey}
              disabled={submitting}
            >
              Crear cuenta
            </button>
          </div>

          <div
            id={id + '-panel'}
            role="tabpanel"
            aria-labelledby={id + '-' + mode + '-tab'}
          >
            <div className="dialog-heading">
              <p className="dialog-heading__eyebrow">
                {isRegistration
                  ? 'Tu historia empieza aquí'
                  : 'Tu comunidad te espera'}
              </p>
              <h2 id={id + '-title'}>
                {isRegistration
                  ? 'Haz espacio para lo que viene.'
                  : 'Qué bueno tenerte de vuelta.'}
              </h2>
              <p>
                {isRegistration
                  ? 'Crea tu cuenta y empieza a vivir tu campus a tu manera.'
                  : 'Entra a tu espacio. Sigue donde lo dejaste.'}
              </p>
            </div>

            {error ? (
              <div className="form-alert" role="alert">
                {error}
              </div>
            ) : null}

            <form
              key={mode}
              className="auth-form"
              onSubmit={submit}
              aria-busy={submitting}
            >
              <fieldset disabled={submitting}>
                {isRegistration ? (
                  <div className="form-row">
                    <div className="auth-field">
                      <label htmlFor={id + '-display-name'}>
                        Nombre visible
                      </label>
                      <input
                        id={id + '-display-name'}
                        name="displayName"
                        type="text"
                        autoComplete="name"
                        placeholder="Tu nombre"
                        minLength={2}
                        maxLength={100}
                        required
                        data-modal-initial-focus
                        aria-invalid={Boolean(
                          getFieldError(fields, 'displayName'),
                        )}
                        aria-describedby={
                          getFieldError(fields, 'displayName')
                            ? id + '-name-error'
                            : undefined
                        }
                      />
                      {getFieldError(fields, 'displayName') ? (
                        <small id={id + '-name-error'}>
                          {getFieldError(fields, 'displayName')}
                        </small>
                      ) : null}
                    </div>
                    <div className="auth-field">
                      <label htmlFor={id + '-username'}>Usuario</label>
                      <input
                        id={id + '-username'}
                        name="username"
                        type="text"
                        autoComplete="username"
                        minLength={3}
                        maxLength={30}
                        pattern="[A-Za-z0-9._]+"
                        placeholder="nombre.apellido"
                        required
                        aria-invalid={Boolean(
                          getFieldError(fields, 'username'),
                        )}
                        aria-describedby={
                          getFieldError(fields, 'username')
                            ? id + '-username-error'
                            : undefined
                        }
                      />
                      {getFieldError(fields, 'username') ? (
                        <small id={id + '-username-error'}>
                          {getFieldError(fields, 'username')}
                        </small>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="auth-field">
                  <label htmlFor={id + '-identifier'}>
                    {isRegistration ? 'Correo electrónico' : 'Correo o usuario'}
                  </label>
                  <input
                    id={id + '-identifier'}
                    name={identifierField}
                    type={isRegistration ? 'email' : 'text'}
                    autoComplete={isRegistration ? 'email' : 'username'}
                    placeholder={
                      isRegistration
                        ? 'tu.correo@institucion.cl'
                        : 'Tu correo o nombre de usuario'
                    }
                    maxLength={320}
                    required
                    data-modal-initial-focus={!isRegistration || undefined}
                    aria-invalid={Boolean(
                      getFieldError(fields, identifierField),
                    )}
                    aria-describedby={
                      getFieldError(fields, identifierField)
                        ? id + '-identifier-error'
                        : undefined
                    }
                  />
                  {getFieldError(fields, identifierField) ? (
                    <small id={id + '-identifier-error'}>
                      {getFieldError(fields, identifierField)}
                    </small>
                  ) : null}
                </div>

                <div className="auth-field">
                  <label htmlFor={id + '-password'}>Contraseña</label>
                  <div className="auth-password-control">
                    <input
                      id={id + '-password'}
                      name="password"
                      type={passwordVisible ? 'text' : 'password'}
                      autoComplete={
                        isRegistration ? 'new-password' : 'current-password'
                      }
                      placeholder={
                        isRegistration
                          ? 'Crea una contraseña segura'
                          : 'Tu contraseña'
                      }
                      minLength={isRegistration ? 10 : 1}
                      maxLength={128}
                      required
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby={
                        passwordError || isRegistration
                          ? id + '-password-help'
                          : undefined
                      }
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      aria-label={
                        passwordVisible
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      aria-pressed={passwordVisible}
                      aria-controls={id + '-password'}
                    >
                      <PasswordVisibilityIcon visible={passwordVisible} />
                    </button>
                  </div>
                  {passwordError || isRegistration ? (
                    <small
                      id={id + '-password-help'}
                      className={
                        !passwordError ? 'auth-field__hint' : undefined
                      }
                    >
                      {passwordError ??
                        'Al menos 10 caracteres. Hazla tuya, mantenla privada.'}
                    </small>
                  ) : null}
                </div>

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="auth-submit__spinner" aria-hidden="true" />
                  ) : null}
                  <span>
                    {submitting
                      ? 'Un momento…'
                      : isRegistration
                        ? 'Crear mi cuenta'
                        : 'Entrar a Konea'}
                  </span>
                  {!submitting ? (
                    <span className="auth-submit__arrow" aria-hidden="true">
                      ↗
                    </span>
                  ) : null}
                </button>
              </fieldset>
            </form>
          </div>

          <p className="dialog-footnote">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="m10 2 6 2.5v4.7c0 3.4-2.4 6.3-6 8.8-3.6-2.5-6-5.4-6-8.8V4.5L10 2Z"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="m7 9.5 2 2 4-4"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
            <span>
              Tu espacio, tus decisiones. Tú eliges qué compartir y con quién
              conectar.
            </span>
          </p>
        </div>
      </section>
    </div>
  )
}

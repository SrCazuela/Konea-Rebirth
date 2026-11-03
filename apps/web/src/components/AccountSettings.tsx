import { useId, useState, type FormEvent, type ReactNode } from 'react'
import {
  ApiClientError,
  changePassword,
  updateAccount,
  type KoneaUser,
} from '../api/auth'
import './AccountSettings.css'

type AccountSettingsProps = {
  user: KoneaUser
  onUserChange: (user: KoneaUser) => void
  onLogout: () => Promise<void> | void
}

type FieldErrors = Record<string, string>

const fieldMessages: FieldErrors = {
  email: 'Ingresa un correo electrónico válido.',
  username: 'Usa entre 3 y 30 letras, números, puntos o guiones bajos.',
  displayName: 'Usa un nombre de entre 2 y 100 caracteres.',
  currentPassword: 'Ingresa tu contraseña actual.',
  newPassword: 'Usa una contraseña de entre 10 y 128 caracteres.',
}

function readError(error: unknown, fallback: string) {
  if (!(error instanceof ApiClientError))
    return { message: fallback, fields: {} }
  const fields: FieldErrors = {}
  for (const [name, errors] of Object.entries(error.fields ?? {})) {
    if (errors?.length && fieldMessages[name])
      fields[name] = fieldMessages[name]
  }
  if (error.code === 'CURRENT_PASSWORD_INCORRECT') {
    fields.currentPassword = 'La contraseña actual no es correcta.'
  }
  const messages: Record<string, string> = {
    CURRENT_PASSWORD_INCORRECT:
      'Comprueba tu contraseña actual e inténtalo nuevamente.',
    ACCOUNT_ALREADY_EXISTS: 'Ese correo o nombre de usuario ya está en uso.',
    VALIDATION_ERROR: 'Revisa los campos marcados antes de guardar.',
    TOO_MANY_ATTEMPTS:
      'Hubo demasiados intentos. Espera unos minutos y vuelve a intentar.',
  }
  return { message: messages[error.code] ?? error.message ?? fallback, fields }
}

function SettingsIcon({ kind }: { kind: 'account' | 'password' | 'logout' }) {
  const paths: Record<typeof kind, ReactNode> = {
    account: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    password: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    logout: <path d="M10 4H5v16h5M14 8l4 4-4 4M9 12h10" />,
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  isNew = false,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  isNew?: boolean
  hint?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="account-settings__field">
      <label htmlFor={id}>{label}</label>
      <div className="account-settings__password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={isNew ? 10 : 1}
          maxLength={128}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
        />
        <button
          type="button"
          className="account-settings__visibility"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="2.5" />
            {visible ? <path d="m4 4 16 16" /> : null}
          </svg>
        </button>
      </div>
      {error || hint ? (
        <small
          id={`${id}-help`}
          className={error ? 'account-settings__field-error' : undefined}
        >
          {error || hint}
        </small>
      ) : null}
    </div>
  )
}

export function AccountSettings({
  user,
  onUserChange,
  onLogout,
}: AccountSettingsProps) {
  const id = useId()
  const [account, setAccount] = useState({
    displayName: user.displayName,
    username: user.username,
    email: user.email,
  })
  const [accountPassword, setAccountPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [accountFields, setAccountFields] = useState<FieldErrors>({})
  const [passwordFields, setPasswordFields] = useState<FieldErrors>({})
  const [accountSuccess, setAccountSuccess] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const busy = savingAccount || savingPassword || signingOut
  const normalizedAccount = {
    displayName: account.displayName.trim(),
    username: account.username.trim().toLowerCase(),
    email: account.email.trim().toLowerCase(),
  }
  const changed =
    normalizedAccount.displayName !== user.displayName ||
    normalizedAccount.username !== user.username ||
    normalizedAccount.email !== user.email

  function focusField(suffix: string) {
    window.requestAnimationFrame(() => {
      document.getElementById(`${id}-${suffix}`)?.focus()
    })
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !changed) return
    setAccountError('')
    setAccountFields({})
    setAccountSuccess('')
    setSavingAccount(true)
    try {
      const updated = await updateAccount({
        ...normalizedAccount,
        currentPassword: accountPassword,
      })
      onUserChange(updated)
      setAccount({
        displayName: updated.displayName,
        username: updated.username,
        email: updated.email,
      })
      setAccountPassword('')
      setAccountSuccess(
        'Tus datos de cuenta se actualizaron. Ya puedes iniciar sesión con ellos.',
      )
    } catch (error) {
      const details = readError(
        error,
        'No pudimos guardar tus datos. Intenta nuevamente.',
      )
      setAccountError(details.message)
      setAccountFields(details.fields)
      const firstField = Object.keys(details.fields)[0]
      if (firstField) focusField(`account-${firstField}`)
    } finally {
      setSavingAccount(false)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setPasswordError('')
    setPasswordFields({})
    setPasswordSuccess('')
    if (newPassword !== confirmation) {
      setPasswordFields({
        confirmation: 'Las contraseñas nuevas no coinciden.',
      })
      setPasswordError('Confirma la nueva contraseña antes de continuar.')
      focusField('password-confirmation')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordFields({
        newPassword: 'Elige una contraseña diferente de la actual.',
      })
      setPasswordError('La nueva contraseña debe ser diferente de la actual.')
      focusField('password-newPassword')
      return
    }
    setSavingPassword(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setPasswordSuccess(
        'Contraseña actualizada. Las otras sesiones se cerraron; tu sesión actual sigue activa.',
      )
    } catch (error) {
      const details = readError(
        error,
        'No pudimos cambiar tu contraseña. Intenta nuevamente.',
      )
      setPasswordError(details.message)
      setPasswordFields(details.fields)
      const firstField = Object.keys(details.fields)[0]
      if (firstField) focusField(`password-${firstField}`)
    } finally {
      setSavingPassword(false)
    }
  }

  async function signOut() {
    if (busy) return
    setLogoutError('')
    setSigningOut(true)
    try {
      await onLogout()
    } catch {
      setLogoutError(
        'No pudimos cerrar la sesión. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <section className="account-settings" aria-labelledby={`${id}-title`}>
      <div className="account-settings__intro">
        <div>
          <span className="account-settings__eyebrow">
            TU ESPACIO, A TU MANERA
          </span>
          <h2 id={`${id}-title`}>Configuración de cuenta</h2>
          <p>
            Actualiza tus datos de acceso y cuida la seguridad de tu cuenta.
          </p>
        </div>
        <span className="account-settings__private">
          <SettingsIcon kind="password" /> Ajustes privados
        </span>
      </div>
      <div className="account-settings__grid">
        <section
          className="account-settings__card"
          aria-labelledby={`${id}-details-title`}
        >
          <div className="account-settings__card-heading">
            <span className="account-settings__icon">
              <SettingsIcon kind="account" />
            </span>
            <div>
              <h3 id={`${id}-details-title`}>Datos de tu cuenta</h3>
              <p>Tu correo y usuario sirven para iniciar sesión.</p>
            </div>
          </div>
          <form onSubmit={(event) => void saveAccount(event)}>
            <fieldset disabled={busy}>
              <div className="account-settings__field">
                <label htmlFor={`${id}-account-displayName`}>
                  Nombre visible
                </label>
                <input
                  id={`${id}-account-displayName`}
                  value={account.displayName}
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={100}
                  onChange={(event) => {
                    setAccount({ ...account, displayName: event.target.value })
                    setAccountSuccess('')
                  }}
                  aria-invalid={Boolean(accountFields.displayName)}
                  aria-describedby={
                    accountFields.displayName ? `${id}-name-error` : undefined
                  }
                />
                {accountFields.displayName ? (
                  <small
                    id={`${id}-name-error`}
                    className="account-settings__field-error"
                  >
                    {accountFields.displayName}
                  </small>
                ) : null}
              </div>
              <div className="account-settings__field">
                <label htmlFor={`${id}-account-username`}>
                  Nombre de usuario
                </label>
                <input
                  id={`${id}-account-username`}
                  value={account.username}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9._]{3,30}"
                  onChange={(event) => {
                    setAccount({ ...account, username: event.target.value })
                    setAccountSuccess('')
                  }}
                  aria-invalid={Boolean(accountFields.username)}
                  aria-describedby={`${id}-username-help`}
                />
                <small
                  id={`${id}-username-help`}
                  className={
                    accountFields.username
                      ? 'account-settings__field-error'
                      : undefined
                  }
                >
                  {accountFields.username ||
                    'Entre 3 y 30 letras, números, puntos o guiones bajos.'}
                </small>
              </div>
              <div className="account-settings__field">
                <label htmlFor={`${id}-account-email`}>
                  Correo electrónico
                </label>
                <input
                  id={`${id}-account-email`}
                  type="email"
                  value={account.email}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={320}
                  onChange={(event) => {
                    setAccount({ ...account, email: event.target.value })
                    setAccountSuccess('')
                  }}
                  aria-invalid={Boolean(accountFields.email)}
                  aria-describedby={
                    accountFields.email ? `${id}-email-error` : undefined
                  }
                />
                {accountFields.email ? (
                  <small
                    id={`${id}-email-error`}
                    className="account-settings__field-error"
                  >
                    {accountFields.email}
                  </small>
                ) : null}
              </div>
              <PasswordField
                id={`${id}-account-currentPassword`}
                label="Contraseña actual"
                value={accountPassword}
                onChange={setAccountPassword}
                error={accountFields.currentPassword}
                hint="Confirma tu contraseña para guardar estos datos."
              />
              <p className="account-settings__security-note">
                <SettingsIcon kind="password" /> Al guardar, se cerrarán las
                sesiones abiertas en otros dispositivos.
              </p>
              <button
                className="account-settings__button account-settings__button--primary"
                type="submit"
                disabled={!changed}
              >
                {savingAccount
                  ? 'Guardando cambios…'
                  : 'Guardar datos de cuenta'}
              </button>
            </fieldset>
            {accountError ? (
              <p
                className="account-settings__notice account-settings__notice--error"
                role="alert"
              >
                {accountError}
              </p>
            ) : null}
            {accountSuccess ? (
              <p
                className="account-settings__notice account-settings__notice--success"
                role="status"
              >
                {accountSuccess}
              </p>
            ) : null}
          </form>
        </section>
        <section
          className="account-settings__card"
          aria-labelledby={`${id}-security-title`}
        >
          <div className="account-settings__card-heading">
            <span className="account-settings__icon">
              <SettingsIcon kind="password" />
            </span>
            <div>
              <h3 id={`${id}-security-title`}>Cambiar contraseña</h3>
              <p>Elige una contraseña que uses solo en Konea.</p>
            </div>
          </div>
          <form onSubmit={(event) => void savePassword(event)}>
            <fieldset disabled={busy}>
              <PasswordField
                id={`${id}-password-currentPassword`}
                label="Contraseña actual"
                value={currentPassword}
                onChange={(value) => {
                  setCurrentPassword(value)
                  setPasswordSuccess('')
                }}
                error={passwordFields.currentPassword}
              />
              <PasswordField
                id={`${id}-password-newPassword`}
                label="Nueva contraseña"
                value={newPassword}
                onChange={(value) => {
                  setNewPassword(value)
                  setPasswordSuccess('')
                }}
                error={passwordFields.newPassword}
                isNew
                hint="Entre 10 y 128 caracteres. Puedes usar una frase fácil de recordar."
              />
              <PasswordField
                id={`${id}-password-confirmation`}
                label="Confirmar nueva contraseña"
                value={confirmation}
                onChange={setConfirmation}
                error={passwordFields.confirmation}
                isNew
              />
              <p className="account-settings__security-note">
                <SettingsIcon kind="password" /> Al cambiarla, se cerrarán las
                sesiones abiertas en otros dispositivos.
              </p>
              <button
                className="account-settings__button account-settings__button--primary"
                type="submit"
              >
                {savingPassword
                  ? 'Actualizando contraseña…'
                  : 'Actualizar contraseña'}
              </button>
            </fieldset>
            {passwordError ? (
              <p
                className="account-settings__notice account-settings__notice--error"
                role="alert"
              >
                {passwordError}
              </p>
            ) : null}
            {passwordSuccess ? (
              <p
                className="account-settings__notice account-settings__notice--success"
                role="status"
              >
                {passwordSuccess}
              </p>
            ) : null}
          </form>
        </section>
      </div>
      <section
        className="account-settings__card account-settings__session"
        aria-labelledby={`${id}-session-title`}
      >
        <div className="account-settings__card-heading">
          <span className="account-settings__icon account-settings__icon--logout">
            <SettingsIcon kind="logout" />
          </span>
          <div>
            <h3 id={`${id}-session-title`}>Tu sesión en este dispositivo</h3>
            <p>Cuando termines, cierra sesión para proteger tu cuenta.</p>
          </div>
        </div>
        <button
          type="button"
          className="account-settings__button account-settings__button--logout"
          onClick={() => void signOut()}
          disabled={busy}
        >
          <SettingsIcon kind="logout" />
          {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {logoutError ? (
          <p
            className="account-settings__notice account-settings__notice--error"
            role="alert"
          >
            {logoutError}
          </p>
        ) : null}
      </section>
    </section>
  )
}

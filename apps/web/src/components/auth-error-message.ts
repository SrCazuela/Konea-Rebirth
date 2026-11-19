import { ApiClientError } from '../api/base'

const errorMessages: Record<string, string> = {
  ACCOUNT_ALREADY_EXISTS: 'Ese correo o nombre de usuario ya está registrado.',
  INVALID_CREDENTIALS: 'El correo, usuario o contraseña no son correctos.',
  TOO_MANY_ATTEMPTS: 'Hubo demasiados intentos. Espera unos minutos.',
  VALIDATION_ERROR: 'Revisa los campos marcados e inténtalo nuevamente.',
  BACKEND_BUSY:
    'El servidor está ocupado temporalmente. Espera un minuto e inténtalo de nuevo.',
  BACKEND_UNAVAILABLE:
    'El servidor de Konea está iniciando o no está disponible. Espera un minuto e inténtalo de nuevo.',
  BACKEND_STARTING:
    'El servidor sigue iniciando. Espera un momento e inténtalo de nuevo.',
  HOSTING_NOT_CONFIGURED:
    'Konea aún no está listo para recibir conexiones. Inténtalo más tarde.',
  REQUEST_TIMEOUT:
    'El servidor tardó demasiado en responder. Espera un momento y vuelve a intentarlo.',
  INVALID_BACKEND_RESPONSE:
    'El servidor de Konea respondió de forma inesperada. Espera un momento y vuelve a intentarlo.',
}

export function authErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return (
      errorMessages[error.code] ??
      'No pudimos completar la solicitud. Inténtalo nuevamente.'
    )
  }
  return 'No pudimos conectarnos con Konea. Espera un momento e inténtalo otra vez.'
}

import { describe, expect, it } from 'vitest'
import { ApiClientError } from '../api/base'
import { authErrorMessage } from './auth-error-message'

describe('authentication error feedback', () => {
  it('explains an unavailable service instead of suggesting wrong credentials', () => {
    const message = authErrorMessage(
      new ApiClientError(
        503,
        'BACKEND_UNAVAILABLE',
        'Internal provider detail',
      ),
    )
    expect(message).toContain('iniciando o no está disponible')
    expect(message).toContain('Espera un minuto')
    expect(message).not.toContain('Internal provider detail')
  })

  it.each([
    ['BACKEND_BUSY', 'ocupado temporalmente'],
    ['BACKEND_STARTING', 'sigue iniciando'],
    ['REQUEST_TIMEOUT', 'tardó demasiado'],
    ['HOSTING_NOT_CONFIGURED', 'aún no está listo'],
    ['INVALID_BACKEND_RESPONSE', 'forma inesperada'],
  ])('provides clear feedback for %s', (code, expected) => {
    expect(
      authErrorMessage(new ApiClientError(503, code, 'provider detail')),
    ).toContain(expected)
  })

  it('retains the existing invalid credential feedback', () => {
    expect(
      authErrorMessage(
        new ApiClientError(401, 'INVALID_CREDENTIALS', 'Invalid'),
      ),
    ).toBe('El correo, usuario o contraseña no son correctos.')
  })

  it('keeps an unknown application error generic and handles network failures separately', () => {
    expect(
      authErrorMessage(
        new ApiClientError(500, 'UNKNOWN', 'private diagnostic'),
      ),
    ).toBe('No pudimos completar la solicitud. Inténtalo nuevamente.')
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toContain(
      'No pudimos conectarnos',
    )
  })
})

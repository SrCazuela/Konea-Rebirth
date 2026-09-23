import { describe, expect, it } from 'vitest'
import {
  httpOrLocalUploadUrlSchema,
  httpUrlSchema,
  localUploadPathSchema,
} from './url-schemas.js'

const uploadPath =
  '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.png'

describe('URL schemas', () => {
  it('accepts HTTPS, local HTTP and exact local upload paths', () => {
    expect(httpUrlSchema.parse('https://konea.example/perfil')).toBe(
      'https://konea.example/perfil',
    )
    expect(httpUrlSchema.parse('http://localhost:5173/recurso')).toBe(
      'http://localhost:5173/recurso',
    )
    expect(localUploadPathSchema.parse(uploadPath)).toBe(uploadPath)
    expect(httpOrLocalUploadUrlSchema.parse(uploadPath)).toBe(uploadPath)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,malicioso',
    'file:///C:/secreto.txt',
    'ftp://example.test/archivo',
    'http://example.test/sin-cifrar',
    'https://usuario:clave@example.test/privado',
  ])('rejects unsafe external URL %s', (value) => {
    expect(httpUrlSchema.safeParse(value).success).toBe(false)
    expect(httpOrLocalUploadUrlSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    '/api/v1/uploads/files/../secreto.png',
    '/api/v1/uploads/files/avatar.png',
    '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.svg',
    '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.png?x=1',
  ])('rejects malformed local upload path %s', (value) => {
    expect(localUploadPathSchema.safeParse(value).success).toBe(false)
    expect(httpOrLocalUploadUrlSchema.safeParse(value).success).toBe(false)
  })
})

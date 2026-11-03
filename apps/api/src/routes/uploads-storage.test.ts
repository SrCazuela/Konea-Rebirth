import express, { type ErrorRequestHandler } from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors/api-error.js'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  storage: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  getStorage: vi.fn(),
  user: { id: '00000000-0000-4000-8000-000000000001', role: 'student' },
}))
vi.mock('../db/client.js', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}))
vi.mock('../services/upload-storage.js', () => ({
  UPLOAD_DIRECTORY: 'unused-in-memory-test',
  getUploadStorage: mocks.getStorage,
}))
vi.mock('../services/post-service.js', () => ({ getPostForUser: vi.fn() }))
vi.mock('../middleware/authentication.js', () => ({
  requireAuthentication: (
    _request: unknown,
    response: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    response.locals.currentUser = mocks.user
    next()
  },
  getAuthenticatedUser: () => mocks.user,
}))
import { uploadsRouter } from './uploads.js'

function appForUploads() {
  const app = express()
  app.use('/api/v1/uploads', uploadsRouter)
  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    response.status(error instanceof ApiError ? error.status : 500).json({
      error: {
        code: error instanceof ApiError ? error.code : 'INTERNAL_SERVER_ERROR',
      },
    })
  }
  app.use(errorHandler)
  return app
}

const name = '11111111-2222-4333-8444-555555555555.png'
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('upload authorization and persistence boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getStorage.mockReturnValue(mocks.storage)
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    })
    mocks.storage.get.mockResolvedValue(image)
    mocks.storage.put.mockResolvedValue(undefined)
    mocks.storage.remove.mockResolvedValue(undefined)
  })

  it('never reads the private bucket when there is no authorized file record', async () => {
    await request(appForUploads())
      .get(`/api/v1/uploads/files/${name}`)
      .expect(404)
    expect(mocks.getStorage).not.toHaveBeenCalled()
    expect(mocks.storage.get).not.toHaveBeenCalled()
  })

  it('serves the owner through the API without issuing a public storage URL', async () => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [{ ownerId: mocks.user.id }] }),
      }),
    })
    const response = await request(appForUploads())
      .get(`/api/v1/uploads/files/${name}`)
      .expect(200)
    expect(response.headers['content-type']).toMatch(/^image\/png/)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers.location).toBeUndefined()
    expect(mocks.storage.get).toHaveBeenCalledExactlyOnceWith(name)
  })

  it('does not persist a file with a false MIME signature', async () => {
    await request(appForUploads())
      .post('/api/v1/uploads/files')
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(415)
    expect(mocks.storage.put).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('removes the private blob if its database transaction fails', async () => {
    mocks.transaction.mockImplementation(
      async (operation: (transaction: unknown) => Promise<void>) => {
        await operation({
          execute: async () => undefined,
          select: () => ({
            from: () => ({ where: async () => [{ total: 0 }] }),
          }),
          insert: () => ({
            values: async () => {
              throw new Error('database unavailable')
            },
          }),
        })
      },
    )
    await request(appForUploads())
      .post('/api/v1/uploads/files')
      .attach('file', image, { filename: 'test.png', contentType: 'image/png' })
      .expect(500)
    expect(mocks.storage.put).toHaveBeenCalledOnce()
    const key = mocks.storage.put.mock.calls[0]![0]
    expect(mocks.storage.remove).toHaveBeenCalledExactlyOnceWith(key)
  })

  it('does not insert metadata when the object store is unavailable', async () => {
    const insert = vi.fn()
    mocks.storage.put.mockRejectedValue(
      new ApiError(503, 'UPLOAD_STORAGE_UNAVAILABLE', 'Unavailable'),
    )
    mocks.transaction.mockImplementation(
      async (operation: (transaction: unknown) => Promise<void>) => {
        await operation({
          execute: async () => undefined,
          select: () => ({
            from: () => ({ where: async () => [{ total: 0 }] }),
          }),
          insert,
        })
      },
    )
    await request(appForUploads())
      .post('/api/v1/uploads/files')
      .attach('file', image, { filename: 'test.png', contentType: 'image/png' })
      .expect(503)
    expect(insert).not.toHaveBeenCalled()
    expect(mocks.storage.remove).not.toHaveBeenCalled()
  })
})

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import {
  createFilesystemUploadStorage,
  createS3UploadStorage,
} from './upload-storage.js'

const name = '11111111-2222-4333-8444-555555555555.png'

describe('private upload storage', () => {
  it('preserves existing filesystem names and never overwrites an existing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'konea-storage-'))
    try {
      const store = createFilesystemUploadStorage(directory)
      await store.put(name, Buffer.from('original'), 'image/png')
      await expect(
        store.put(name, Buffer.from('replacement'), 'image/png'),
      ).rejects.toMatchObject({ code: 'EEXIST' })
      expect(await store.get(name)).toEqual(Buffer.from('original'))
      expect(await readFile(join(directory, name))).toEqual(
        Buffer.from('original'),
      )
      await store.remove(name)
      await expect(store.get(name)).rejects.toMatchObject({
        status: 404,
        code: 'UPLOAD_NOT_FOUND',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('sends only private objects under the original database key', async () => {
    const send = vi.fn().mockResolvedValue({})
    const store = createS3UploadStorage('private-test-bucket', {
      send,
    } as unknown as Pick<S3Client, 'send'>)
    const bytes = Buffer.from('image')
    await store.put(name, bytes, 'image/png')
    const command = send.mock.calls[0]![0] as PutObjectCommand
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input).toEqual({
      Bucket: 'private-test-bucket',
      Key: name,
      Body: bytes,
      ContentType: 'image/png',
      CacheControl: 'private, no-store',
    })
    expect(command.input).not.toHaveProperty('ACL')
    await store.remove(name)
    expect(send.mock.calls[1]![0]).toBeInstanceOf(DeleteObjectCommand)
  })

  it('consumes the returned S3 body and translates missing objects', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) },
    })
    const store = createS3UploadStorage('private-test-bucket', {
      send,
    } as unknown as Pick<S3Client, 'send'>)
    expect(await store.get(name)).toEqual(Buffer.from([1, 2, 3]))
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand)
    send.mockRejectedValueOnce({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    })
    await expect(store.get(name)).rejects.toMatchObject({
      status: 404,
      code: 'UPLOAD_NOT_FOUND',
    })
  })

  it('does not expose provider errors or credentials in failures', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error('https://provider.invalid?signature=SECRET'))
    const store = createS3UploadStorage('private-test-bucket', {
      send,
    } as unknown as Pick<S3Client, 'send'>)
    for (const operation of [
      () => store.put(name, Buffer.from('image'), 'image/png'),
      () => store.get(name),
      () => store.remove(name),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        status: 503,
        code: 'UPLOAD_STORAGE_UNAVAILABLE',
      })
      try {
        await operation()
      } catch (error) {
        expect(String(error)).not.toContain('SECRET')
        expect(error).not.toHaveProperty('cause')
      }
    }
  })

  it('rejects path traversal before invoking S3', async () => {
    const send = vi.fn()
    const store = createS3UploadStorage('private-test-bucket', {
      send,
    } as unknown as Pick<S3Client, 'send'>)
    await expect(store.get('../private.env')).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      store.put('/absolute.png', Buffer.from(''), 'image/png'),
    ).rejects.toMatchObject({ status: 400 })
    await expect(store.remove(`${name}/extra`)).rejects.toMatchObject({
      status: 400,
    })
    expect(send).not.toHaveBeenCalled()
  })
})

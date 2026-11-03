import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  validateStorageEndpoint,
  verifyUploadSnapshot,
} from './import-hosted-uploads.mjs'

const name = '11111111-2222-4333-8444-555555555555.png'
const contents = Buffer.from('fixture')
function manifest() {
  return {
    formatVersion: 1,
    completed: true,
    uploads: {
      missingFiles: [],
      files: [
        {
          storedName: name,
          relativePath: `uploads/${name}`,
          mimeType: 'image/png',
          size: contents.length,
          sha256: createHash('sha256').update(contents).digest('hex'),
        },
      ],
    },
  }
}

test('migration credentials are sent only to a configured HTTPS Neon endpoint', () => {
  assert.equal(
    validateStorageEndpoint(
      'https://br-example.storage.c-2.us-east-2.aws.neon.tech',
    ).protocol,
    'https:',
  )
  for (const value of [
    'http://br-example.storage.c-2.us-east-2.aws.neon.tech',
    'https://neon.tech.attacker.invalid',
    'https://localhost',
    'https://key:secret@br-example.storage.c-2.us-east-2.aws.neon.tech',
    'https://br-example.storage.c-2.us-east-2.aws.neon.tech?token=secret',
  ])
    assert.throws(() => validateStorageEndpoint(value))
})

test('a complete snapshot is verified before any remote copy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'konea-upload-migration-'))
  try {
    await mkdir(join(directory, 'uploads'))
    await writeFile(join(directory, 'uploads', name), contents)
    assert.equal((await verifyUploadSnapshot(directory, manifest())).length, 1)
    await writeFile(join(directory, 'uploads', name), 'tampered')
    await assert.rejects(verifyUploadSnapshot(directory, manifest()), /SHA-256/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('missing uploads and path traversal stop the migration', async () => {
  const invalid = manifest()
  invalid.uploads.missingFiles.push('missing')
  await assert.rejects(verifyUploadSnapshot('unused', invalid), /incompleto/)
  const traversal = manifest()
  traversal.uploads.files[0].relativePath = '../private.env'
  await assert.rejects(verifyUploadSnapshot('unused', traversal), /inválido/)
})

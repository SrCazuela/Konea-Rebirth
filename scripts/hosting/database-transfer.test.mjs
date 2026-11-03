import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isLocalAddress,
  sessionSafeRestoreList,
  validateHostedTarget,
} from './database-transfer-common.mjs'

const source = 'postgresql://user:local-secret@localhost:5432/konea'

test('restore rejects every local or private target even with different credentials', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.1.50',
    '[::1]',
    'host.docker.internal',
  ]) {
    assert.throws(() =>
      validateHostedTarget(
        `postgresql://other:remote-secret@${host}:5432/other?sslmode=require`,
        source,
      ),
    )
  }
  assert.equal(isLocalAddress('172.16.0.1'), true)
  assert.equal(isLocalAddress('100.64.0.1'), true)
  assert.equal(isLocalAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLocalAddress('8.8.8.8'), false)
})

test('restore requires encrypted remote PostgreSQL and refuses unsafe parameters', () => {
  assert.throws(() =>
    validateHostedTarget('postgresql://u:p@db.example.com/hosting', source),
  )
  assert.throws(() =>
    validateHostedTarget(
      'postgresql://u:p@db.example.com/hosting?sslmode=disable',
      source,
    ),
  )
  assert.throws(() =>
    validateHostedTarget(
      'postgresql://u:p@db.example.com/hosting?sslmode=require&options=-cfoo',
      source,
    ),
  )
  assert.deepEqual(
    validateHostedTarget(
      'postgresql://u:p@ep-test.neon.tech/hosting?sslmode=require&channel_binding=require',
      source,
    ),
    { host: 'ep-test.neon.tech', port: '5432', name: 'hosting' },
  )
})

test('restore omits session tokens but preserves accounts and all other table data', () => {
  const original =
    '100; 0 0 TABLE public user_sessions user\n101; 0 123 TABLE DATA public user_sessions user\n102; 0 124 TABLE DATA public users user\n103; 0 125 TABLE DATA public study_sessions user\n'
  const result = sessionSafeRestoreList(original)
  assert.ok(result.includes('TABLE public user_sessions'))
  assert.ok(!result.includes('TABLE DATA public user_sessions'))
  assert.ok(result.includes('TABLE DATA public users'))
  assert.ok(result.includes('TABLE DATA public study_sessions'))
})

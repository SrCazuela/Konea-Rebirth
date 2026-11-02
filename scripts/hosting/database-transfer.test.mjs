import assert from 'node:assert/strict'
import { basename, join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  isLocalAddress,
  sessionSafeRestoreList,
  validateHostedTarget,
  validateSessionPolicy,
} from './database-transfer-common.mjs'
import {
  nativeRestorePlan,
  parseRestoreArguments,
  restoreHostedDatabase,
  verificationSql,
} from './restore-hosted-database.mjs'

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

const archiveLines = [
  '; Archive metadata',
  '100; 0 0 TABLE public user_sessions user',
  '101; 0 123 TABLE DATA public user_sessions user',
  '102; 0 124 TABLE DATA public users user',
  '103; 0 125 TABLE DATA public study_sessions user',
  '104; 0 126 TABLE DATA public user_sessions_history user',
  '105; 0 127 TABLE DATA audit user_sessions user',
  '106; 0 128 CONSTRAINT public user_sessions user_sessions_pkey user',
  '107; 0 129 INDEX public user_sessions_token_hash_unique user',
  '',
]
const originalArchive = archiveLines.join('\n')
const tableCounts = [
  { schema: 'public', name: 'user_sessions', count: '17' },
  { schema: 'public', name: 'users', count: '73' },
  { schema: 'public', name: 'study_sessions', count: '489' },
  { schema: 'audit', name: 'user_sessions', count: '4' },
]

test('explicit inclusion preserves the complete archive list byte for byte', () => {
  assert.equal(
    sessionSafeRestoreList(originalArchive, { sessionPolicy: 'include' }),
    originalArchive,
  )
})

test('explicit exclusion removes only login session rows and preserves other tables and schema', () => {
  const result = sessionSafeRestoreList(originalArchive, {
    sessionPolicy: 'exclude',
  })
  assert.equal(
    result,
    archiveLines.filter((line) => line !== archiveLines[2]).join('\n'),
  )
})

test('count verification includes all 17 session rows only when requested', () => {
  for (const sessionPolicy of ['include', 'exclude']) {
    const sql = verificationSql(tableCounts, { sessionPolicy })
    assert.ok(
      sql.includes(
        `FROM "public"."user_sessions") <> ${sessionPolicy === 'include' ? 17 : 0} THEN`,
      ),
    )
    for (const table of tableCounts.slice(1)) {
      assert.ok(
        sql.includes(
          `FROM "${table.schema}"."${table.name}") <> ${table.count} THEN`,
        ),
      )
    }
  }
})

test('every restore entry point requires an explicit valid session policy', async () => {
  for (const sessionPolicy of [undefined, null, true, '', 'all', 'INCLUDE']) {
    assert.throws(() => validateSessionPolicy(sessionPolicy), /--sessions/)
    assert.throws(
      () => sessionSafeRestoreList(originalArchive, { sessionPolicy }),
      /--sessions/,
    )
    assert.throws(
      () => verificationSql(tableCounts, { sessionPolicy }),
      /--sessions/,
    )
    // This cannot read a backup or credentials, or make a connection: policy
    // validation must reject before trying the deliberately nonexistent path.
    await assert.rejects(
      restoreHostedDatabase('nonexistent-policy-test-backup', {
        sessionPolicy,
      }),
      /--sessions/,
    )
  }
  await assert.rejects(restoreHostedDatabase(), /--sessions/)
  assert.throws(() => sessionSafeRestoreList(originalArchive), /--sessions/)
  assert.throws(() => verificationSql(tableCounts), /--sessions/)
})

test('CLI accepts either explicit policy and either flag order', () => {
  for (const sessionPolicy of ['include', 'exclude']) {
    const expected = { backupArgument: 'backup with spaces', sessionPolicy }
    assert.deepEqual(
      parseRestoreArguments([
        '--backup',
        expected.backupArgument,
        '--sessions',
        sessionPolicy,
      ]),
      expected,
    )
    assert.deepEqual(
      parseRestoreArguments([
        '--sessions',
        sessionPolicy,
        '--backup',
        expected.backupArgument,
      ]),
      expected,
    )
  }
})

test('CLI rejects omitted, invalid, duplicate and unknown options', () => {
  for (const args of [
    [],
    ['--backup', 'backup'],
    ['--sessions', 'include'],
    ['--backup', 'backup', '--sessions', 'all'],
    ['--backup', 'backup', '--sessions', ''],
    ['--backup', '', '--sessions', 'include'],
    ['--backup', 'backup', '--backup', 'other'],
    ['--sessions', 'include', '--sessions', 'exclude'],
    ['--backup', 'backup', '--unknown', 'include'],
    ['--backup', '--sessions', '--sessions', 'include'],
    ['--backup', 'backup', '--sessions', 'include', '--sessions', 'exclude'],
  ]) {
    assert.throws(() => parseRestoreArguments(args), /--sessions/)
  }
})

test('count verification rejects unsafe manifest counts under both policies', () => {
  const unsafeTables = [
    { schema: 'public', name: 'users', count: '1; DROP TABLE users;' },
  ]
  for (const sessionPolicy of ['include', 'exclude']) {
    assert.throws(
      () => verificationSql(unsafeTables, { sessionPolicy }),
      /Conteo invalido/,
    )
  }
})

test('native restore keeps credentials out of arguments and overrides inherited libpq connections', () => {
  const environment = {
    PATH: 'preserved-path',
    PGHOST: 'wrong-host',
    PGDATABASE: 'wrong-database',
    PGSERVICE: 'wrong-service',
    PGSERVICEFILE: 'wrong-service-file',
    PGPASSFILE: 'wrong-password-file',
    pgOptions: '-c unsafe-setting',
  }
  const before = { ...environment }
  const target =
    'postgresql://sentinel-user:sentinel%3Apassword@ep-test.neon.tech:5433/konea?sslmode=verify-full&channel_binding=require'
  const plan = nativeRestorePlan(
    resolve('postgres tools'),
    resolve('backup snapshot', 'restore-work'),
    target,
    { environment },
  )
  for (const step of [plan.pgRestore, plan.psql]) {
    assert.doesNotMatch([step.command, ...step.args].join('\n'), /sentinel/)
    assert.ok(!step.args.some((arg) => arg.includes('postgresql://')))
  }
  assert.equal(plan.psql.env.PGHOST, 'ep-test.neon.tech')
  assert.equal(plan.psql.env.PGPORT, '5433')
  assert.equal(plan.psql.env.PGDATABASE, 'konea')
  assert.equal(plan.psql.env.PGUSER, 'sentinel-user')
  assert.equal(plan.psql.env.PGPASSWORD, 'sentinel:password')
  assert.equal(plan.psql.env.PGSSLMODE, 'verify-full')
  assert.equal(plan.psql.env.PGCHANNELBINDING, 'require')
  assert.equal(plan.psql.env.PATH, environment.PATH)
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'pgOptions']) {
    assert.ok(!(key in plan.psql.env))
  }
  assert.deepEqual(environment, before)
})

test('native restore renders offline and executes guard, restore and verification in one failing transaction', () => {
  const work = resolve('backup snapshot', 'restore-work')
  const plan = nativeRestorePlan(
    resolve('postgres tools'),
    work,
    'postgresql://u:p@ep-test.neon.tech/konea?sslmode=require',
    { environment: {} },
  )
  assert.ok(plan.pgRestore.args.includes(`--file=${join(work, 'restore.sql')}`))
  assert.ok(!plan.pgRestore.args.some((arg) => arg.startsWith('--dbname')))
  assert.ok(plan.psql.args.includes('--single-transaction'))
  assert.ok(plan.psql.args.includes('--set=ON_ERROR_STOP=1'))
  assert.ok(plan.psql.args.includes('--no-password'))
  assert.ok(plan.psql.args.includes('--no-psqlrc'))
  assert.deepEqual(
    plan.psql.args
      .filter((arg) => arg.startsWith('--file='))
      .map((arg) => basename(arg.slice('--file='.length))),
    ['guard.sql', 'restore.sql', 'verify.sql'],
  )
})

test('native tools require absolute paths and add executable suffix only on Windows', () => {
  const target = 'postgresql://u:p@ep-test.neon.tech/konea?sslmode=require'
  assert.throws(
    () => nativeRestorePlan('relative-tools', resolve('work'), target),
    /PG_TOOLS_DIRECTORY/,
  )
  assert.throws(
    () => nativeRestorePlan(resolve('tools'), 'relative-work', target),
    /absoluto/,
  )
  for (const platform of ['win32', 'linux']) {
    const plan = nativeRestorePlan(resolve('tools'), resolve('work'), target, {
      environment: {},
      platform,
    })
    const extension = platform === 'win32' ? '.exe' : ''
    assert.equal(basename(plan.pgRestore.command), `pg_restore${extension}`)
    assert.equal(basename(plan.psql.command), `psql${extension}`)
  }
})

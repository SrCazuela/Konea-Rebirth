import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { Client } from 'pg'
import { expect, it } from 'vitest'
import { env } from '../config/env.js'

const directory = dirname(fileURLToPath(import.meta.url))
const migrations = readMigrationFiles({
  migrationsFolder: resolve(directory, '../../drizzle'),
})
const databasePattern = /^konea_kuco_migration_test_[a-f0-9]{32}$/

function isolatedDatabaseIdentifier(value: string) {
  if (!databasePattern.test(value))
    throw new Error(
      'Refusing to operate on a database without the isolated test prefix.',
    )
  return `"${value}"`
}

it('renames the assistant without losing historical rows, workflow states or constraints', async (context) => {
  const connection = new URL(env.DATABASE_URL)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname)) {
    context.skip(
      'Migration regression only runs against an explicitly local PostgreSQL server.',
    )
    return
  }
  const databaseName = `konea_kuco_migration_test_${randomUUID().replaceAll('-', '')}`
  expect(databaseName).toMatch(databasePattern)
  const administration = new URL(connection)
  administration.pathname = '/postgres'
  const admin = new Client({
    connectionString: administration.toString(),
    connectionTimeoutMillis: 5_000,
  })
  let fixture: Client | undefined
  let created = false
  try {
    await admin.connect()
    try {
      await admin.query(
        `CREATE DATABASE ${isolatedDatabaseIdentifier(databaseName)}`,
      )
      created = true
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '42501'
      ) {
        context.skip(
          'CREATE DATABASE denied; no schema or fixtures were written to the application database.',
        )
        return
      }
      throw error
    }
    const isolated = new URL(connection)
    isolated.pathname = `/${databaseName}`
    fixture = new Client({
      connectionString: isolated.toString(),
      connectionTimeoutMillis: 5_000,
    })
    await fixture.connect()
    const current = await fixture.query<{ database: string }>(
      'select current_database() as database',
    )
    expect(current.rows[0]?.database).toBe(databaseName)
    expect(current.rows[0]?.database).not.toBe(
      decodeURIComponent(connection.pathname.slice(1)),
    )

    // Historical migrations and every fixture run exclusively in this fresh DB.
    // The application's database is never a fallback when isolation is unavailable.
    for (const migration of migrations.slice(0, 13)) {
      for (const statement of migration.sql) await fixture.query(statement)
    }
    const userId = randomUUID()
    const taskMessageId = randomUUID()
    const requestMessageId = randomUUID()
    const draftId = randomUUID()
    const requestId = randomUUID()
    const eventId = randomUUID()
    const notificationId = randomUUID()
    const timestamp = new Date('2026-11-01T10:30:00.000Z')
    const expiresAt = new Date('2026-12-01T10:30:00.000Z')
    const credential = `test-only-${randomUUID()}`
    const task = {
      title: 'Preparar tarea con DUCO',
      description: 'Duco ayuda a organizar; duco no realiza la entrega.',
      courseName: 'Fundamentos de Matemáticas',
      dueAt: '2026-11-15T23:59:00.000Z',
      priority: 'high',
    }
    const request = {
      category: 'technical',
      subject: 'Ayuda con DUCO',
      description: 'Duco necesita revisión técnica.',
      desiredOutcome: 'Que duco funcione correctamente.',
      urgency: 'medium',
    }
    const action = {
      type: 'create_task',
      label: 'Revisar borrador de DUCO',
      draft: task,
      draftId,
      draftStatus: 'ready_for_review',
      task: null,
    }
    await fixture.query(
      'INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)',
      [userId, `${userId}@migration.konea.test`, credential, timestamp],
    )
    await fixture.query(
      "INSERT INTO assistant_messages (id,user_id,role,content,action,created_at) VALUES ($1,$2,'assistant',$3,$4,$5), ($6,$2,'assistant',$7,$8,$5)",
      [
        taskMessageId,
        userId,
        'DUCO preparó el borrador.',
        action,
        timestamp,
        requestMessageId,
        'Duco preparó la solicitud.',
        {
          type: 'manage_request',
          label: 'Gestionar solicitud',
          draft: request,
        },
      ],
    )
    await fixture.query(
      "INSERT INTO duco_drafts (id,user_id,kind,status,payload,source_message_id,expires_at,created_at,updated_at) VALUES ($1,$2,'task','ready_for_review',$3,$4,$5,$6,$6)",
      [draftId, userId, task, taskMessageId, expiresAt, timestamp],
    )
    await fixture.query(
      "INSERT INTO support_requests (id,requester_id,source_message_id,category,subject,description,desired_outcome,urgency,status,created_at,updated_at) VALUES ($1,$2,$3,'technical',$4,$5,$6,'medium','pending',$7,$7)",
      [
        requestId,
        userId,
        requestMessageId,
        request.subject,
        request.description,
        request.desiredOutcome,
        timestamp,
      ],
    )
    await fixture.query(
      "INSERT INTO support_request_events (id,request_id,actor_id,type,to_status,note,created_at) VALUES ($1,$2,$3,'created','pending','Solicitud preparada por Duco',$4)",
      [eventId, requestId, userId, timestamp],
    )
    await fixture.query(
      "INSERT INTO notifications (id,user_id,type,title,body,href,resource_id,created_at) VALUES ($1,$2,'support_request','Respuesta de DUCO','Duco actualizó la solicitud',$3,$4,$5)",
      [
        notificationId,
        userId,
        `duco-request:${requestId}`,
        requestId,
        timestamp,
      ],
    )

    const beforeUser = (
      await fixture.query('SELECT * FROM users WHERE id=$1', [userId])
    ).rows[0]
    const beforeObjects = await fixture.query<{ oid: number; relname: string }>(
      "SELECT oid,relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'duco%'",
    )
    const beforeConstraints = await fixture.query<{
      oid: number
      conname: string
    }>(
      "SELECT oid,conname FROM pg_constraint WHERE conrelid='duco_drafts'::regclass",
    )
    const beforeEnums = await fixture.query<{ oid: number; typname: string }>(
      "SELECT oid,typname FROM pg_type WHERE typnamespace='public'::regnamespace AND typname IN ('duco_draft_kind','duco_draft_status')",
    )
    expect(beforeObjects.rows.length).toBeGreaterThanOrEqual(5)
    expect(beforeConstraints.rows).toHaveLength(3)
    expect(beforeEnums.rows).toHaveLength(2)

    const rename = migrations[13]
    expect(rename).toBeDefined()
    await fixture.query('BEGIN')
    try {
      for (const statement of rename!.sql) await fixture.query(statement)
      await fixture.query('COMMIT')
    } catch (error) {
      await fixture.query('ROLLBACK')
      throw error
    }

    expect(
      (await fixture.query('SELECT * FROM users WHERE id=$1', [userId]))
        .rows[0],
    ).toEqual(beforeUser)
    const messages = await fixture.query(
      'SELECT * FROM assistant_messages ORDER BY id',
    )
    expect(messages.rows.map(({ id }) => id).sort()).toEqual(
      [taskMessageId, requestMessageId].sort(),
    )
    const migratedTask = {
      ...task,
      title: 'Preparar tarea con KUCO',
      description: 'Kuco ayuda a organizar; kuco no realiza la entrega.',
    }
    expect(messages.rows.find(({ id }) => id === taskMessageId)).toMatchObject({
      user_id: userId,
      content: 'KUCO preparó el borrador.',
      action: {
        ...action,
        label: 'Revisar borrador de KUCO',
        draft: migratedTask,
      },
      created_at: timestamp,
    })
    expect(
      messages.rows.find(({ id }) => id === requestMessageId)?.action,
    ).toMatchObject({
      type: 'manage_request',
      label: 'Gestionar solicitud',
      draft: {
        ...request,
        subject: 'Ayuda con KUCO',
        description: 'Kuco necesita revisión técnica.',
        desiredOutcome: 'Que kuco funcione correctamente.',
      },
    })
    const drafts = await fixture.query('SELECT * FROM kuco_drafts')
    expect(drafts.rows).toHaveLength(1)
    expect(drafts.rows[0]).toMatchObject({
      id: draftId,
      user_id: userId,
      source_message_id: taskMessageId,
      kind: 'task',
      status: 'ready_for_review',
      payload: migratedTask,
      expires_at: expiresAt,
      created_at: timestamp,
      updated_at: timestamp,
    })
    expect(
      (await fixture.query('SELECT * FROM support_requests')).rows,
    ).toMatchObject([
      {
        id: requestId,
        requester_id: userId,
        source_message_id: requestMessageId,
        status: 'pending',
        subject: 'Ayuda con KUCO',
        description: 'Kuco necesita revisión técnica.',
        desired_outcome: 'Que kuco funcione correctamente.',
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    expect(
      (await fixture.query('SELECT * FROM support_request_events')).rows,
    ).toMatchObject([
      {
        id: eventId,
        request_id: requestId,
        actor_id: userId,
        type: 'created',
        to_status: 'pending',
        note: 'Solicitud preparada por Kuco',
        created_at: timestamp,
      },
    ])
    expect(
      (await fixture.query('SELECT * FROM notifications')).rows,
    ).toMatchObject([
      {
        id: notificationId,
        user_id: userId,
        resource_id: requestId,
        title: 'Respuesta de KUCO',
        body: 'Kuco actualizó la solicitud',
        href: `kuco-request:${requestId}`,
        created_at: timestamp,
      },
    ])

    // OIDs staying equal proves the table, indexes and constraints were renamed,
    // rather than recreated with data or integrity guarantees silently lost.
    for (const object of beforeObjects.rows) {
      const currentObject = await fixture.query(
        'SELECT relname FROM pg_class WHERE oid=$1',
        [object.oid],
      )
      expect(currentObject.rows[0]?.relname).toBe(
        object.relname.replace('duco', 'kuco'),
      )
    }
    for (const constraint of beforeConstraints.rows) {
      const currentConstraint = await fixture.query(
        'SELECT conname FROM pg_constraint WHERE oid=$1',
        [constraint.oid],
      )
      expect(currentConstraint.rows[0]?.conname).toBe(
        constraint.conname.replace('duco', 'kuco'),
      )
    }
    for (const enumeration of beforeEnums.rows) {
      const currentEnum = await fixture.query(
        'SELECT typname FROM pg_type WHERE oid=$1',
        [enumeration.oid],
      )
      expect(currentEnum.rows[0]?.typname).toBe(
        enumeration.typname.replace('duco', 'kuco'),
      )
    }
    const enums = await fixture.query<{ typname: string; enumlabel: string }>(
      "SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace AND t.typname IN ('kuco_draft_kind','kuco_draft_status') ORDER BY t.typname,e.enumsortorder",
    )
    expect(
      enums.rows
        .filter(({ typname }) => typname === 'kuco_draft_kind')
        .map(({ enumlabel }) => enumlabel),
    ).toEqual(['task', 'support_request'])
    expect(
      enums.rows
        .filter(({ typname }) => typname === 'kuco_draft_status')
        .map(({ enumlabel }) => enumlabel),
    ).toEqual([
      'collecting_information',
      'ready_for_review',
      'confirmed',
      'cancelled',
      'expired',
    ])
    expect(
      (
        await fixture.query(
          "SELECT to_regclass('public.duco_drafts') AS old_table, to_regtype('public.duco_draft_kind') AS old_kind, to_regtype('public.duco_draft_status') AS old_status",
        )
      ).rows[0],
    ).toEqual({ old_table: null, old_kind: null, old_status: null })
    await expect(
      fixture.query(
        "INSERT INTO kuco_drafts (user_id,kind,payload) VALUES ($1,'task',$2)",
        [randomUUID(), task],
      ),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.query(
        "INSERT INTO kuco_drafts (user_id,kind,payload,source_message_id) VALUES ($1,'task',$2,$3)",
        [userId, task, taskMessageId],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  } finally {
    try {
      await fixture?.end()
    } finally {
      try {
        if (created)
          await admin.query(
            `DROP DATABASE ${isolatedDatabaseIdentifier(databaseName)}`,
          )
      } finally {
        await admin.end()
      }
    }
  }
}, 60_000)

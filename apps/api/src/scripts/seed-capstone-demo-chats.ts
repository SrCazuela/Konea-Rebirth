import { and, eq, inArray, sql } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  chatParticipants,
  chatReads,
  chats,
  connections,
  messages,
  messageReceipts,
  pollOptions,
  polls,
  pollVotes,
  profiles,
  tasks,
  users,
} from '../db/schema.js'
import { findCapstoneDemoStudent } from '../demo/capstone-demo-target.js'
import { SOCIAL_DEMO_USER_IDS } from '../demo/social-demo-data.js'
import { directChatKey } from '../services/chat-service.js'

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const DEMO_CHAT_IDS = {
  valentina: 'e1000000-0000-4000-8000-000000000001',
  matias: 'e1000000-0000-4000-8000-000000000002',
  capstone: 'e1000000-0000-4000-8000-000000000003',
} as const

const DEMO_MESSAGE_IDS = [
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000004',
  'e2000000-0000-4000-8000-000000000005',
  'e2000000-0000-4000-8000-000000000006',
  'e2000000-0000-4000-8000-000000000007',
  'e2000000-0000-4000-8000-000000000008',
  'e2000000-0000-4000-8000-000000000009',
  'e2000000-0000-4000-8000-000000000010',
  'e2000000-0000-4000-8000-000000000011',
  'e2000000-0000-4000-8000-000000000012',
  'e2000000-0000-4000-8000-000000000013',
  'e2000000-0000-4000-8000-000000000014',
  'e2000000-0000-4000-8000-000000000015',
  'e2000000-0000-4000-8000-000000000016',
  'e2000000-0000-4000-8000-000000000017',
  'e2000000-0000-4000-8000-000000000018',
  'e2000000-0000-4000-8000-000000000019',
] as const

const DEMO_POLL_ID = 'e3000000-0000-4000-8000-000000000001'
const DEMO_POLL_OPTION_IDS = [
  'e4000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000002',
  'e4000000-0000-4000-8000-000000000003',
] as const
const DEMO_TASK_IDS = [
  'e5000000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000002',
] as const

type DemoPerson = {
  id: string
  username: string
  displayName: string
}

type DemoMessage = typeof messages.$inferInsert & {
  id: string
  createdAt: Date
}

type ReceiptState = 'sent' | 'delivered' | 'read'

function assertLocalDevelopmentDatabase() {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      'Los chats demo de Capstone solo pueden prepararse con NODE_ENV=development.',
    )
  }

  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL no es una URL PostgreSQL válida.')
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error(
      'DATABASE_URL debe usar el protocolo postgres o postgresql.',
    )
  }

  const hostname = databaseUrl.hostname.toLowerCase()
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `Los chats demo solo pueden prepararse en una base local; host recibido: ${hostname}.`,
    )
  }
}

function dateAtOffset(reference: Date, offsetMinutes: number) {
  return new Date(reference.getTime() + offsetMinutes * 60 * 1_000)
}

function dateInSantiago(reference: Date, offsetDays = 0) {
  const target = new Date(
    reference.getTime() + offsetDays * 24 * 60 * 60 * 1_000,
  )
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function canonicalConnection(firstUserId: string, secondUserId: string) {
  const [userOneId, userTwoId] = [firstUserId, secondUserId].sort()
  if (!userOneId || !userTwoId || userOneId === userTwoId) {
    throw new Error('No se pudo construir una conexión demo válida.')
  }
  return { userOneId, userTwoId }
}

async function loadPerson(userId: string) {
  const [person] = await db
    .select({
      id: users.id,
      username: profiles.username,
      displayName: profiles.displayName,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1)

  return person ?? null
}

async function requireSocialDemoPeople() {
  const requiredPeople = [
    ['valentina', SOCIAL_DEMO_USER_IDS.vale],
    ['matias', SOCIAL_DEMO_USER_IDS.mati],
    ['camila', SOCIAL_DEMO_USER_IDS.cami],
    ['tomas', SOCIAL_DEMO_USER_IDS.tomas],
  ] as const
  const entries = await Promise.all(
    requiredPeople.map(
      async ([key, id]) => [key, await loadPerson(id)] as const,
    ),
  )
  const missing = entries.filter(([, person]) => !person).map(([key]) => key)
  if (missing.length) {
    throw new Error(
      `Faltan perfiles sociales demo (${missing.join(', ')}). Ejecuta primero el seed social.`,
    )
  }

  return Object.fromEntries(entries) as Record<
    'valentina' | 'matias' | 'camila' | 'tomas',
    DemoPerson
  >
}

async function assertChatIdentifierIsSafe(input: {
  id: string
  type: 'direct' | 'group'
  directKey: string | null
  name: string | null
}) {
  const [existing] = await db
    .select({
      type: chats.type,
      directKey: chats.directKey,
      name: chats.name,
    })
    .from(chats)
    .where(eq(chats.id, input.id))
    .limit(1)
  if (
    existing &&
    (existing.type !== input.type ||
      existing.directKey !== input.directKey ||
      existing.name !== input.name)
  ) {
    throw new Error(`El identificador de chat demo ${input.id} ya está en uso.`)
  }
}

async function resolveDirectChat(input: {
  id: string
  firstUserId: string
  secondUserId: string
}) {
  const key = directChatKey(input.firstUserId, input.secondUserId)
  await assertChatIdentifierIsSafe({
    id: input.id,
    type: 'direct',
    directKey: key,
    name: null,
  })
  const [chat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.directKey, key))
    .limit(1)
  return { id: chat?.id ?? input.id, key }
}

function receiptFor(
  messageId: string,
  userId: string,
  messageAt: Date,
  state: ReceiptState,
) {
  return {
    messageId,
    userId,
    deliveredAt: state === 'sent' ? null : dateAtOffset(messageAt, 1),
    readAt: state === 'read' ? dateAtOffset(messageAt, 2) : null,
  }
}

async function assertReservedRowsAreSafe(
  demoMessages: DemoMessage[],
  expectedGroupChatId: string,
) {
  const messageById = new Map(
    demoMessages.map((message) => [message.id, message]),
  )
  const existingMessages = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      senderId: messages.senderId,
    })
    .from(messages)
    .where(inArray(messages.id, DEMO_MESSAGE_IDS))
  for (const existing of existingMessages) {
    const expected = messageById.get(existing.id)
    if (
      !expected ||
      expected.chatId !== existing.chatId ||
      expected.senderId !== existing.senderId
    ) {
      throw new Error(
        `El identificador de mensaje demo ${existing.id} ya está en uso.`,
      )
    }
  }

  const existingTasks = await db
    .select({ id: tasks.id, chatId: tasks.chatId })
    .from(tasks)
    .where(inArray(tasks.id, [...DEMO_TASK_IDS]))
  if (existingTasks.some((task) => task.chatId !== expectedGroupChatId)) {
    throw new Error('Uno de los identificadores de tarea demo ya está en uso.')
  }
}

export async function seedCapstoneDemoChats() {
  assertLocalDevelopmentDatabase()
  const primary = await findCapstoneDemoStudent()
  if (!primary) {
    console.log(
      'Chats demo omitidos: registra una cuenta estudiantil y se prepararán en el próximo inicio.',
    )
    return
  }
  const existingScenarioChats = await db
    .select({ id: chats.id })
    .from(chats)
    .where(inArray(chats.id, Object.values(DEMO_CHAT_IDS)))
  if (existingScenarioChats.length > 0) {
    console.log(
      `Chats demo ya preparados para @${primary.username}; se conservaron mensajes, conexiones y tareas tal como están.`,
    )
    return
  }
  const people = await requireSocialDemoPeople()
  const seededAt = new Date()
  const joinedAt = dateAtOffset(seededAt, -3 * 24 * 60)

  const valentinaChat = await resolveDirectChat({
    id: DEMO_CHAT_IDS.valentina,
    firstUserId: primary.id,
    secondUserId: people.valentina.id,
  })
  const matiasChat = await resolveDirectChat({
    id: DEMO_CHAT_IDS.matias,
    firstUserId: primary.id,
    secondUserId: people.matias.id,
  })
  const valentinaChatId = valentinaChat.id
  const matiasChatId = matiasChat.id

  await assertChatIdentifierIsSafe({
    id: DEMO_CHAT_IDS.capstone,
    type: 'group',
    directKey: null,
    name: 'Equipo Capstone',
  })
  const times = DEMO_MESSAGE_IDS.map((_, index) => {
    const offsets = [
      -310, -286, -245, -218, -74, -18, -1_430, -1_380, -190, -92, -175, -158,
      -141, -126, -108, -82, -61, -34, -7,
    ]
    return dateAtOffset(seededAt, offsets[index] ?? -index)
  })

  const demoMessages: DemoMessage[] = [
    {
      id: DEMO_MESSAGE_IDS[0],
      chatId: valentinaChatId,
      senderId: people.valentina.id,
      content:
        'Hola, estuve probando el flujo de AVA. Los ramos se ven mucho más claros ahora.',
      type: 'text',
      tags: ['resources'],
      createdAt: times[0]!,
      updatedAt: times[0]!,
    },
    {
      id: DEMO_MESSAGE_IDS[1],
      chatId: valentinaChatId,
      senderId: primary.id,
      content: 'Buenísimo. Estoy dejando lista la demostración de hoy.',
      type: 'text',
      tags: [],
      createdAt: times[1]!,
      updatedAt: times[1]!,
    },
    {
      id: DEMO_MESSAGE_IDS[2],
      chatId: valentinaChatId,
      senderId: people.valentina.id,
      content:
        'También revisé DUCO: el formulario pide los datos antes de crear la solicitud.',
      type: 'text',
      tags: ['important'],
      createdAt: times[2]!,
      updatedAt: times[2]!,
    },
    {
      id: DEMO_MESSAGE_IDS[3],
      chatId: valentinaChatId,
      senderId: primary.id,
      content: 'Perfecto, ese era el comportamiento que queríamos.',
      type: 'text',
      tags: [],
      createdAt: times[3]!,
      updatedAt: times[3]!,
    },
    {
      id: DEMO_MESSAGE_IDS[4],
      chatId: valentinaChatId,
      senderId: primary.id,
      content:
        'Te mando el enlace del guion apenas cierre la última diapositiva.',
      type: 'text',
      tags: ['link'],
      createdAt: times[4]!,
      updatedAt: times[4]!,
    },
    {
      id: DEMO_MESSAGE_IDS[5],
      chatId: valentinaChatId,
      senderId: people.valentina.id,
      content:
        '¿Hacemos un ensayo rápido a las 16:30? Puedo probar el flujo como estudiante.',
      type: 'text',
      tags: ['question'],
      createdAt: times[5]!,
      updatedAt: times[5]!,
    },
    {
      id: DEMO_MESSAGE_IDS[6],
      chatId: matiasChatId,
      senderId: people.matias.id,
      content: '¿Probamos una sesión Pomodoro en FocusBuddy para la demo?',
      type: 'text',
      tags: ['question'],
      createdAt: times[6]!,
      updatedAt: times[6]!,
    },
    {
      id: DEMO_MESSAGE_IDS[7],
      chatId: matiasChatId,
      senderId: primary.id,
      content: 'Sí, hagamos una de 25 minutos y la vinculamos a Capstone.',
      type: 'text',
      tags: [],
      createdAt: times[7]!,
      updatedAt: times[7]!,
    },
    {
      id: DEMO_MESSAGE_IDS[8],
      chatId: matiasChatId,
      senderId: people.matias.id,
      content: 'Quedó buena la sincronización del progreso con la cuenta.',
      type: 'text',
      tags: ['important'],
      createdAt: times[8]!,
      updatedAt: times[8]!,
    },
    {
      id: DEMO_MESSAGE_IDS[9],
      chatId: matiasChatId,
      senderId: primary.id,
      content: 'Anoté revisar el dashboard antes de presentar.',
      type: 'text',
      tags: ['delivery'],
      createdAt: times[9]!,
      updatedAt: times[9]!,
    },
    {
      id: DEMO_MESSAGE_IDS[10],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.camila.id,
      content:
        'Equipo, dejé ordenado el guion. La idea es mostrar un problema real y después el flujo completo.',
      type: 'text',
      tags: ['important'],
      createdAt: times[10]!,
      updatedAt: times[10]!,
    },
    {
      id: DEMO_MESSAGE_IDS[11],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: primary.id,
      content:
        'Partimos con la red social, seguimos con DUCO y cerramos con FocusBuddy.',
      type: 'text',
      tags: [],
      createdAt: times[11]!,
      updatedAt: times[11]!,
    },
    {
      id: DEMO_MESSAGE_IDS[12],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.tomas.id,
      content:
        'Yo puedo mostrar el panel de administrador y responder una solicitud.',
      type: 'text',
      tags: ['important'],
      createdAt: times[12]!,
      updatedAt: times[12]!,
    },
    {
      id: DEMO_MESSAGE_IDS[13],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.camila.id,
      content: '¿Qué flujo mostramos primero en la presentación?',
      type: 'poll',
      tags: ['poll'],
      createdAt: times[13]!,
      updatedAt: times[13]!,
    },
    {
      id: DEMO_MESSAGE_IDS[14],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.camila.id,
      content:
        'Camila Herrera creó la tarea “Ensayar flujo DUCO y solicitudes”.',
      type: 'system',
      tags: ['delivery'],
      createdAt: times[14]!,
      updatedAt: times[14]!,
    },
    {
      id: DEMO_MESSAGE_IDS[15],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: primary.id,
      content:
        'El recorrido completo debería tomar menos de ocho minutos, dejando tiempo para preguntas.',
      type: 'text',
      tags: [],
      createdAt: times[15]!,
      updatedAt: times[15]!,
    },
    {
      id: DEMO_MESSAGE_IDS[16],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: primary.id,
      content: `${primary.displayName} creó la tarea “Revisar guion de la demo”.`,
      type: 'system',
      tags: ['delivery'],
      createdAt: times[16]!,
      updatedAt: times[16]!,
    },
    {
      id: DEMO_MESSAGE_IDS[17],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.tomas.id,
      content:
        'Probé el cambio de estado de las solicitudes y el historial se actualiza bien.',
      type: 'text',
      tags: ['resources'],
      createdAt: times[17]!,
      updatedAt: times[17]!,
    },
    {
      id: DEMO_MESSAGE_IDS[18],
      chatId: DEMO_CHAT_IDS.capstone,
      senderId: people.camila.id,
      content:
        'Solo falta el ensayo final. Avísenme cuando estén listos y hacemos una pasada completa.',
      type: 'text',
      tags: ['question'],
      createdAt: times[18]!,
      updatedAt: times[18]!,
    },
  ]

  await assertReservedRowsAreSafe(demoMessages, DEMO_CHAT_IDS.capstone)

  const receipts = [
    receiptFor(DEMO_MESSAGE_IDS[0], primary.id, times[0]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[1], people.valentina.id, times[1]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[2], primary.id, times[2]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[3], people.valentina.id, times[3]!, 'read'),
    receiptFor(
      DEMO_MESSAGE_IDS[4],
      people.valentina.id,
      times[4]!,
      'delivered',
    ),
    receiptFor(DEMO_MESSAGE_IDS[5], primary.id, times[5]!, 'delivered'),
    receiptFor(DEMO_MESSAGE_IDS[6], primary.id, times[6]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[7], people.matias.id, times[7]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[8], primary.id, times[8]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[9], people.matias.id, times[9]!, 'sent'),
    receiptFor(DEMO_MESSAGE_IDS[10], primary.id, times[10]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[10], people.tomas.id, times[10]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[11], people.camila.id, times[11]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[11], people.tomas.id, times[11]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[12], primary.id, times[12]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[12], people.camila.id, times[12]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[13], primary.id, times[13]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[13], people.tomas.id, times[13]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[14], primary.id, times[14]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[14], people.tomas.id, times[14]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[15], people.camila.id, times[15]!, 'delivered'),
    receiptFor(DEMO_MESSAGE_IDS[15], people.tomas.id, times[15]!, 'delivered'),
    receiptFor(DEMO_MESSAGE_IDS[16], people.camila.id, times[16]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[16], people.tomas.id, times[16]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[17], primary.id, times[17]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[17], people.camila.id, times[17]!, 'read'),
    receiptFor(DEMO_MESSAGE_IDS[18], primary.id, times[18]!, 'delivered'),
    receiptFor(DEMO_MESSAGE_IDS[18], people.tomas.id, times[18]!, 'read'),
  ]

  const participantRows = [
    { chatId: valentinaChatId, userId: primary.id, role: 'member' as const },
    {
      chatId: valentinaChatId,
      userId: people.valentina.id,
      role: 'member' as const,
    },
    { chatId: matiasChatId, userId: primary.id, role: 'member' as const },
    {
      chatId: matiasChatId,
      userId: people.matias.id,
      role: 'member' as const,
    },
    {
      chatId: DEMO_CHAT_IDS.capstone,
      userId: primary.id,
      role: 'owner' as const,
    },
    {
      chatId: DEMO_CHAT_IDS.capstone,
      userId: people.camila.id,
      role: 'admin' as const,
    },
    {
      chatId: DEMO_CHAT_IDS.capstone,
      userId: people.tomas.id,
      role: 'member' as const,
    },
  ].map((participant) => ({ ...participant, joinedAt }))

  await db.transaction(async (transaction) => {
    await transaction
      .insert(chats)
      .values([
        {
          id: DEMO_CHAT_IDS.valentina,
          type: 'direct' as const,
          directKey: valentinaChat.key,
          createdById: people.valentina.id,
          createdAt: joinedAt,
          updatedAt: joinedAt,
        },
        {
          id: DEMO_CHAT_IDS.matias,
          type: 'direct' as const,
          directKey: matiasChat.key,
          createdById: primary.id,
          createdAt: joinedAt,
          updatedAt: joinedAt,
        },
        {
          id: DEMO_CHAT_IDS.capstone,
          type: 'group' as const,
          directKey: null,
          name: 'Equipo Capstone',
          createdById: primary.id,
          createdAt: joinedAt,
          updatedAt: joinedAt,
        },
      ])
      .onConflictDoNothing()

    await transaction
      .insert(connections)
      .values(
        [
          people.valentina.id,
          people.matias.id,
          people.camila.id,
          people.tomas.id,
        ].map((demoUserId) => ({
          ...canonicalConnection(primary.id, demoUserId),
          createdAt: joinedAt,
        })),
      )
      .onConflictDoNothing()

    await transaction
      .insert(chatParticipants)
      .values(participantRows)
      .onConflictDoNothing()

    await transaction
      .insert(messages)
      .values(demoMessages)
      .onConflictDoNothing()

    await transaction
      .insert(messageReceipts)
      .values(receipts)
      .onConflictDoNothing()

    await transaction
      .insert(chatReads)
      .values([
        {
          chatId: valentinaChatId,
          userId: primary.id,
          lastReadAt: times[3]!,
        },
        {
          chatId: valentinaChatId,
          userId: people.valentina.id,
          lastReadAt: times[4]!,
        },
        {
          chatId: matiasChatId,
          userId: primary.id,
          lastReadAt: times[9]!,
        },
        {
          chatId: matiasChatId,
          userId: people.matias.id,
          lastReadAt: times[8]!,
        },
        {
          chatId: DEMO_CHAT_IDS.capstone,
          userId: primary.id,
          lastReadAt: times[17]!,
        },
        {
          chatId: DEMO_CHAT_IDS.capstone,
          userId: people.camila.id,
          lastReadAt: times[18]!,
        },
        {
          chatId: DEMO_CHAT_IDS.capstone,
          userId: people.tomas.id,
          lastReadAt: times[18]!,
        },
      ])
      .onConflictDoNothing()

    await transaction
      .insert(polls)
      .values({
        id: DEMO_POLL_ID,
        messageId: DEMO_MESSAGE_IDS[13],
        createdById: people.camila.id,
        question: '¿Qué flujo mostramos primero en la presentación?',
        allowMultiple: false,
        createdAt: times[13]!,
      })
      .onConflictDoNothing()
    await transaction
      .insert(pollOptions)
      .values([
        {
          id: DEMO_POLL_OPTION_IDS[0],
          pollId: DEMO_POLL_ID,
          label: 'AVA a tareas',
          position: 0,
        },
        {
          id: DEMO_POLL_OPTION_IDS[1],
          pollId: DEMO_POLL_ID,
          label: 'DUCO y solicitudes',
          position: 1,
        },
        {
          id: DEMO_POLL_OPTION_IDS[2],
          pollId: DEMO_POLL_ID,
          label: 'FocusBuddy',
          position: 2,
        },
      ])
      .onConflictDoNothing()
    await transaction
      .insert(pollVotes)
      .values([
        {
          pollId: DEMO_POLL_ID,
          optionId: DEMO_POLL_OPTION_IDS[1],
          userId: people.camila.id,
          createdAt: dateAtOffset(times[13]!, 3),
        },
        {
          pollId: DEMO_POLL_ID,
          optionId: DEMO_POLL_OPTION_IDS[0],
          userId: people.tomas.id,
          createdAt: dateAtOffset(times[13]!, 5),
        },
      ])
      .onConflictDoNothing()

    await transaction
      .insert(tasks)
      .values([
        {
          id: DEMO_TASK_IDS[0],
          chatId: DEMO_CHAT_IDS.capstone,
          createdById: people.camila.id,
          assignedToId: primary.id,
          title: 'Ensayar flujo DUCO y solicitudes',
          description:
            'Completar una pasada del flujo estudiante y del panel administrativo.',
          dueDate: dateInSantiago(seededAt),
          priority: 'high',
          status: 'pending',
          createdAt: times[14]!,
          updatedAt: times[14]!,
        },
        {
          id: DEMO_TASK_IDS[1],
          chatId: DEMO_CHAT_IDS.capstone,
          createdById: primary.id,
          assignedToId: people.tomas.id,
          title: 'Revisar guion de la demo',
          description:
            'Confirmar el orden, los tiempos y las cuentas que se utilizarán.',
          dueDate: dateInSantiago(seededAt, 1),
          priority: 'medium',
          status: 'completed',
          createdAt: times[16]!,
          updatedAt: times[17]!,
        },
      ])
      .onConflictDoNothing()

    for (const [chatId, latestMessageId] of [
      [valentinaChatId, DEMO_MESSAGE_IDS[5]],
      [matiasChatId, DEMO_MESSAGE_IDS[9]],
      [DEMO_CHAT_IDS.capstone, DEMO_MESSAGE_IDS[18]],
    ] as const) {
      const latestMessage = demoMessages.find(
        (message) => message.id === latestMessageId,
      )
      if (!latestMessage) continue
      await transaction
        .update(chats)
        .set({
          updatedAt: sql`greatest(${chats.updatedAt}, ${latestMessage.createdAt})`,
        })
        .where(eq(chats.id, chatId))
    }
  })

  console.log(
    [
      `Chats demo listos para @${primary.username}.`,
      '4 conexiones',
      '2 chats directos',
      '1 grupo',
      '19 mensajes',
      '1 encuesta',
      '2 tareas de chat',
    ].join(' · '),
  )
}

try {
  await seedCapstoneDemoChats()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}

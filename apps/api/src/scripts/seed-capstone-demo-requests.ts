import { and, eq, inArray } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  comments,
  notifications,
  posts,
  profiles,
  reports,
  supportRequestEvents,
  supportRequests,
  users,
} from '../db/schema.js'
import { findCapstoneDemoStudent } from '../demo/capstone-demo-target.js'
import {
  SOCIAL_DEMO_COMMENTS,
  SOCIAL_DEMO_POSTS,
  SOCIAL_DEMO_USER_IDS,
} from '../demo/social-demo-data.js'

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const stableId = (namespace: string, sequence: number) =>
  `${namespace}000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`

const requestId = (sequence: number) => stableId('e1', sequence)
const requestEventId = (sequence: number) => stableId('e2', sequence)
const reportId = (sequence: number) => stableId('e3', sequence)
const moderationPostId = (sequence: number) => stableId('e4', sequence)
const notificationId = (sequence: number) => stableId('e5', sequence)

type DemoPerson = {
  id: string
  email: string
  username: string
  displayName: string
}

function assertLocalDevelopmentDatabase() {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      'El contenido Capstone demo solo puede prepararse con NODE_ENV=development.',
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
      `El contenido Capstone demo solo puede prepararse en una base local; host recibido: ${hostname}.`,
    )
  }
}

async function findAdmin(): Promise<DemoPerson> {
  const admins = await db
    .select({
      id: users.id,
      email: users.email,
      username: profiles.username,
      displayName: profiles.displayName,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))

  admins.sort(
    (left, right) =>
      Number(right.email === 'admin@konea.local') -
        Number(left.email === 'admin@konea.local') ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  )

  const selected = admins[0]
  if (!selected) {
    throw new Error(
      'No existe una cuenta administradora activa. Ejecuta primero db:seed:dev.',
    )
  }
  return selected
}

function hoursAgo(reference: Date, hours: number) {
  return new Date(reference.getTime() - hours * 60 * 60 * 1_000)
}

function minutesAfter(reference: Date, minutes: number) {
  return new Date(reference.getTime() + minutes * 60 * 1_000)
}

async function assertSocialDemoDependencies() {
  const requiredUserIds = [
    SOCIAL_DEMO_USER_IDS.vale,
    SOCIAL_DEMO_USER_IDS.fer,
    SOCIAL_DEMO_USER_IDS.cami,
    SOCIAL_DEMO_USER_IDS.benja,
    SOCIAL_DEMO_USER_IDS.mati,
    SOCIAL_DEMO_USER_IDS.nico,
    SOCIAL_DEMO_USER_IDS.tomas,
    SOCIAL_DEMO_USER_IDS.javi,
    SOCIAL_DEMO_USER_IDS.seba,
  ]
  const requiredPostIds = [
    SOCIAL_DEMO_POSTS[4]?.id,
    SOCIAL_DEMO_POSTS[9]?.id,
    SOCIAL_DEMO_POSTS[10]?.id,
  ].filter((id): id is string => Boolean(id))
  const requiredCommentIds = [
    SOCIAL_DEMO_COMMENTS[25]?.id,
    SOCIAL_DEMO_COMMENTS[27]?.id,
  ].filter((id): id is string => Boolean(id))

  const [existingUsers, existingPosts, existingComments] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, requiredUserIds)),
    db
      .select({ id: posts.id })
      .from(posts)
      .where(inArray(posts.id, requiredPostIds)),
    db
      .select({ id: comments.id })
      .from(comments)
      .where(inArray(comments.id, requiredCommentIds)),
  ])

  if (
    existingUsers.length !== requiredUserIds.length ||
    existingPosts.length !== requiredPostIds.length ||
    existingComments.length !== requiredCommentIds.length
  ) {
    throw new Error(
      'Faltan perfiles, publicaciones o comentarios sociales demo. Ejecuta primero db:seed:social.',
    )
  }
}

export async function seedCapstoneDemoRequests() {
  assertLocalDevelopmentDatabase()
  const mainStudent = await findCapstoneDemoStudent()
  if (!mainStudent) {
    console.log(
      'Solicitudes demo omitidas: registra una cuenta estudiantil y se prepararán en el próximo inicio.',
    )
    return
  }
  const [admin] = await Promise.all([
    findAdmin(),
    assertSocialDemoDependencies(),
  ])
  const seededAt = new Date()

  const requestDefinitions = [
    {
      id: requestId(1),
      requesterId: mainStudent.id,
      category: 'missing_course' as const,
      subject: 'Asignatura de Machine Learning no aparece en AVA',
      description:
        'La asignatura figura en mi carga académica, pero no aparece en AVA después de sincronizar. Necesito acceder al material y a una evaluación próxima.',
      desiredOutcome:
        'Confirmar mi inscripción y habilitar el acceso a la asignatura en AVA.',
      urgency: 'high' as const,
      status: 'pending' as const,
      ageHours: 2,
    },
    {
      id: requestId(2),
      requesterId: SOCIAL_DEMO_USER_IDS.fer,
      category: 'wellbeing' as const,
      subject: 'Orientación por una situación de convivencia',
      description:
        'En un trabajo grupal he recibido comentarios descalificadores de forma reiterada. Quisiera conversar la situación de manera privada y conocer las alternativas de apoyo.',
      desiredOutcome:
        'Recibir orientación del equipo de Bienestar y acordar próximos pasos seguros.',
      urgency: 'high' as const,
      status: 'pending' as const,
      ageHours: 6,
    },
    {
      id: requestId(3),
      requesterId: SOCIAL_DEMO_USER_IDS.cami,
      category: 'section_change' as const,
      subject: 'Cambio de sección por conflicto de horario',
      description:
        'Mi sección actual de Capstone se superpone con una asignatura obligatoria. Indiqué ambas secciones y los bloques involucrados para que puedan revisarlos.',
      desiredOutcome:
        'Cambiarme a una sección de Capstone compatible con mi carga académica.',
      urgency: 'medium' as const,
      status: 'reviewing' as const,
      ageHours: 20,
    },
    {
      id: requestId(4),
      requesterId: SOCIAL_DEMO_USER_IDS.benja,
      category: 'technical' as const,
      subject: 'Error al abrir una evaluación en AVA',
      description:
        'La evaluación carga una pantalla en blanco en dos navegadores y desde otro equipo. El resto del curso se visualiza normalmente.',
      desiredOutcome:
        'Restablecer el acceso o recibir una alternativa antes del vencimiento.',
      urgency: 'high' as const,
      status: 'reviewing' as const,
      ageHours: 30,
    },
    {
      id: requestId(5),
      requesterId: mainStudent.id,
      category: 'enrollment' as const,
      subject: 'Inscripción de asignatura pendiente',
      description:
        'La asignatura fue autorizada por coordinación, pero todavía aparecía como pendiente en mi carga académica y no podía verla en el portal.',
      desiredOutcome:
        'Completar la inscripción y confirmar que la asignatura quedó activa.',
      urgency: 'medium' as const,
      status: 'resolved' as const,
      ageHours: 52,
    },
    {
      id: requestId(6),
      requesterId: SOCIAL_DEMO_USER_IDS.mati,
      category: 'schedule_conflict' as const,
      subject: 'Dos evaluaciones programadas en el mismo bloque',
      description:
        'Tengo evaluaciones de dos asignaturas obligatorias a la misma hora. Informé las asignaturas, secciones y fechas para solicitar una alternativa.',
      desiredOutcome:
        'Coordinar una fecha alternativa para una de las evaluaciones.',
      urgency: 'medium' as const,
      status: 'resolved' as const,
      ageHours: 80,
    },
    {
      id: requestId(7),
      requesterId: SOCIAL_DEMO_USER_IDS.nico,
      category: 'financial' as const,
      subject: 'Revisión de cobro extraordinario',
      description:
        'Solicité revisar un cobro que no reconocía en el portal financiero, pero no adjunté el comprobante solicitado dentro del plazo informado.',
      desiredOutcome:
        'Obtener una explicación del cobro y conocer cómo volver a ingresar el caso.',
      urgency: 'low' as const,
      status: 'rejected' as const,
      ageHours: 110,
    },
  ]

  const requestCreatedAt = new Map(
    requestDefinitions.map((item) => [
      item.id,
      hoursAgo(seededAt, item.ageHours),
    ]),
  )
  const at = (id: string, minutes: number) => {
    const createdAt = requestCreatedAt.get(id)
    if (!createdAt) throw new Error(`No hay fecha para la solicitud ${id}.`)
    return minutesAfter(createdAt, minutes)
  }

  const eventRows: Array<typeof supportRequestEvents.$inferInsert> = [
    ...requestDefinitions.map((item, index) => ({
      id: requestEventId(index + 1),
      requestId: item.id,
      actorId: item.requesterId,
      type: 'created' as const,
      fromStatus: null,
      toStatus: 'pending' as const,
      note: null,
      createdAt: at(item.id, 0),
    })),
    {
      id: requestEventId(8),
      requestId: requestId(3),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'pending',
      toStatus: 'reviewing',
      note: 'Caso asignado para validar cupos y compatibilidad de horarios.',
      createdAt: at(requestId(3), 45),
    },
    {
      id: requestEventId(9),
      requestId: requestId(3),
      actorId: admin.id,
      type: 'response',
      fromStatus: null,
      toStatus: 'reviewing',
      note: 'Estamos consultando disponibilidad en la sección 004D. Te avisaremos apenas coordinación confirme el cupo.',
      createdAt: at(requestId(3), 90),
    },
    {
      id: requestEventId(10),
      requestId: requestId(4),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'pending',
      toStatus: 'reviewing',
      note: 'Soporte recibió los antecedentes y está revisando el acceso.',
      createdAt: at(requestId(4), 35),
    },
    {
      id: requestEventId(11),
      requestId: requestId(5),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'pending',
      toStatus: 'reviewing',
      note: 'Secretaría Académica está verificando la autorización.',
      createdAt: at(requestId(5), 60),
    },
    {
      id: requestEventId(12),
      requestId: requestId(5),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'reviewing',
      toStatus: 'resolved',
      note: 'La inscripción quedó confirmada. La asignatura debería aparecer en AVA durante las próximas 24 horas.',
      createdAt: at(requestId(5), 180),
    },
    {
      id: requestEventId(13),
      requestId: requestId(6),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'pending',
      toStatus: 'reviewing',
      note: 'Se enviaron los antecedentes a ambas coordinaciones.',
      createdAt: at(requestId(6), 80),
    },
    {
      id: requestEventId(14),
      requestId: requestId(6),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'reviewing',
      toStatus: 'resolved',
      note: 'Se autorizó rendir la segunda evaluación el viernes a las 15:00. La docente enviará la sala por correo.',
      createdAt: at(requestId(6), 260),
    },
    {
      id: requestEventId(15),
      requestId: requestId(7),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'pending',
      toStatus: 'reviewing',
      note: 'Finanzas solicitó el comprobante asociado al cobro.',
      createdAt: at(requestId(7), 70),
    },
    {
      id: requestEventId(16),
      requestId: requestId(7),
      actorId: admin.id,
      type: 'status_changed',
      fromStatus: 'reviewing',
      toStatus: 'rejected',
      note: 'El caso se cerró por falta del comprobante. Puedes crear una nueva solicitud y adjuntarlo para continuar la revisión.',
      createdAt: at(requestId(7), 220),
    },
  ]

  const lastEventAt = new Map<string, Date>()
  for (const event of eventRows) {
    const previous = lastEventAt.get(event.requestId)
    if (!previous || (event.createdAt && event.createdAt > previous)) {
      lastEventAt.set(event.requestId, event.createdAt ?? seededAt)
    }
  }

  const reportDefinitions: Array<typeof reports.$inferInsert> = [
    {
      id: reportId(1),
      reporterId: SOCIAL_DEMO_USER_IDS.vale,
      resourceType: 'post',
      resourceId: SOCIAL_DEMO_POSTS[10]!.id,
      reason: 'Posible indirecta hacia compañeros',
      details:
        'La publicación parece apuntar a un grupo específico y podría escalar la discusión.',
      status: 'pending',
      createdAt: hoursAgo(seededAt, 1),
      updatedAt: hoursAgo(seededAt, 1),
    },
    {
      id: reportId(2),
      reporterId: SOCIAL_DEMO_USER_IDS.cami,
      resourceType: 'comment',
      resourceId: SOCIAL_DEMO_COMMENTS[25]!.id,
      reason: 'Comentario provocador',
      details: 'Solicito revisar si el tono respeta las normas de convivencia.',
      status: 'pending',
      createdAt: hoursAgo(seededAt, 4),
      updatedAt: hoursAgo(seededAt, 4),
    },
    {
      id: reportId(3),
      reporterId: SOCIAL_DEMO_USER_IDS.tomas,
      assignedToId: admin.id,
      resourceType: 'post',
      resourceId: SOCIAL_DEMO_POSTS[9]!.id,
      reason: 'Contenido que podría ridiculizar a un docente',
      details:
        'El mensaje parece humorístico, pero agradecería una revisión de contexto.',
      status: 'reviewing',
      createdAt: hoursAgo(seededAt, 10),
      updatedAt: hoursAgo(seededAt, 8),
    },
    {
      id: reportId(4),
      reporterId: SOCIAL_DEMO_USER_IDS.mati,
      assignedToId: admin.id,
      resourceType: 'comment',
      resourceId: SOCIAL_DEMO_COMMENTS[27]!.id,
      reason: 'Discusión que podía escalar',
      details: 'El equipo revisó el hilo completo y entregó orientación.',
      status: 'resolved',
      createdAt: hoursAgo(seededAt, 28),
      updatedAt: hoursAgo(seededAt, 24),
    },
    {
      id: reportId(5),
      reporterId: SOCIAL_DEMO_USER_IDS.cami,
      assignedToId: admin.id,
      resourceType: 'user',
      resourceId: SOCIAL_DEMO_USER_IDS.seba,
      reason: 'Conducta reiterada en publicaciones',
      details:
        'Se revisó el historial visible y se registraron recomendaciones preventivas.',
      status: 'resolved',
      createdAt: hoursAgo(seededAt, 48),
      updatedAt: hoursAgo(seededAt, 42),
    },
    {
      id: reportId(6),
      reporterId: SOCIAL_DEMO_USER_IDS.javi,
      assignedToId: admin.id,
      resourceType: 'post',
      resourceId: SOCIAL_DEMO_POSTS[4]!.id,
      reason: 'Contenido fuera de tema',
      details:
        'Tras revisar la publicación, se determinó que sí corresponde a conversación de comunidad.',
      status: 'dismissed',
      createdAt: hoursAgo(seededAt, 72),
      updatedAt: hoursAgo(seededAt, 70),
    },
  ]

  const moderationPosts: Array<typeof posts.$inferInsert> = [
    {
      id: moderationPostId(1),
      authorId: SOCIAL_DEMO_USER_IDS.vale,
      content:
        '¿Alguien de Programación de Algoritmos quiere revisar ejercicios en biblioteca mañana? La idea es comparar procedimientos, no compartir respuestas.',
      contentType: 'community',
      visibility: 'campus',
      moderationStatus: 'pending',
      shareCount: 0,
      createdAt: hoursAgo(seededAt, 0.5),
      updatedAt: hoursAgo(seededAt, 0.5),
    },
    {
      id: moderationPostId(2),
      authorId: SOCIAL_DEMO_USER_IDS.seba,
      content:
        'Dejen de preguntar lo mismo en el foro. Si no entendieron la pauta a estas alturas, quizá el problema no era la explicación.',
      contentType: 'community',
      visibility: 'campus',
      moderationStatus: 'pending',
      shareCount: 0,
      createdAt: hoursAgo(seededAt, 2),
      updatedAt: hoursAgo(seededAt, 2),
    },
    {
      id: moderationPostId(3),
      authorId: SOCIAL_DEMO_USER_IDS.javi,
      content:
        'Armé un resumen visual para la evaluación de esta semana. Si a alguien le sirve, puedo compartir el enlace al archivo público.',
      contentType: 'community',
      visibility: 'public',
      moderationStatus: 'pending',
      shareCount: 0,
      createdAt: hoursAgo(seededAt, 5),
      updatedAt: hoursAgo(seededAt, 5),
    },
    {
      id: moderationPostId(4),
      authorId: SOCIAL_DEMO_USER_IDS.seba,
      content:
        'Hay gente del curso que claramente no debería estar aquí. Todos sabemos quiénes son.',
      contentType: 'community',
      visibility: 'campus',
      moderationStatus: 'rejected',
      moderationReason:
        'La publicación contiene una descalificación general e invita a señalar a otras personas.',
      shareCount: 0,
      createdAt: hoursAgo(seededAt, 32),
      updatedAt: hoursAgo(seededAt, 30),
    },
  ]

  await db.transaction(async (transaction) => {
    await transaction
      .insert(supportRequests)
      .values(
        requestDefinitions.map((item) => {
          const createdAt = requestCreatedAt.get(item.id)
          if (!createdAt) throw new Error(`No hay fecha para ${item.id}.`)
          return {
            id: item.id,
            requesterId: item.requesterId,
            assignedToId: item.status === 'pending' ? null : admin.id,
            sourceMessageId: null,
            category: item.category,
            subject: item.subject,
            description: item.description,
            desiredOutcome: item.desiredOutcome,
            urgency: item.urgency,
            status: item.status,
            createdAt,
            updatedAt: lastEventAt.get(item.id) ?? createdAt,
          }
        }),
      )
      .onConflictDoNothing()

    await transaction
      .insert(supportRequestEvents)
      .values(eventRows)
      .onConflictDoNothing()

    await transaction
      .insert(reports)
      .values(reportDefinitions)
      .onConflictDoNothing()

    await transaction
      .insert(posts)
      .values(moderationPosts)
      .onConflictDoNothing()

    await transaction
      .insert(notifications)
      .values([
        {
          id: notificationId(1),
          userId: admin.id,
          actorId: mainStudent.id,
          type: 'support_request',
          title: 'Nueva solicitud estudiantil',
          body: `${mainStudent.displayName}: ${requestDefinitions[0]!.subject}`,
          href: `duco-request:${requestId(1)}`,
          resourceId: requestId(1),
          createdAt: at(requestId(1), 1),
        },
        {
          id: notificationId(2),
          userId: admin.id,
          actorId: SOCIAL_DEMO_USER_IDS.fer,
          type: 'support_request',
          title: 'Nueva solicitud estudiantil',
          body: `Fernanda Leiva: ${requestDefinitions[1]!.subject}`,
          href: `duco-request:${requestId(2)}`,
          resourceId: requestId(2),
          createdAt: at(requestId(2), 1),
        },
        {
          id: notificationId(3),
          userId: mainStudent.id,
          actorId: admin.id,
          type: 'support_request',
          title: 'Solicitud resuelta',
          body: 'Tu inscripción quedó confirmada y pronto se reflejará en AVA.',
          href: `duco-request:${requestId(5)}`,
          resourceId: requestId(5),
          createdAt: at(requestId(5), 181),
        },
      ])
      .onConflictDoNothing()
  })

  console.log(
    [
      'Datos Capstone de solicitudes y moderación listos.',
      `Estudiante principal: ${mainStudent.displayName} (@${mainStudent.username})`,
      `${requestDefinitions.length} solicitudes`,
      `${reportDefinitions.length} reportes`,
      `${moderationPosts.length} publicaciones de moderación`,
    ].join(' · '),
  )
}

try {
  await seedCapstoneDemoRequests()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  ne,
  sql,
} from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  assistantMessages,
  academicCalendarEvents,
  academicCourses,
  academicTasks,
  chatParticipants,
  ducoDrafts,
  profiles,
  supportRequests,
  tasks,
  users,
} from '../db/schema.js'
import type { AssistantMessageAction, DucoTaskDraft } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody, parseId } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
  requireModerator,
} from '../middleware/authentication.js'
import { buildDucoAiReply } from '../services/duco-ai-service.js'
import { createNotification } from '../services/notification-service.js'
import { normalizeText } from '../utils/text.js'

const requestCategories = [
  'section_change',
  'missing_course',
  'enrollment',
  'schedule_conflict',
  'harassment',
  'technical',
  'financial',
  'wellbeing',
  'other',
] as const
const requestUrgencies = ['low', 'medium', 'high'] as const
const requestStatuses = [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
] as const

const sendMessageSchema = z
  .union([
    z.strictObject({ content: z.string().trim().min(1).max(2_000) }),
    z.strictObject({ message: z.string().trim().min(1).max(2_000) }),
  ])
  .transform((input) => ('content' in input ? input.content : input.message))

const createSupportRequestSchema = z.strictObject({
  sourceMessageId: z.string().uuid(),
  category: z.enum(requestCategories),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2_000),
  desiredOutcome: z.string().trim().max(1_000),
  urgency: z.enum(requestUrgencies),
})
const createAcademicTaskSchema = z
  .strictObject({
    draftId: z.string().uuid().optional(),
    sourceMessageId: z.string().uuid().optional(),
    title: z.string().trim().min(2).max(160),
    description: z
      .string()
      .trim()
      .max(1_000)
      .nullable()
      .optional()
      .transform((value) => value || null),
    courseName: z
      .string()
      .trim()
      .min(2)
      .max(300)
      .nullable()
      .optional()
      .transform((value) => value || null),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  })
  .refine((input) => input.draftId || input.sourceMessageId, {
    message: 'Se requiere un borrador de DUCO.',
    path: ['draftId'],
  })
const updateSupportRequestSchema = z.strictObject({
  status: z.enum(requestStatuses),
})

function normalizeCourseName(value: string) {
  return value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('es-CL')
}

type PendingTask = Awaited<ReturnType<typeof loadPendingTasks>>[number]

function taskLine(task: PendingTask, index: number) {
  const priority = { high: 'alta', low: 'baja', medium: 'media' }[task.priority]
  const dueDate = task.dueDate
    ? ` · vence ${new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'short',
        ...(task.dueDate.includes('T') ? { timeStyle: 'short' as const } : {}),
      }).format(new Date(task.dueDate))}`
    : ''
  const source =
    task.source === 'ava'
      ? ' · AVA'
      : task.source === 'academic'
        ? ' · agenda personal'
        : ''
  return `${index + 1}. ${task.title}${source} · prioridad ${priority}${dueDate}`
}

function taskSummary(pendingTasks: PendingTask[]) {
  if (pendingTasks.length === 0)
    return 'No tienes tareas pendientes asignadas en Konea.'
  const visibleTasks = pendingTasks.slice(0, 5)
  const remaining = pendingTasks.length - visibleTasks.length
  return [
    `Tienes ${pendingTasks.length} ${pendingTasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}:`,
    ...visibleTasks.map(taskLine),
    ...(remaining > 0 ? [`Y ${remaining} más.`] : []),
  ].join('\n')
}

function createLocalReply(
  prompt: string,
  pendingTasks: PendingTask[],
  displayName: string,
) {
  const normalized = normalizeText(prompt)
  const summary = taskSummary(pendingTasks)
  const asksForTasks =
    /\b(que|cuales|cuantas|mostrar|muestra|ver|revisar|dime|listar|lista)\b.*\b(tareas|pendientes|entregas|vencimientos)\b/.test(
      normalized,
    ) ||
    /\b(mis|las)\s+(tareas|entregas|pendientes)(?:\s+pendientes)?\b/.test(
      normalized,
    ) ||
    /\b(tengo|hay)\s+(?:alguna?s?\s+)?(tareas?|entregas?|pendientes)\b/.test(
      normalized,
    )
  const asksForPlan =
    /\b(organiza|organizar|plan|prioriza|priorizar|que hago|por donde empiezo)\b/.test(
      normalized,
    )
  const asksForAcademicHelp =
    /\b(ayuda|ayudas|ayudame|ayudar|ayudarme|explica|explicame|entender|estudiar|como hago)\b.*\b(tarea|guia|informe|proyecto|evaluacion|trabajo|actividad)\b/.test(
      normalized,
    ) ||
    /\b(tarea|guia|informe|proyecto|evaluacion|trabajo|actividad)\b.*\b(ayuda|ayudas|ayudame|ayudar|ayudarme|explica|explicame|entender|estudiar|como hago)\b/.test(
      normalized,
    )
  const greets =
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches)\b/.test(normalized)

  if (asksForPlan && pendingTasks.length > 0) {
    const firstTask = pendingTasks[0]!
    return [
      `Te propongo este plan, ${displayName}:`,
      `1. Empieza por “${firstTask.title}”${firstTask.dueDate ? `, que vence ${firstTask.dueDate}` : ''}.`,
      '2. Divide el trabajo en un bloque breve de preparación y otro de ejecución.',
      '3. Al terminar, actualiza su estado en Konea antes de pasar a la siguiente.',
      '',
      summary,
    ].join('\n')
  }
  if (asksForPlan)
    return 'Todavía no tienes tareas registradas. Si quieres, dime qué debes hacer, para qué asignatura y cuándo vence; te ayudaré a crear y organizar el pendiente.'
  if (asksForTasks) return summary
  if (asksForAcademicHelp)
    return 'Claro. Puedo ayudarte a entender los contenidos y dividir la tarea en pasos, sin hacer una entrega completa por ti. Dime la asignatura, en qué consiste y cuándo vence.'
  if (greets)
    return `¡Hola, ${displayName}! Soy DUCO. Puedo ayudarte a organizar tus tareas, estudiar contenidos o preparar una solicitud institucional.`
  return [
    'Puedo ayudarte a organizar tus tareas, estudiar contenidos y preparar solicitudes para el equipo institucional.',
    'Cuéntame qué necesitas y, si corresponde, prepararé un formulario editable.',
  ].join('\n')
}

async function loadPendingTasks(userId: string) {
  const [assignedTasks, avaEvents, personalTasks] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        status: tasks.status,
      })
      .from(tasks)
      .innerJoin(
        chatParticipants,
        and(
          eq(chatParticipants.chatId, tasks.chatId),
          eq(chatParticipants.userId, userId),
          isNull(chatParticipants.archivedAt),
        ),
      )
      .where(and(eq(tasks.assignedToId, userId), ne(tasks.status, 'completed')))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt)),
    db
      .select({
        id: academicCalendarEvents.id,
        title: academicCalendarEvents.title,
        description: academicCalendarEvents.description,
        startsAt: academicCalendarEvents.startsAt,
      })
      .from(academicCalendarEvents)
      .where(
        and(
          eq(academicCalendarEvents.userId, userId),
          eq(academicCalendarEvents.active, true),
          gte(academicCalendarEvents.startsAt, new Date()),
        ),
      )
      .orderBy(asc(academicCalendarEvents.startsAt))
      .limit(50),
    db
      .select({
        id: academicTasks.id,
        title: academicTasks.title,
        description: academicTasks.description,
        dueAt: academicTasks.dueAt,
        priority: academicTasks.priority,
        status: academicTasks.status,
      })
      .from(academicTasks)
      .where(
        and(
          eq(academicTasks.userId, userId),
          ne(academicTasks.status, 'completed'),
        ),
      )
      .orderBy(asc(academicTasks.dueAt))
      .limit(100),
  ])

  return [
    ...assignedTasks.map((task) => ({ ...task, source: 'konea' as const })),
    ...avaEvents.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      dueDate: event.startsAt.toISOString(),
      priority: 'medium' as const,
      status: 'pending' as const,
      source: 'ava' as const,
    })),
    ...personalTasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueAt?.toISOString() ?? null,
      priority: task.priority,
      status: task.status,
      source: 'academic' as const,
    })),
  ].sort((first, second) =>
    (first.dueDate ?? '9999').localeCompare(second.dueDate ?? '9999'),
  )
}

async function loadRecentConversation(userId: string) {
  const messages = await db
    .select({
      role: assistantMessages.role,
      content: assistantMessages.content,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.userId, userId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(30)
  return messages.reverse()
}

async function loadActiveTaskDraft(userId: string) {
  const [draft] = await db
    .select({
      id: ducoDrafts.id,
      status: ducoDrafts.status,
      payload: ducoDrafts.payload,
      expiresAt: ducoDrafts.expiresAt,
    })
    .from(ducoDrafts)
    .where(
      and(
        eq(ducoDrafts.userId, userId),
        eq(ducoDrafts.kind, 'task'),
        inArray(ducoDrafts.status, [
          'collecting_information',
          'ready_for_review',
        ]),
        gt(ducoDrafts.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(ducoDrafts.updatedAt))
    .limit(1)

  if (!draft) return null
  return {
    id: draft.id,
    status: draft.status as 'collecting_information' | 'ready_for_review',
    draft: draft.payload as DucoTaskDraft,
    expiresAt: draft.expiresAt.toISOString(),
  }
}

async function loadMessages(userId: string) {
  const recentMessages = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      action: assistantMessages.action,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.userId, userId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(100)

  const chronologicalMessages = recentMessages.reverse()
  const messageIds = chronologicalMessages.map((message) => message.id)
  const linkedRequests =
    messageIds.length === 0
      ? []
      : await db
          .select({
            id: supportRequests.id,
            sourceMessageId: supportRequests.sourceMessageId,
            status: supportRequests.status,
          })
          .from(supportRequests)
          .where(inArray(supportRequests.sourceMessageId, messageIds))
  const requestsByMessage = new Map(
    linkedRequests.map((supportRequest) => [
      supportRequest.sourceMessageId,
      { id: supportRequest.id, status: supportRequest.status },
    ]),
  )
  return chronologicalMessages.map((message) => ({
    ...message,
    request: requestsByMessage.get(message.id) ?? null,
  }))
}

export const ducoRouter = Router()
ducoRouter.use(requireAuthentication)

ducoRouter.get('/messages', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  response.json({ messages: await loadMessages(currentUser.id) })
})

ducoRouter.post('/messages', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const content = parseBody(sendMessageSchema, request.body)
  const [pendingTasks, conversation, activeTaskDraft] = await Promise.all([
    loadPendingTasks(currentUser.id),
    loadRecentConversation(currentUser.id),
    loadActiveTaskDraft(currentUser.id),
  ])
  const aiReply = await buildDucoAiReply({
    prompt: content,
    localReply: createLocalReply(
      content,
      pendingTasks,
      currentUser.displayName,
    ),
    conversation,
    pendingTasks,
    activeTaskDraft,
  })
  const askedAt = new Date()
  const answeredAt = new Date(askedAt.getTime() + 1)

  const result = await db.transaction(async (transaction) => {
    const [userMessage] = await transaction
      .insert(assistantMessages)
      .values({
        userId: currentUser.id,
        role: 'user',
        content,
        createdAt: askedAt,
      })
      .returning({
        id: assistantMessages.id,
        role: assistantMessages.role,
        content: assistantMessages.content,
        action: assistantMessages.action,
        createdAt: assistantMessages.createdAt,
      })
    const [insertedAssistantMessage] = await transaction
      .insert(assistantMessages)
      .values({
        userId: currentUser.id,
        role: 'assistant',
        content: aiReply.reply,
        action: aiReply.action,
        createdAt: answeredAt,
      })
      .returning({
        id: assistantMessages.id,
        role: assistantMessages.role,
        content: assistantMessages.content,
        action: assistantMessages.action,
        createdAt: assistantMessages.createdAt,
      })
    if (!userMessage || !insertedAssistantMessage)
      throw new Error('Database did not return the DUCO messages')

    let assistantMessage = insertedAssistantMessage
    if (aiReply.action?.type === 'create_task') {
      const shouldUpdateActiveDraft =
        activeTaskDraft !== null &&
        aiReply.action.draftId === activeTaskDraft.id
      let draftId: string

      if (shouldUpdateActiveDraft) {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${activeTaskDraft.id}))`,
        )
        const [updatedDraft] = await transaction
          .update(ducoDrafts)
          .set({
            status: 'ready_for_review',
            payload: aiReply.action.draft,
            sourceMessageId: insertedAssistantMessage.id,
            expiresAt: sql`now() + interval '30 days'`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(ducoDrafts.id, activeTaskDraft.id),
              eq(ducoDrafts.userId, currentUser.id),
              eq(ducoDrafts.kind, 'task'),
              inArray(ducoDrafts.status, [
                'collecting_information',
                'ready_for_review',
              ]),
              gt(ducoDrafts.expiresAt, new Date()),
            ),
          )
          .returning({ id: ducoDrafts.id })
        if (!updatedDraft)
          throw new Error('The active DUCO task draft could not be updated')
        draftId = updatedDraft.id
      } else {
        const [createdDraft] = await transaction
          .insert(ducoDrafts)
          .values({
            userId: currentUser.id,
            kind: 'task',
            status: 'ready_for_review',
            payload: aiReply.action.draft,
            sourceMessageId: insertedAssistantMessage.id,
          })
          .returning({ id: ducoDrafts.id })
        if (!createdDraft)
          throw new Error('Database did not return the DUCO task draft')
        draftId = createdDraft.id
      }

      const persistedAction: AssistantMessageAction = {
        ...aiReply.action,
        draftId,
        draftStatus: 'ready_for_review',
        task: null,
      }
      const [updatedAssistantMessage] = await transaction
        .update(assistantMessages)
        .set({ action: persistedAction })
        .where(eq(assistantMessages.id, insertedAssistantMessage.id))
        .returning({
          id: assistantMessages.id,
          role: assistantMessages.role,
          content: assistantMessages.content,
          action: assistantMessages.action,
          createdAt: assistantMessages.createdAt,
        })
      if (!updatedAssistantMessage)
        throw new Error('Database did not return the updated DUCO message')
      assistantMessage = updatedAssistantMessage
    }

    return {
      userMessage: { ...userMessage, request: null },
      assistantMessage: { ...assistantMessage, request: null },
    }
  })

  response.status(201).json({
    ...result,
    openTaskCount: pendingTasks.length,
    aiProvider: aiReply.provider,
  })
})

ducoRouter.delete('/messages', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const deleted = await db
    .delete(assistantMessages)
    .where(eq(assistantMessages.userId, currentUser.id))
    .returning({ id: assistantMessages.id })
  response.json({ deletedCount: deleted.length })
})

ducoRouter.get('/drafts', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const drafts = await db
    .select({
      id: ducoDrafts.id,
      kind: ducoDrafts.kind,
      status: ducoDrafts.status,
      payload: ducoDrafts.payload,
      sourceMessageId: ducoDrafts.sourceMessageId,
      completedResourceId: ducoDrafts.completedResourceId,
      expiresAt: ducoDrafts.expiresAt,
      createdAt: ducoDrafts.createdAt,
      updatedAt: ducoDrafts.updatedAt,
    })
    .from(ducoDrafts)
    .where(
      and(
        eq(ducoDrafts.userId, currentUser.id),
        inArray(ducoDrafts.status, [
          'collecting_information',
          'ready_for_review',
        ]),
        gt(ducoDrafts.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(ducoDrafts.updatedAt))
  response.json({ drafts })
})

ducoRouter.delete('/drafts/:draftId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const draftId = parseId(
    request.params.draftId,
    'El borrador de DUCO no es valido.',
  )

  const result = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${draftId}))`,
    )
    const [draft] = await transaction
      .select()
      .from(ducoDrafts)
      .where(
        and(eq(ducoDrafts.id, draftId), eq(ducoDrafts.userId, currentUser.id)),
      )
      .limit(1)
    if (!draft) {
      throw new ApiError(
        404,
        'DUCO_DRAFT_NOT_FOUND',
        'El borrador de DUCO no existe.',
      )
    }
    if (draft.status === 'confirmed') {
      throw new ApiError(
        409,
        'DUCO_DRAFT_ALREADY_CONFIRMED',
        'Este borrador ya fue confirmado.',
      )
    }

    const cancelledDraft =
      draft.status === 'cancelled'
        ? draft
        : (
            await transaction
              .update(ducoDrafts)
              .set({ status: 'cancelled', updatedAt: new Date() })
              .where(
                and(
                  eq(ducoDrafts.id, draft.id),
                  eq(ducoDrafts.userId, currentUser.id),
                ),
              )
              .returning()
          )[0]
    if (!cancelledDraft)
      throw new Error('Database did not return the cancelled DUCO draft')

    if (draft.sourceMessageId) {
      const [sourceMessage] = await transaction
        .select({ action: assistantMessages.action })
        .from(assistantMessages)
        .where(
          and(
            eq(assistantMessages.id, draft.sourceMessageId),
            eq(assistantMessages.userId, currentUser.id),
            eq(assistantMessages.role, 'assistant'),
          ),
        )
        .limit(1)
      if (sourceMessage?.action?.type === 'create_task') {
        await transaction
          .update(assistantMessages)
          .set({
            action: {
              ...sourceMessage.action,
              draftId: draft.id,
              draftStatus: 'cancelled',
            },
          })
          .where(eq(assistantMessages.id, draft.sourceMessageId))
      }
    }

    return cancelledDraft
  })

  response.json({ draft: result })
})

ducoRouter.post('/tasks', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(createAcademicTaskSchema, request.body)

  const result = await db.transaction(async (transaction) => {
    let draftId = input.draftId
    let sourceMessage:
      { id: string; action: AssistantMessageAction | null } | undefined

    // Los clientes anteriores solo envían sourceMessageId. Si ese mensaje ya
    // pertenece al flujo persistente, usamos su draftId y evitamos duplicados.
    if (!draftId && input.sourceMessageId) {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.sourceMessageId}))`,
      )
      ;[sourceMessage] = await transaction
        .select({
          id: assistantMessages.id,
          action: assistantMessages.action,
        })
        .from(assistantMessages)
        .where(
          and(
            eq(assistantMessages.id, input.sourceMessageId),
            eq(assistantMessages.userId, currentUser.id),
            eq(assistantMessages.role, 'assistant'),
          ),
        )
        .limit(1)
      if (!sourceMessage || sourceMessage.action?.type !== 'create_task') {
        throw new ApiError(
          404,
          'DUCO_TASK_DRAFT_NOT_FOUND',
          'El borrador de pendiente de DUCO no existe.',
        )
      }
      draftId = sourceMessage.action.draftId ?? undefined
    }

    let persistentDraft:
      | {
          id: string
          status:
            | 'collecting_information'
            | 'ready_for_review'
            | 'confirmed'
            | 'cancelled'
            | 'expired'
          sourceMessageId: string | null
          completedResourceId: string | null
          expiresAt: Date
        }
      | undefined

    if (draftId) {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${draftId}))`,
      )
      await transaction.execute(
        sql`select 1 from ${ducoDrafts} where ${ducoDrafts.id} = ${draftId} for update`,
      )
      const [draft] = await transaction
        .select({
          id: ducoDrafts.id,
          kind: ducoDrafts.kind,
          status: ducoDrafts.status,
          sourceMessageId: ducoDrafts.sourceMessageId,
          completedResourceId: ducoDrafts.completedResourceId,
          expiresAt: ducoDrafts.expiresAt,
        })
        .from(ducoDrafts)
        .where(
          and(
            eq(ducoDrafts.id, draftId),
            eq(ducoDrafts.userId, currentUser.id),
          ),
        )
        .limit(1)
      if (!draft) {
        throw new ApiError(
          404,
          'DUCO_TASK_DRAFT_NOT_FOUND',
          'El borrador de pendiente de DUCO no existe.',
        )
      }
      if (draft.kind !== 'task') {
        throw new ApiError(
          409,
          'DUCO_TASK_DRAFT_INVALID_KIND',
          'Este borrador no corresponde a un pendiente académico.',
        )
      }
      if (draft.status === 'confirmed' || draft.completedResourceId) {
        throw new ApiError(
          409,
          'DUCO_TASK_ALREADY_CREATED',
          'Este pendiente ya fue creado.',
        )
      }
      if (draft.expiresAt <= new Date() || draft.status === 'expired') {
        throw new ApiError(
          409,
          'DUCO_TASK_DRAFT_EXPIRED',
          'El borrador de pendiente expiró.',
        )
      }
      if (draft.status === 'cancelled') {
        throw new ApiError(
          409,
          'DUCO_TASK_DRAFT_CANCELLED',
          'El borrador de pendiente fue descartado.',
        )
      }
      if (draft.status !== 'ready_for_review') {
        throw new ApiError(
          409,
          'DUCO_TASK_DRAFT_NOT_READY',
          'El borrador todavía requiere información.',
        )
      }
      persistentDraft = draft

      if (
        draft.sourceMessageId &&
        sourceMessage?.id !== draft.sourceMessageId
      ) {
        ;[sourceMessage] = await transaction
          .select({
            id: assistantMessages.id,
            action: assistantMessages.action,
          })
          .from(assistantMessages)
          .where(
            and(
              eq(assistantMessages.id, draft.sourceMessageId),
              eq(assistantMessages.userId, currentUser.id),
              eq(assistantMessages.role, 'assistant'),
            ),
          )
          .limit(1)
      }
    } else {
      if (!sourceMessage || sourceMessage.action?.type !== 'create_task') {
        throw new ApiError(
          404,
          'DUCO_TASK_DRAFT_NOT_FOUND',
          'El borrador de pendiente de DUCO no existe.',
        )
      }
      if (sourceMessage.action.task?.id) {
        throw new ApiError(
          409,
          'DUCO_TASK_ALREADY_CREATED',
          'Este pendiente ya fue creado.',
        )
      }
    }

    let courseId: string | null = null
    if (input.courseName) {
      const name = input.courseName.trim().replaceAll(/\s+/g, ' ')
      const normalizedName = normalizeCourseName(name)
      const [course] = await transaction
        .insert(academicCourses)
        .values({
          userId: currentUser.id,
          name,
          normalizedName,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [academicCourses.userId, academicCourses.normalizedName],
          set: { active: true, updatedAt: new Date() },
        })
        .returning({ id: academicCourses.id })
      if (!course)
        throw new Error('Database did not return the academic course')
      courseId = course.id
    }

    const [createdTask] = await transaction
      .insert(academicTasks)
      .values({
        userId: currentUser.id,
        courseId,
        title: input.title,
        description: input.description,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority,
      })
      .returning()
    if (!createdTask)
      throw new Error('Database did not return the DUCO academic task')

    const finalDraft: DucoTaskDraft = {
      title: input.title,
      description: input.description ?? '',
      courseName: input.courseName ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority,
    }
    let action: AssistantMessageAction

    if (persistentDraft) {
      const [confirmedDraft] = await transaction
        .update(ducoDrafts)
        .set({
          status: 'confirmed',
          payload: finalDraft,
          completedResourceId: createdTask.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ducoDrafts.id, persistentDraft.id),
            eq(ducoDrafts.userId, currentUser.id),
            eq(ducoDrafts.status, 'ready_for_review'),
          ),
        )
        .returning({ id: ducoDrafts.id })
      if (!confirmedDraft)
        throw new Error('Database did not confirm the DUCO task draft')

      action =
        sourceMessage?.action?.type === 'create_task'
          ? {
              ...sourceMessage.action,
              draft: finalDraft,
              draftId: persistentDraft.id,
              draftStatus: 'confirmed',
              task: { id: createdTask.id },
            }
          : {
              type: 'create_task',
              label: 'Revisar y crear',
              draft: finalDraft,
              draftId: persistentDraft.id,
              draftStatus: 'confirmed',
              task: { id: createdTask.id },
            }
    } else {
      if (!sourceMessage || sourceMessage.action?.type !== 'create_task')
        throw new Error('The legacy DUCO task message was not loaded')
      action = {
        ...sourceMessage.action,
        task: { id: createdTask.id },
      }
    }

    if (sourceMessage) {
      await transaction
        .update(assistantMessages)
        .set({ action })
        .where(
          and(
            eq(assistantMessages.id, sourceMessage.id),
            eq(assistantMessages.userId, currentUser.id),
          ),
        )
    }

    return { task: createdTask, action }
  })

  response.status(201).json(result)
})

ducoRouter.get('/requests', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const requests = await db
    .select()
    .from(supportRequests)
    .where(eq(supportRequests.requesterId, currentUser.id))
    .orderBy(desc(supportRequests.createdAt))
  response.json({ requests })
})

ducoRouter.post('/requests', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(createSupportRequestSchema, request.body)
  const [sourceMessage] = await db
    .select({
      id: assistantMessages.id,
      action: assistantMessages.action,
    })
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.id, input.sourceMessageId),
        eq(assistantMessages.userId, currentUser.id),
        eq(assistantMessages.role, 'assistant'),
      ),
    )
    .limit(1)

  if (!sourceMessage || sourceMessage.action?.type !== 'manage_request') {
    throw new ApiError(
      404,
      'DUCO_REQUEST_DRAFT_NOT_FOUND',
      'El borrador de solicitud de DUCO no existe.',
    )
  }
  const [existingRequest] = await db
    .select({ id: supportRequests.id })
    .from(supportRequests)
    .where(eq(supportRequests.sourceMessageId, sourceMessage.id))
    .limit(1)
  if (existingRequest) {
    throw new ApiError(
      409,
      'DUCO_REQUEST_ALREADY_SENT',
      'Esta solicitud ya fue enviada.',
    )
  }

  const [createdRequest] = await db
    .insert(supportRequests)
    .values({
      requesterId: currentUser.id,
      sourceMessageId: sourceMessage.id,
      category: input.category,
      subject: input.subject,
      description: input.description,
      desiredOutcome: input.desiredOutcome,
      urgency: input.urgency,
    })
    .returning()
  if (!createdRequest)
    throw new Error('Database did not return the DUCO support request')

  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ['moderator', 'admin']))
  await Promise.all(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.id,
        actorId: currentUser.id,
        type: 'support_request',
        title: 'Nueva solicitud estudiantil',
        body: `${currentUser.displayName}: ${createdRequest.subject}`,
        href: `duco-request:${createdRequest.id}`,
        resourceId: createdRequest.id,
      }),
    ),
  )
  response.status(201).json({ request: createdRequest })
})

ducoRouter.get(
  '/requests/all',
  requireModerator,
  async (_request, response) => {
    const requests = await db
      .select()
      .from(supportRequests)
      .orderBy(desc(supportRequests.createdAt))
    const personIds = [
      ...new Set(
        requests.flatMap((item) =>
          item.assignedToId
            ? [item.requesterId, item.assignedToId]
            : [item.requesterId],
        ),
      ),
    ]
    const people =
      personIds.length === 0
        ? []
        : await db
            .select({
              id: users.id,
              username: profiles.username,
              displayName: profiles.displayName,
              avatarUrl: profiles.avatarUrl,
            })
            .from(users)
            .innerJoin(profiles, eq(profiles.userId, users.id))
            .where(inArray(users.id, personIds))
    const peopleById = new Map(people.map((person) => [person.id, person]))
    response.json({
      requests: requests.map((item) => ({
        ...item,
        requester: peopleById.get(item.requesterId) ?? null,
        assignedTo: item.assignedToId
          ? (peopleById.get(item.assignedToId) ?? null)
          : null,
      })),
    })
  },
)

ducoRouter.patch(
  '/requests/:requestId',
  requireModerator,
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const requestId = parseId(
      request.params.requestId,
      'La solicitud no es válida.',
    )
    const input = parseBody(updateSupportRequestSchema, request.body)
    const [currentRequest] = await db
      .select()
      .from(supportRequests)
      .where(eq(supportRequests.id, requestId))
      .limit(1)
    if (!currentRequest)
      throw new ApiError(
        404,
        'DUCO_REQUEST_NOT_FOUND',
        'La solicitud no existe.',
      )

    if (currentRequest.status === input.status) {
      response.json({ request: currentRequest })
      return
    }

    const [updatedRequest] = await db
      .update(supportRequests)
      .set({
        status: input.status,
        assignedToId: input.status === 'pending' ? null : currentUser.id,
        updatedAt: new Date(),
      })
      .where(eq(supportRequests.id, requestId))
      .returning()
    if (!updatedRequest)
      throw new Error('Database did not return the updated DUCO request')

    const translatedStatus = {
      pending: 'pendiente',
      reviewing: 'en revisión',
      resolved: 'resuelta',
      rejected: 'rechazada',
    }[input.status]
    await createNotification({
      userId: updatedRequest.requesterId,
      actorId: currentUser.id,
      type: 'support_request',
      title: 'Solicitud actualizada',
      body: `Tu solicitud ahora está ${translatedStatus}.`,
      href: `duco-request:${updatedRequest.id}`,
      resourceId: updatedRequest.id,
    })
    response.json({ request: updatedRequest })
  },
)

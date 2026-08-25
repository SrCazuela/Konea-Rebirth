import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { assistantMessages, chatParticipants, tasks } from '../db/schema.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'

const sendMessageSchema = z
  .union([
    z.strictObject({ content: z.string().trim().min(1).max(2_000) }),
    z.strictObject({ message: z.string().trim().min(1).max(2_000) }),
  ])
  .transform((input) => ('content' in input ? input.content : input.message))

type PendingTask = Awaited<ReturnType<typeof loadPendingTasks>>[number]

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function taskLine(task: PendingTask, index: number) {
  const priority = {
    high: 'alta',
    low: 'baja',
    medium: 'media',
  }[task.priority]
  const dueDate = task.dueDate ? ` · vence ${task.dueDate}` : ''
  return `${index + 1}. ${task.title} · prioridad ${priority}${dueDate}`
}

function taskSummary(pendingTasks: PendingTask[]) {
  if (pendingTasks.length === 0) {
    return 'No tienes tareas pendientes asignadas en Konea.'
  }

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
    /\b(tarea|tareas|pendiente|pendientes|entrega|entregas|vence|vencimiento)\b/.test(
      normalized,
    )
  const asksForPlan =
    /\b(organiza|organizar|plan|prioriza|priorizar|que hago|por donde empiezo)\b/.test(
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

  if (asksForTasks) return summary

  if (greets) {
    return [
      `¡Hola, ${displayName}! Soy DUCO en modo local.`,
      summary,
      'Puedes pedirme “organiza mis tareas” o “qué tengo pendiente”.',
    ].join('\n')
  }

  return [
    'Puedo ayudarte localmente a revisar y priorizar tus tareas de Konea, sin enviar información a servicios externos.',
    summary,
    'Prueba con “organiza mis tareas” para obtener un plan breve.',
  ].join('\n')
}

async function loadPendingTasks(userId: string) {
  return db
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
    .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt))
}

export const ducoRouter = Router()

ducoRouter.use(requireAuthentication)

ducoRouter.get('/messages', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const recentMessages = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.userId, currentUser.id))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(100)

  response.json({ messages: recentMessages.reverse() })
})

ducoRouter.post('/messages', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const content = parseBody(sendMessageSchema, request.body)
  const pendingTasks = await loadPendingTasks(currentUser.id)
  const reply = createLocalReply(content, pendingTasks, currentUser.displayName)
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
        createdAt: assistantMessages.createdAt,
      })

    const [assistantMessage] = await transaction
      .insert(assistantMessages)
      .values({
        userId: currentUser.id,
        role: 'assistant',
        content: reply,
        createdAt: answeredAt,
      })
      .returning({
        id: assistantMessages.id,
        role: assistantMessages.role,
        content: assistantMessages.content,
        createdAt: assistantMessages.createdAt,
      })

    if (!userMessage || !assistantMessage) {
      throw new Error('Database did not return the DUCO messages')
    }

    return { userMessage, assistantMessage }
  })

  response.status(201).json({
    ...result,
    openTaskCount: pendingTasks.length,
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

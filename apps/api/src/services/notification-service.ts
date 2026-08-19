import { db } from '../db/client.js'
import { notifications } from '../db/schema.js'

function truncateForColumn(value: string, maximumLength: number) {
  const characters = Array.from(value)
  if (characters.length <= maximumLength) return value
  return `${characters.slice(0, maximumLength - 3).join('')}...`
}

export async function createNotification(input: {
  userId: string
  actorId?: string
  type: typeof notifications.$inferInsert.type
  title: string
  body: string
  href?: string
  resourceId?: string
}) {
  if (input.actorId && input.actorId === input.userId) return
  await db.insert(notifications).values({
    ...input,
    title: truncateForColumn(input.title, 160),
    body: truncateForColumn(input.body, 500),
    href: input.href ? truncateForColumn(input.href, 500) : undefined,
  })
}

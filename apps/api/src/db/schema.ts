import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const userRole = pgEnum('user_role', [
  'student',
  'professor',
  'moderator',
  'admin',
])

export const userStatus = pgEnum('user_status', [
  'active',
  'suspended',
  'deleted',
])

export const postVisibility = pgEnum('post_visibility', [
  'campus',
  'connections',
  'public',
])

export const moderationStatus = pgEnum('moderation_status', [
  'pending',
  'approved',
  'rejected',
])

export const postContentType = pgEnum('post_content_type', [
  'announcement',
  'community',
])

export const chatType = pgEnum('chat_type', ['direct', 'group'])

export const chatMemberRole = pgEnum('chat_member_role', [
  'member',
  'admin',
  'owner',
])

export const messageType = pgEnum('message_type', [
  'text',
  'image',
  'file',
  'poll',
  'system',
])

export const taskPriority = pgEnum('task_priority', ['low', 'medium', 'high'])

export const taskStatus = pgEnum('task_status', [
  'pending',
  'in_progress',
  'completed',
])

export const academicCourseSource = pgEnum('academic_course_source', [
  'manual',
  'ava',
])

export const notificationType = pgEnum('notification_type', [
  'connection',
  'like',
  'comment',
  'reply',
  'message',
  'task',
  'moderation',
  'support_request',
])

export const supportRequestCategory = pgEnum('support_request_category', [
  'section_change',
  'missing_course',
  'enrollment',
  'schedule_conflict',
  'harassment',
  'technical',
  'financial',
  'wellbeing',
  'other',
])

export const supportRequestUrgency = pgEnum('support_request_urgency', [
  'low',
  'medium',
  'high',
])

export const supportRequestStatus = pgEnum('support_request_status', [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
])

export const ducoDraftKind = pgEnum('duco_draft_kind', [
  'task',
  'support_request',
])

export const ducoDraftStatus = pgEnum('duco_draft_status', [
  'collecting_information',
  'ready_for_review',
  'confirmed',
  'cancelled',
  'expired',
])

export type DucoDraftKind = (typeof ducoDraftKind.enumValues)[number]
export type DucoDraftStatus = (typeof ducoDraftStatus.enumValues)[number]

export type ProfileEducation = {
  id: string
  institution: string
  program: string
  startYear: number | null
  endYear: number | null
  current: boolean
}

export type ProfileProject = {
  id: string
  title: string
  description: string
  url: string | null
  repositoryUrl: string | null
  imageUrl: string | null
  technologies: string[]
}

export type ProfileAchievement = {
  id: string
  title: string
  issuer: string
  issuedAt: string | null
  description: string
  credentialUrl: string | null
}

export type DucoRequestDraft = {
  category:
    | 'section_change'
    | 'missing_course'
    | 'enrollment'
    | 'schedule_conflict'
    | 'harassment'
    | 'technical'
    | 'financial'
    | 'wellbeing'
    | 'other'
  subject: string
  description: string
  desiredOutcome: string
  urgency: 'low' | 'medium' | 'high'
}

export type DucoTaskDraft = {
  title: string
  description: string
  courseName: string | null
  dueAt: string | null
  priority: 'low' | 'medium' | 'high'
}

export type AssistantMessageAction =
  | {
      type: 'manage_request'
      label: 'Gestionar solicitud'
      draft: DucoRequestDraft
    }
  | {
      type: 'create_task'
      label: string
      draft: DucoTaskDraft
      draftId?: string | null
      draftStatus?: DucoDraftStatus
      task?: { id: string } | null
    }

export const assistantMessageRole = pgEnum('assistant_message_role', [
  'user',
  'assistant',
])

export const reportResourceType = pgEnum('report_resource_type', [
  'post',
  'comment',
  'chat',
  'message',
  'user',
])

export const reportStatus = pgEnum('report_status', [
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
])

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').default('student').notNull(),
    status: userStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('user_sessions_token_hash_unique').on(table.tokenHash),
    index('user_sessions_user_id_index').on(table.userId),
    index('user_sessions_expires_at_index').on(table.expiresAt),
  ],
)

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: varchar('username', { length: 40 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    bio: varchar('bio', { length: 280 }),
    institution: varchar('institution', { length: 160 }),
    career: varchar('career', { length: 160 }),
    avatarUrl: text('avatar_url'),
    coverUrl: text('cover_url'),
    campus: varchar('campus', { length: 160 }),
    website: text('website'),
    education: jsonb('education')
      .$type<ProfileEducation[]>()
      .default([])
      .notNull(),
    projects: jsonb('projects').$type<ProfileProject[]>().default([]).notNull(),
    achievements: jsonb('achievements')
      .$type<ProfileAchievement[]>()
      .default([])
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('profiles_username_unique').on(table.username)],
)

export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storedName: varchar('stored_name', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uploaded_files_stored_name_unique').on(table.storedName),
    index('uploaded_files_owner_created_at_index').on(
      table.ownerId,
      table.createdAt,
    ),
  ],
)

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 2_000 }).notNull(),
    imageUrl: text('image_url'),
    contentType: postContentType('content_type').default('community').notNull(),
    visibility: postVisibility('visibility').default('campus').notNull(),
    moderationStatus: moderationStatus('moderation_status')
      .default('pending')
      .notNull(),
    moderationReason: varchar('moderation_reason', { length: 500 }),
    shareCount: integer('share_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('posts_author_created_at_index').on(table.authorId, table.createdAt),
    index('posts_feed_index').on(
      table.moderationStatus,
      table.visibility,
      table.createdAt,
    ),
  ],
)

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id').references(
      (): AnyPgColumn => comments.id,
      { onDelete: 'cascade' },
    ),
    content: varchar('content', { length: 1_000 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('comments_post_created_at_index').on(table.postId, table.createdAt),
    index('comments_parent_comment_id_index').on(table.parentCommentId),
  ],
)

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
)

export const connectionIntents = pgTable(
  'connection_intents',
  {
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.requesterId, table.recipientId] }),
    index('connection_intents_recipient_index').on(table.recipientId),
    index('connection_intents_expires_at_index').on(table.expiresAt),
    check(
      'connection_intents_cannot_request_self',
      sql`${table.requesterId} <> ${table.recipientId}`,
    ),
  ],
)

export const connections = pgTable(
  'connections',
  {
    userOneId: uuid('user_one_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userTwoId: uuid('user_two_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userOneId, table.userTwoId] }),
    index('connections_user_two_id_index').on(table.userTwoId),
    check(
      'connections_canonical_pair',
      sql`${table.userOneId} < ${table.userTwoId}`,
    ),
  ],
)

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: chatType('type').default('direct').notNull(),
    directKey: varchar('direct_key', { length: 73 }),
    name: varchar('name', { length: 120 }),
    avatarUrl: text('avatar_url'),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('chats_direct_key_unique').on(table.directKey),
    index('chats_updated_at_index').on(table.updatedAt),
  ],
)

export const chatParticipants = pgTable(
  'chat_participants',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: chatMemberRole('role').default('member').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.userId] }),
    index('chat_participants_user_id_index').on(table.userId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 4_000 }).default('').notNull(),
    type: messageType('type').default('text').notNull(),
    fileUrl: text('file_url'),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('messages_chat_created_at_index').on(table.chatId, table.createdAt),
    index('messages_sender_id_index').on(table.senderId),
  ],
)

export const messageReceipts = pgTable(
  'message_receipts',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('message_receipts_user_id_index').on(table.userId),
  ],
)

export const chatReads = pgTable(
  'chat_reads',
  {
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.userId] })],
)

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedToId: uuid('assigned_to_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: varchar('description', { length: 1_000 }),
    dueDate: date('due_date'),
    priority: taskPriority('priority').default('medium').notNull(),
    status: taskStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('tasks_chat_created_at_index').on(table.chatId, table.createdAt),
    index('tasks_assigned_to_status_index').on(
      table.assignedToId,
      table.status,
    ),
  ],
)

export const academicCalendarEvents = pgTable(
  'academic_calendar_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    externalId: varchar('external_id', { length: 64 }).notNull(),
    uid: varchar('uid', { length: 500 }),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 300 }),
    courseName: varchar('course_name', { length: 300 }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    allDay: boolean('all_day').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('academic_calendar_events_user_external_unique').on(
      table.userId,
      table.externalId,
    ),
    index('academic_calendar_events_user_start_index').on(
      table.userId,
      table.startsAt,
    ),
  ],
)

export const academicCalendarSyncs = pgTable('academic_calendar_syncs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastEventCount: integer('last_event_count').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const academicCourses = pgTable(
  'academic_courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    normalizedName: varchar('normalized_name', { length: 300 }).notNull(),
    code: varchar('code', { length: 80 }),
    section: varchar('section', { length: 80 }),
    term: varchar('term', { length: 100 }),
    source: academicCourseSource('source').default('manual').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('academic_courses_user_name_unique').on(
      table.userId,
      table.normalizedName,
    ),
    index('academic_courses_user_active_index').on(table.userId, table.active),
  ],
)

export const academicTasks = pgTable(
  'academic_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => academicCourses.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 160 }).notNull(),
    description: varchar('description', { length: 1_000 }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    priority: taskPriority('priority').default('medium').notNull(),
    status: taskStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('academic_tasks_user_status_due_index').on(
      table.userId,
      table.status,
      table.dueAt,
    ),
    index('academic_tasks_course_index').on(table.courseId),
  ],
)

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 6 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedById: uuid('used_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('qr_codes_code_unique').on(table.code),
    index('qr_codes_owner_expires_at_index').on(table.ownerId, table.expiresAt),
  ],
)

export const polls = pgTable(
  'polls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: varchar('question', { length: 80 }).notNull(),
    allowMultiple: boolean('allow_multiple').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex('polls_message_id_unique').on(table.messageId)],
)

export const pollOptions = pgTable(
  'poll_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 40 }).notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    index('poll_options_poll_position_index').on(table.pollId, table.position),
  ],
)

export const pollVotes = pgTable(
  'poll_votes',
  {
    pollId: uuid('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    optionId: uuid('option_id')
      .notNull()
      .references(() => pollOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.pollId, table.optionId, table.userId] }),
    index('poll_votes_poll_user_index').on(table.pollId, table.userId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    type: notificationType('type').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: varchar('body', { length: 500 }).notNull(),
    href: varchar('href', { length: 500 }),
    resourceId: uuid('resource_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notifications_user_created_at_index').on(
      table.userId,
      table.createdAt,
    ),
  ],
)

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: assistantMessageRole('role').notNull(),
    content: varchar('content', { length: 8_000 }).notNull(),
    action: jsonb('action').$type<AssistantMessageAction>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('assistant_messages_user_created_at_index').on(
      table.userId,
      table.createdAt,
    ),
  ],
)

export const ducoDrafts = pgTable(
  'duco_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: ducoDraftKind('kind').notNull(),
    status: ducoDraftStatus('status')
      .default('collecting_information')
      .notNull(),
    payload: jsonb('payload')
      .$type<DucoTaskDraft | DucoRequestDraft>()
      .notNull(),
    sourceMessageId: uuid('source_message_id').references(
      () => assistantMessages.id,
      { onDelete: 'set null' },
    ),
    completedResourceId: uuid('completed_resource_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '30 days'`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('duco_drafts_source_message_unique')
      .on(table.sourceMessageId)
      .where(sql`${table.sourceMessageId} is not null`),
    index('duco_drafts_user_status_updated_at_index').on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
    index('duco_drafts_expires_at_index').on(table.expiresAt),
  ],
)

export const supportRequests = pgTable(
  'support_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sourceMessageId: uuid('source_message_id').references(
      () => assistantMessages.id,
      { onDelete: 'set null' },
    ),
    category: supportRequestCategory('category').notNull(),
    subject: varchar('subject', { length: 160 }).notNull(),
    description: varchar('description', { length: 2_000 }).notNull(),
    desiredOutcome: varchar('desired_outcome', { length: 1_000 }).notNull(),
    urgency: supportRequestUrgency('urgency').default('medium').notNull(),
    status: supportRequestStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('support_requests_source_message_unique').on(
      table.sourceMessageId,
    ),
    index('support_requests_requester_created_at_index').on(
      table.requesterId,
      table.createdAt,
    ),
    index('support_requests_status_created_at_index').on(
      table.status,
      table.createdAt,
    ),
  ],
)

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resourceType: reportResourceType('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    reason: varchar('reason', { length: 160 }).notNull(),
    details: varchar('details', { length: 1_000 }),
    status: reportStatus('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reports_status_created_at_index').on(table.status, table.createdAt),
  ],
)

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
  'followers',
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

export const notificationType = pgEnum('notification_type', [
  'follow',
  'like',
  'comment',
  'reply',
  'message',
  'task',
  'moderation',
])

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

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index('follows_following_id_index').on(table.followingId),
    check(
      'follows_cannot_follow_self',
      sql`${table.followerId} <> ${table.followingId}`,
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

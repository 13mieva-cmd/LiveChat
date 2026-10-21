import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull().default('Оператор'),
  status: text('status').notNull().default('online'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  publicKey: text('public_key').notNull().unique(),
  color: text('color').notNull().default('#4f46e5'),
  logoUrl: text('logo_url'),
  headerTitle: text('header_title').notNull().default('Поддержка'),
  greeting: text('greeting').notNull().default('Здравствуйте! Чем можем помочь?'),
  position: text('position').notNull().default('right'),
  offsetX: integer('offset_x').notNull().default(20),
  offsetY: integer('offset_y').notNull().default(20),
  quickButtons: jsonb('quick_buttons').notNull().default([]),
  workingHours: jsonb('working_hours').notNull().default({}),
  timezone: text('timezone').notNull().default('Europe/Minsk'),
  offlineMessage: text('offline_message').notNull().default('Сейчас мы не в сети. Оставьте сообщение, и мы ответим.'),
  soundEnabled: boolean('sound_enabled').notNull().default(true),
  mobileBehavior: text('mobile_behavior').notNull().default('panel'),
  hiddenPages: text('hidden_pages').notNull().default(''),
  autoInviteEnabled: boolean('auto_invite_enabled').notNull().default(false),
  autoInviteDelaySeconds: integer('auto_invite_delay_seconds').notNull().default(30),
  draftPreviewEnabled: boolean('draft_preview_enabled').notNull().default(false),
  retentionDays: integer('retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const visitors = pgTable('visitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  city: text('city'),
  country: text('country'),
  referrer: text('referrer'),
  landingUrl: text('landing_url'),
  utm: jsonb('utm').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('visitors_site_token_idx').on(table.siteId, table.token)]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  visitorId: uuid('visitor_id').notNull().references(() => visitors.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('new'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  currentPage: text('current_page'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true })
}, (table) => [index('conversations_site_status_idx').on(table.siteId, table.status)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderType: text('sender_type').notNull(),
  senderId: uuid('sender_id'),
  body: text('body').notNull(),
  clientId: text('client_id'),
  status: text('status').notNull().default('sent'),
  edited: boolean('edited').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('messages_conversation_client_idx').on(table.conversationId, table.clientId)]);

export const messageRevisions = pgTable('message_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  previousBody: text('previous_body').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow()
});

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const quickReplies = pgTable('quick_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  category: text('category').notNull().default('Общее'),
  shortcut: text('shortcut'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

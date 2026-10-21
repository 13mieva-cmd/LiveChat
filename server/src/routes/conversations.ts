import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { conversations, messages, messageRevisions, notes, sites, visitors } from '../schema.js';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { requireOperator } from '../auth.js';
import { editMessageSchema, messageSchema, noteSchema } from '../validation.js';
import { createMessage } from '../chat-service.js';
import { broadcast } from '../ws.js';

async function getConversation(id: string) {
  const [row] = await db.select({ conversation: conversations, site: sites })
    .from(conversations)
    .innerJoin(sites, eq(sites.id, conversations.siteId))
    .where(eq(conversations.id, id))
    .limit(1);
  return row ?? null;
}

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations', { preHandler: requireOperator }, async (request) => {
    const query = request.query as { status?: string; siteId?: string; q?: string };
    const filters = [];

    if (query.status && query.status !== 'all') filters.push(eq(conversations.status, query.status));
    if (query.siteId) filters.push(eq(conversations.siteId, query.siteId));
    if (query.q) filters.push(or(ilike(messages.body, `%${query.q}%`), ilike(visitors.token, `%${query.q}%`)));

    return db.select({
      conversation: conversations,
      site: sites,
      visitor: visitors,
      lastMessage: messages.body,
      lastMessageAt: messages.createdAt
    })
      .from(conversations)
      .innerJoin(sites, eq(sites.id, conversations.siteId))
      .innerJoin(visitors, eq(visitors.id, conversations.visitorId))
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(conversations.lastActivityAt))
      .limit(100);
  });

  app.get('/conversations/:id', { preHandler: requireOperator }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getConversation(id);
    if (!row) return reply.code(404).send({ error: 'Диалог не найден' });

    const [visitor] = await db.select().from(visitors).where(eq(visitors.id, row.conversation.visitorId));
    const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    const dialogNotes = await db.select().from(notes).where(eq(notes.conversationId, id)).orderBy(desc(notes.createdAt));

    return { ...row, visitor, messages: history, notes: dialogNotes };
  });

  app.post('/conversations/:id/messages', { preHandler: requireOperator }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректное сообщение' });

    const row = await getConversation(id);
    if (!row) return reply.code(404).send({ error: 'Диалог не найден' });

    const message = await createMessage({
      conversationId: id,
      senderType: 'operator',
      senderId: request.operator!.id,
      body: parsed.data.body,
      clientId: parsed.data.clientId
    });

    broadcast(`visitor:${row.conversation.visitorId}`, { type: 'message', message: { ...message, senderName: request.operator!.name } });
    broadcast('operators', { type: 'message', conversationId: id, message: { ...message, senderName: request.operator!.name } });
    return message;
  });

  app.patch('/conversations/:id/messages/:messageId', { preHandler: requireOperator }, async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    const parsed = editMessageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректный текст' });

    const [message] = await db.select().from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, id))).limit(1);
    if (!message) return reply.code(404).send({ error: 'Сообщение не найдено' });
    if (message.senderType !== 'operator' || message.senderId !== request.operator!.id) {
      return reply.code(403).send({ error: 'Можно редактировать только свои сообщения' });
    }

    await db.insert(messageRevisions).values({ messageId: message.id, previousBody: message.body });
    const [updated] = await db.update(messages).set({ body: parsed.data.body, edited: true })
      .where(eq(messages.id, messageId)).returning();

    const row = await getConversation(id);
    broadcast(`visitor:${row!.conversation.visitorId}`, { type: 'message_updated', message: updated });
    broadcast('operators', { type: 'message_updated', conversationId: id, message: updated });
    return updated;
  });

  app.post('/conversations/:id/:action', { preHandler: requireOperator }, async (request, reply) => {
    const { id, action } = request.params as { id: string; action: string };
    const row = await getConversation(id);
    if (!row) return reply.code(404).send({ error: 'Диалог не найден' });

    if (action === 'close') {
      const [updated] = await db.update(conversations).set({ status: 'closed', closedAt: new Date() })
        .where(eq(conversations.id, id)).returning();
      broadcast(`visitor:${row.conversation.visitorId}`, { type: 'conversation_closed' });
      return updated;
    }

    if (action === 'reopen') {
      return db.update(conversations).set({ status: 'active', closedAt: null })
        .where(eq(conversations.id, id)).returning();
    }

    if (action === 'assign') {
      const parsed = z.object({ assigneeId: z.string().uuid() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Неверный оператор' });
      return db.update(conversations).set({ assigneeId: parsed.data.assigneeId })
        .where(eq(conversations.id, id)).returning();
    }

    return reply.code(400).send({ error: 'Неизвестное действие' });
  });

  app.post('/conversations/:id/notes', { preHandler: requireOperator }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = noteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная заметка' });

    const row = await getConversation(id);
    if (!row) return reply.code(404).send({ error: 'Диалог не найден' });

    return db.insert(notes).values({
      conversationId: id,
      authorId: request.operator!.id,
      body: parsed.data.body
    }).returning();
  });
}

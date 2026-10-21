import { db } from './db.js';
import { conversations, messages } from './schema.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { normalizeText } from './utils.js';

export async function getVisitorConversation(siteId: string, visitorId: string) {
  const [conversation] = await db.select().from(conversations)
    .where(and(eq(conversations.siteId, siteId), eq(conversations.visitorId, visitorId)))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  if (conversation) return conversation;
  const [created] = await db.insert(conversations).values({ siteId, visitorId }).returning();
  return created;
}

export async function createMessage(input: {
  conversationId: string;
  senderType: 'visitor' | 'operator' | 'system';
  senderId?: string | null;
  body: string;
  clientId?: string | null;
}) {
  const body = normalizeText(input.body);
  if (!body) throw new Error('Пустое сообщение');

  try {
    const [message] = await db.insert(messages).values({
      conversationId: input.conversationId,
      senderType: input.senderType,
      senderId: input.senderId ?? null,
      body,
      clientId: input.clientId ?? null
    }).returning();

    await db.update(conversations).set({
      lastActivityAt: new Date(),
      status: input.senderType === 'visitor' ? 'active' : sql`${conversations.status}`
    }).where(eq(conversations.id, input.conversationId));

    return message;
  } catch (error: any) {
    if (error?.code === '23505') {
      const [existing] = await db.select().from(messages)
        .where(and(eq(messages.conversationId, input.conversationId), eq(messages.clientId, input.clientId!)))
        .limit(1);
      return existing;
    }
    throw error;
  }
}

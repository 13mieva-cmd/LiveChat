import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { quickReplies } from '../schema.js';
import { requireOperator } from '../auth.js';
import { quickReplySchema } from '../validation.js';
import { eq, isNull, or } from 'drizzle-orm';

export async function quickReplyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/quick-replies', { preHandler: requireOperator }, async (request) => {
    const { siteId } = request.query as { siteId?: string };
    return db.select().from(quickReplies)
      .where(siteId ? or(eq(quickReplies.siteId, siteId), isNull(quickReplies.siteId)) : undefined)
      .orderBy(quickReplies.category, quickReplies.title);
  });

  app.post('/quick-replies', { preHandler: requireOperator }, async (request, reply) => {
    const parsed = quickReplySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Проверьте шаблон', details: parsed.error.flatten() });
    return db.insert(quickReplies).values(parsed.data).returning();
  });

  app.patch('/quick-replies/:id', { preHandler: requireOperator }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = quickReplySchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Проверьте шаблон' });

    const [item] = await db.update(quickReplies).set(parsed.data).where(eq(quickReplies.id, id)).returning();
    if (!item) return reply.code(404).send({ error: 'Шаблон не найден' });
    return item;
  });

  app.delete('/quick-replies/:id', { preHandler: requireOperator }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [item] = await db.delete(quickReplies).where(eq(quickReplies.id, id)).returning();
    if (!item) return reply.code(404).send({ error: 'Шаблон не найден' });
    return { ok: true };
  });
}

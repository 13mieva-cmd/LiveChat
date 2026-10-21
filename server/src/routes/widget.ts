import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { conversations, messages, sites, visitors } from '../schema.js';
import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getVisitorConversation } from '../chat-service.js';
import { lookupGeo } from '../geo.js';

function publicSite(site: typeof sites.$inferSelect) {
  return {
    id: site.id,
    name: site.name,
    color: site.color,
    logoUrl: site.logoUrl,
    headerTitle: site.headerTitle,
    greeting: site.greeting,
    position: site.position,
    offsetX: site.offsetX,
    offsetY: site.offsetY,
    quickButtons: site.quickButtons,
    offlineMessage: site.offlineMessage,
    soundEnabled: site.soundEnabled,
    mobileBehavior: site.mobileBehavior,
    hiddenPages: site.hiddenPages,
    autoInviteEnabled: site.autoInviteEnabled,
    autoInviteDelaySeconds: site.autoInviteDelaySeconds,
    draftPreviewEnabled: site.draftPreviewEnabled
  };
}

export async function widgetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/widget/config', async (request, reply) => {
    const { key } = request.query as { key?: string };
    if (!key) return reply.code(400).send({ error: 'Не указан ключ сайта' });

    const [site] = await db.select().from(sites).where(eq(sites.publicKey, key)).limit(1);
    if (!site) return reply.code(404).send({ error: 'Сайт не найден' });
    return publicSite(site);
  });

  app.post('/widget/init', async (request, reply) => {
    const schema = z.object({
      siteKey: z.string().min(6).max(64),
      visitorToken: z.string().min(16).max(64).optional(),
      pageUrl: z.string().url().max(2000),
      referrer: z.string().url().max(2000).nullable().optional(),
      utm: z.record(z.string().max(200)).optional()
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректные данные' });

    const [site] = await db.select().from(sites).where(eq(sites.publicKey, parsed.data.siteKey)).limit(1);
    if (!site) return reply.code(404).send({ error: 'Сайт не найден' });

    const origin = request.headers.origin ?? '';
    const allowedHost = site.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (origin && !origin.includes(allowedHost)) {
      return reply.code(403).send({ error: 'Домен не разрешён' });
    }

    const token = parsed.data.visitorToken ?? nanoid(32);
    const geo = await lookupGeo(request.ip);

    let [visitor] = await db.select().from(visitors)
      .where(and(eq(visitors.siteId, site.id), eq(visitors.token, token)))
      .limit(1);

    if (!visitor) {
      [visitor] = await db.insert(visitors).values({
        siteId: site.id,
        token,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
        city: geo.city,
        country: geo.country,
        referrer: parsed.data.referrer ?? null,
        landingUrl: parsed.data.pageUrl,
        utm: parsed.data.utm ?? {}
      }).returning();
    }

    const conversation = await getVisitorConversation(site.id, visitor.id);
    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt));

    return {
      visitorToken: token,
      visitorId: visitor.id,
      conversationId: conversation.id,
      site: publicSite(site),
      messages: history
    };
  });
}

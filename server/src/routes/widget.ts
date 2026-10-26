import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, sql } from '../db.js';
import { conversations, messages, sites, visitors } from '../schema.js';
import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getVisitorConversation } from '../chat-service.js';
import { lookupGeo } from '../geo.js';
import { defaultWorkingHours, getAvailability } from '../schedule.js';

function allowed(origin: string | undefined, domain: string): boolean {
  try {
    if (!origin || origin === 'null') return false;
    const actual = new URL(origin);
    const expected = new URL(domain.includes('://') ? domain : 'https://' + domain);
    return ['http:', 'https:'].includes(actual.protocol) && actual.hostname === expected.hostname && (!domain.includes('://') || actual.origin === expected.origin);
  } catch { return false; }
}
function publicSite(site: typeof sites.$inferSelect) {
  const {id,name,color,logoUrl,headerTitle,greeting,position,offsetX,offsetY,quickButtons,offlineMessage,soundEnabled,mobileBehavior,hiddenPages,autoInviteEnabled,autoInviteDelaySeconds} = site;
  const availability = getAvailability(site.workingHours, site.timezone, offlineMessage);
  return {id,name,color,logoUrl,headerTitle,greeting,position,offsetX,offsetY,quickButtons,offlineMessage,soundEnabled,mobileBehavior,hiddenPages,autoInviteEnabled:autoInviteEnabled&&availability.open,autoInviteDelaySeconds,availability,draftPreviewEnabled:false};
}
const initSchema = z.object({
  siteKey:z.string().min(6).max(64),
  visitorToken:z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  pageUrl:z.string().url().max(2000),
  referrer:z.string().url().max(2000).nullable().optional(),
  utm:z.record(z.string().max(200)).refine(v=>Object.keys(v).length<=20).optional()
});
export async function widgetRoutes(app: FastifyInstance): Promise<void> {
  await sql`UPDATE sites SET working_hours=${JSON.stringify(defaultWorkingHours)}::text::jsonb WHERE working_hours='{}'::jsonb`;
  app.get('/widget/config', async (request, reply) => {
    reply.header('Cache-Control','no-store');
    const parsed=z.object({key:z.string().min(6).max(64)}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'Не указан корректный ключ сайта'});
    const [site]=await db.select().from(sites).where(eq(sites.publicKey,parsed.data.key)).limit(1);
    if(!site)return reply.code(404).send({error:'Сайт не найден'});
    if(!allowed(request.headers.origin,site.domain))return reply.code(403).send({error:'Домен не разрешён'});
    return publicSite(site);
  });
  app.post('/widget/init', async (request, reply) => {
    reply.header('Cache-Control','no-store');
    const parsed=initSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Некорректные данные'});
    const data=parsed.data;
    const [site]=await db.select().from(sites).where(eq(sites.publicKey,data.siteKey)).limit(1);
    if(!site)return reply.code(404).send({error:'Сайт не найден'});
    if(!allowed(request.headers.origin,site.domain))return reply.code(403).send({error:'Домен не разрешён'});
    const page=new URL(data.pageUrl);
    if(!allowed(page.origin,site.domain)||page.origin!==request.headers.origin||page.username||page.password)return reply.code(403).send({error:'Адрес страницы не соответствует разрешённому домену'});
    page.hash='';
    let [visitor]=data.visitorToken?await db.select().from(visitors).where(and(eq(visitors.siteId,site.id),eq(visitors.token,data.visitorToken))).limit(1):[];
    if(!visitor){
      const geo=await lookupGeo(request.ip);
      [visitor]=await db.insert(visitors).values({siteId:site.id,token:nanoid(32),ip:request.ip,userAgent:(request.headers['user-agent']??'').slice(0,1000),city:geo.city,country:geo.country,referrer:data.referrer??null,landingUrl:page.href,utm:data.utm??{}}).returning();
    }
    const conversation=await getVisitorConversation(site.id,visitor.id);
    await db.update(conversations).set({currentPage:page.href,lastActivityAt:new Date()}).where(and(eq(conversations.id,conversation.id),eq(conversations.visitorId,visitor.id),eq(conversations.siteId,site.id)));
    const history=await db.select().from(messages).where(eq(messages.conversationId,conversation.id)).orderBy(asc(messages.createdAt));
    return {visitorToken:visitor.token,visitorId:visitor.id,conversationId:conversation.id,site:publicSite(site),messages:history};
  });
}

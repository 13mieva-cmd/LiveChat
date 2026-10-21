import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { sites } from '../schema.js';
import { requireOperator } from '../auth.js';
import { siteSchema } from '../validation.js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { updateDraftSite } from '../ws.js';

export async function siteRoutes(app:FastifyInstance):Promise<void>{
  app.get('/sites',{preHandler:requireOperator},async()=>db.select().from(sites).orderBy(sites.createdAt));
  app.post('/sites',{preHandler:requireOperator},async(request,reply)=>{
    const parsed=siteSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Проверьте данные сайта',details:parsed.error.flatten()});
    return db.insert(sites).values({...parsed.data,publicKey:nanoid(16)}).returning();
  });
  app.patch('/sites/:id',{preHandler:requireOperator},async(request,reply)=>{
    const {id}=request.params as {id:string};
    if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Некорректный идентификатор сайта'});
    const parsed=siteSchema.partial().safeParse(request.body);
    if(!parsed.success||!Object.keys(parsed.data).length)return reply.code(400).send({error:'Проверьте данные сайта'});
    if(parsed.data.draftPreviewEnabled===false)updateDraftSite(id,false);
    const [site]=await db.update(sites).set(parsed.data).where(eq(sites.id,id)).returning();
    if(!site)return reply.code(404).send({error:'Сайт не найден'});
    updateDraftSite(id,site.draftPreviewEnabled);return site;
  });
  app.delete('/sites/:id',{preHandler:requireOperator},async(request,reply)=>{
    const {id}=request.params as {id:string};
    if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Некорректный идентификатор сайта'});
    updateDraftSite(id,false);
    const [site]=await db.delete(sites).where(eq(sites.id,id)).returning();
    if(!site)return reply.code(404).send({error:'Сайт не найден'});return {ok:true};
  });
}

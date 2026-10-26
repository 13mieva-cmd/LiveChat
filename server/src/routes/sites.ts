import type { FastifyInstance } from 'fastify';
import { db, sql as databaseSql } from '../db.js';
import { sites } from '../schema.js';
import { requireOperator } from '../auth.js';
import { siteSchema } from '../validation.js';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { updateDraftSite } from '../ws.js';

const editableSite=siteSchema.extend({launcherLabel:z.string().trim().min(1).max(60).default('Написать нам')});
function allowed(origin:string|undefined,domain:string){try{if(!origin||origin==='null')return false;const a=new URL(origin),b=new URL(domain.includes('://')?domain:'https://'+domain);return ['http:','https:'].includes(a.protocol)&&a.hostname===b.hostname&&(!domain.includes('://')||a.origin===b.origin);}catch{return false;}}
export async function siteRoutes(app:FastifyInstance):Promise<void>{
  await databaseSql`CREATE TABLE IF NOT EXISTS lc_widget_texts (site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE, launcher_label text NOT NULL DEFAULT 'Написать нам' CHECK(length(launcher_label) BETWEEN 1 AND 60))`;
  app.get('/sites',{preHandler:requireOperator},async()=>{const rows=await db.select().from(sites).orderBy(sites.createdAt);const texts=await databaseSql`SELECT site_id,launcher_label FROM lc_widget_texts`;const map=new Map(texts.map(row=>[row.site_id,row.launcher_label]));return rows.map(site=>({...site,launcherLabel:map.get(site.id)||'Написать нам'}));});
  app.get('/widget/launcher',async(request,reply)=>{reply.header('Cache-Control','no-store');const parsed=z.object({key:z.string().min(6).max(64)}).safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:'Некорректный ключ сайта'});const [site]=await db.select().from(sites).where(eq(sites.publicKey,parsed.data.key)).limit(1);if(!site)return reply.code(404).send({error:'Сайт не найден'});if(!allowed(request.headers.origin,site.domain))return reply.code(403).send({error:'Домен не разрешён'});const [text]=await databaseSql`SELECT launcher_label FROM lc_widget_texts WHERE site_id=${site.id}`;return {launcherLabel:text?.launcher_label||'Написать нам'};});
  app.post('/sites',{preHandler:requireOperator},async(request,reply)=>{
    const parsed=editableSite.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Проверьте данные сайта',details:parsed.error.flatten()});
    const {launcherLabel,...data}=parsed.data;
    return db.transaction(async tx=>{const [site]=await tx.insert(sites).values({...data,publicKey:nanoid(16)}).returning();await tx.execute(sql`INSERT INTO lc_widget_texts(site_id,launcher_label) VALUES(${site.id},${launcherLabel})`);return [{...site,launcherLabel}];});
  });
  app.patch('/sites/:id',{preHandler:requireOperator},async(request,reply)=>{
    const {id}=request.params as {id:string};
    if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Некорректный идентификатор сайта'});
    const parsed=editableSite.partial().safeParse(request.body);
    if(!parsed.success||!Object.keys(parsed.data).length)return reply.code(400).send({error:'Проверьте данные сайта'});
    if(parsed.data.draftPreviewEnabled===false)updateDraftSite(id,false);
    const {launcherLabel,...data}=parsed.data;
    const site=await db.transaction(async tx=>{const [saved]=Object.keys(data).length?await tx.update(sites).set(data).where(eq(sites.id,id)).returning():await tx.select().from(sites).where(eq(sites.id,id)).limit(1);if(!saved)return null;if(launcherLabel!==undefined)await tx.execute(sql`INSERT INTO lc_widget_texts(site_id,launcher_label) VALUES(${id},${launcherLabel}) ON CONFLICT(site_id) DO UPDATE SET launcher_label=excluded.launcher_label`);return saved;});
    if(!site)return reply.code(404).send({error:'Сайт не найден'});
    const [text]=await databaseSql`SELECT launcher_label FROM lc_widget_texts WHERE site_id=${id}`;updateDraftSite(id,site.draftPreviewEnabled);return {...site,launcherLabel:text?.launcher_label||'Написать нам'};
  });
  app.delete('/sites/:id',{preHandler:requireOperator},async(request,reply)=>{
    const {id}=request.params as {id:string};
    if(!z.string().uuid().safeParse(id).success)return reply.code(400).send({error:'Некорректный идентификатор сайта'});
    updateDraftSite(id,false);
    const [site]=await db.delete(sites).where(eq(sites.id,id)).returning();
    if(!site)return reply.code(404).send({error:'Сайт не найден'});return {ok:true};
  });
}

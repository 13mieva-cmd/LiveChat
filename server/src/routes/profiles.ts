import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db.js';
import { sites, visitors } from '../schema.js';
import { broadcast } from '../ws.js';

const credentials=z.object({siteKey:z.string().min(6).max(64),visitorToken:z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)});
const contact=credentials.extend({name:z.string().trim().max(80,'Имя — до 80 символов').refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'Имя содержит недопустимые символы').default(''),phone:z.string().trim().max(32,'Телефон — до 32 символов').refine(v=>!v||(/^[+0-9() .-]+$/.test(v)&&v.replace(/\D/g,'').length>=7&&v.replace(/\D/g,'').length<=15),'Укажите телефон: от 7 до 15 цифр, можно с +, пробелами и скобками').default('')});
function allowed(origin:string|undefined,domain:string){try{if(!origin||origin==='null')return false;const a=new URL(origin),b=new URL(domain.includes('://')?domain:'https://'+domain);return ['http:','https:'].includes(a.protocol)&&a.hostname===b.hostname&&(!domain.includes('://')||a.origin===b.origin);}catch{return false;}}
async function findVisitor(data:z.infer<typeof credentials>,origin:string|undefined){const [site]=await db.select().from(sites).where(eq(sites.publicKey,data.siteKey)).limit(1);if(!site||!allowed(origin,site.domain))return null;const [visitor]=await db.select().from(visitors).where(and(eq(visitors.siteId,site.id),eq(visitors.token,data.visitorToken))).limit(1);return visitor??null;}
export async function profileRoutes(app:FastifyInstance):Promise<void>{
  await sql`CREATE TABLE IF NOT EXISTS lc_visitor_profiles (visitor_id uuid PRIMARY KEY REFERENCES visitors(id) ON DELETE CASCADE, name text NOT NULL DEFAULT '' CHECK(length(name)<=80), phone text NOT NULL DEFAULT '' CHECK(length(phone)<=32), updated_at timestamptz NOT NULL DEFAULT now())`;
  app.post('/widget/profile/read',async(request,reply)=>{reply.header('Cache-Control','no-store');const parsed=credentials.safeParse(request.body);if(!parsed.success)return reply.code(403).send({error:'Дождитесь подключения чата'});const visitor=await findVisitor(parsed.data,request.headers.origin);if(!visitor)return reply.code(403).send({error:'Нет доступа к контактам'});const [profile]=await sql`SELECT name,phone FROM lc_visitor_profiles WHERE visitor_id=${visitor.id}`;return {name:profile?.name||'',phone:profile?.phone||''};});
  app.post('/widget/profile',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(request,reply)=>{reply.header('Cache-Control','no-store');const parsed=contact.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:parsed.error.issues[0]?.message||'Проверьте имя и телефон'});const visitor=await findVisitor(parsed.data,request.headers.origin);if(!visitor)return reply.code(403).send({error:'Нет доступа к контактам'});await sql`INSERT INTO lc_visitor_profiles(visitor_id,name,phone) VALUES(${visitor.id},${parsed.data.name},${parsed.data.phone}) ON CONFLICT(visitor_id) DO UPDATE SET name=excluded.name,phone=excluded.phone,updated_at=now()`;broadcast('operators',{type:'visitor_updated',visitorId:visitor.id});return {name:parsed.data.name,phone:parsed.data.phone};});
}

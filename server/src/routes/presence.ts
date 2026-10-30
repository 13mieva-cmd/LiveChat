import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db.js';
import { sites, visitors } from '../schema.js';
import { requireOperator } from '../auth.js';

const beat=z.object({siteKey:z.string().min(6).max(64),visitorToken:z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),tabId:z.string().uuid(),seq:z.number().int().min(1).max(2147483647),state:z.enum(['visible','hidden','left']),url:z.string().url().max(2000),title:z.string().max(160)});
function allowed(origin:string|undefined,domain:string){try{if(!origin||origin==='null')return false;const a=new URL(origin),b=new URL(domain.includes('://')?domain:'https://'+domain);return ['http:','https:'].includes(a.protocol)&&a.hostname===b.hostname&&(!domain.includes('://')||a.origin===b.origin);}catch{return false;}}
export async function presenceRoutes(app:FastifyInstance):Promise<void>{
  await sql`CREATE TABLE IF NOT EXISTS lc_presence_tabs(visitor_id uuid NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,tab_id uuid NOT NULL,seq integer NOT NULL,state text NOT NULL CHECK(state IN ('visible','hidden','left')),url text NOT NULL,title text NOT NULL DEFAULT '',last_seen timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(visitor_id,tab_id))`;
  await sql`CREATE INDEX IF NOT EXISTS lc_presence_seen_idx ON lc_presence_tabs(last_seen)`;
  const clean=setInterval(()=>{void sql`DELETE FROM lc_presence_tabs WHERE last_seen<now()-interval '7 days'`.catch(error=>app.log.error(error,'presence cleanup'));},3600000);clean.unref();
  app.addHook('onClose',async()=>{clearInterval(clean);});
  app.post('/widget/presence',{bodyLimit:5000,config:{rateLimit:{max:120,timeWindow:'1 minute'}}},async(request,reply)=>{
    reply.header('Cache-Control','no-store');let body=request.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{return reply.code(400).send({error:'Invalid JSON'});}}
    const parsed=beat.safeParse(body);if(!parsed.success)return reply.code(400).send({error:'Invalid presence'});const d=parsed.data;
    const [site]=await db.select().from(sites).where(eq(sites.publicKey,d.siteKey)).limit(1);if(!site||!allowed(request.headers.origin,site.domain))return reply.code(403).send({error:'Access denied'});
    const page=new URL(d.url);if(page.origin!==request.headers.origin||page.username||page.password)return reply.code(403).send({error:'Invalid page origin'});page.search='';page.hash='';
    const [visitor]=await db.select({id:visitors.id}).from(visitors).where(and(eq(visitors.siteId,site.id),eq(visitors.token,d.visitorToken))).limit(1);if(!visitor)return reply.code(403).send({error:'Access denied'});
    const title=d.title.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
    await sql`INSERT INTO lc_presence_tabs(visitor_id,tab_id,seq,state,url,title) VALUES(${visitor.id},${d.tabId},${d.seq},${d.state},${page.href},${title}) ON CONFLICT(visitor_id,tab_id) DO UPDATE SET seq=excluded.seq,state=excluded.state,url=excluded.url,title=excluded.title,last_seen=now() WHERE excluded.seq>lc_presence_tabs.seq`;
    return {ok:true};
  });
  app.get('/presence',{preHandler:requireOperator},async(request,reply)=>{
    reply.header('Cache-Control','no-store');const parsed=z.object({visitorId:z.string().uuid().optional(),siteId:z.string().uuid().optional()}).safeParse(request.query);if(!parsed.success)return reply.code(400).send({error:'Invalid filter'});const id=parsed.data.visitorId||null,site=parsed.data.siteId||null;
    const rows=await sql`SELECT p.visitor_id,p.tab_id,p.state,p.url,p.title,p.last_seen,s.id AS site_id,s.name AS site_name,coalesce(profile.name,'') AS name,c.id AS conversation_id FROM lc_presence_tabs p JOIN visitors v ON v.id=p.visitor_id JOIN sites s ON s.id=v.site_id LEFT JOIN lc_visitor_profiles profile ON profile.visitor_id=v.id LEFT JOIN LATERAL(SELECT id FROM conversations WHERE visitor_id=v.id ORDER BY created_at DESC LIMIT 1)c ON true WHERE (p.last_seen>now()-interval '60 seconds' OR p.visitor_id=${id}::uuid) AND (${site}::uuid IS NULL OR s.id=${site}::uuid OR p.visitor_id=${id}::uuid) ORDER BY (p.visitor_id IS NOT DISTINCT FROM ${id}::uuid) DESC,p.last_seen DESC LIMIT 1000`;
    const groups=new Map<string,any[]>();for(const row of rows){const list=groups.get(row.visitor_id)||[];list.push(row);groups.set(row.visitor_id,list);}const now=Date.now();const result=[];
    for(const [visitorId,tabs] of groups){const active=tabs.filter(t=>now-new Date(t.last_seen).getTime()<(t.state==='left'?12000:60000));const best=active.find(t=>t.state==='visible')||active.find(t=>t.state==='hidden')||active[0]||tabs[0];const state=!active.length?'offline':best.state==='visible'?'online':best.state==='hidden'?'hidden':'reconnecting';result.push({visitorId,siteId:best.site_id,siteName:best.site_name,name:best.name,conversationId:best.conversation_id,state,url:best.url,title:best.title,lastSeen:new Date(tabs[0].last_seen).toISOString(),updatedAt:new Date(best.last_seen).toISOString(),tabs:active.filter(t=>t.state!=='left').map(t=>({url:t.url,title:t.title,visible:t.state==='visible'}))});}
    return {at:new Date(now).toISOString(),visitors:result};
  });
}

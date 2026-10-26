import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { env } from './env.js';
import { requireOperator } from './auth.js';

let ready=false,publicKey='',busy=false;
const encryptionKey=createHash('sha256').update('livechat-push:'+env.jwtSecret).digest();
function seal(text:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',encryptionKey,iv);const data=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
function unseal(text:string){const data=Buffer.from(text,'base64'),d=createDecipheriv('aes-256-gcm',encryptionKey,data.subarray(0,12));d.setAuthTag(data.subarray(12,28));return Buffer.concat([d.update(data.subarray(28)),d.final()]).toString('utf8');}
function allowedEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname);}catch{return false;}}
const endpoint=z.string().max(2048).refine(allowedEndpoint);
const subscription=z.object({endpoint,keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})});
async function initialize(){
  await sql`CREATE TABLE IF NOT EXISTS lc_push_keys (id integer PRIMARY KEY CHECK(id=1), public_key text NOT NULL, private_key_encrypted text NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS lc_push_subscriptions (endpoint text PRIMARY KEY, user_id text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS lc_push_jobs (id bigserial PRIMARY KEY, endpoint text NOT NULL REFERENCES lc_push_subscriptions(endpoint) ON DELETE CASCADE, message_id text NOT NULL, site_name text NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(endpoint,message_id))`;
  await sql`CREATE INDEX IF NOT EXISTS lc_push_jobs_due ON lc_push_jobs(next_attempt)`;
  const keys=webpush.generateVAPIDKeys();
  await sql`INSERT INTO lc_push_keys(id,public_key,private_key_encrypted) VALUES(1,${keys.publicKey},${seal(keys.privateKey)}) ON CONFLICT(id) DO NOTHING`;
  const [stored]=await sql`SELECT public_key,private_key_encrypted FROM lc_push_keys WHERE id=1`;
  webpush.setVapidDetails(new URL(env.publicUrl).origin,stored.public_key,unseal(stored.private_key_encrypted));publicKey=stored.public_key;ready=true;
}
function payload(site:string,test=false){return JSON.stringify({title:test?'LiveChat · Проверка':'LiveChat · '+site.slice(0,80),body:test?'Уведомления подключены':'Новое сообщение от посетителя',url:'/assets/operator.html'});}
async function deliver(row:any,test=false){return webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},payload(row.site_name||'',test),{TTL:3600,urgency:'high',timeout:10000});}
export async function enqueueVisitorPush(messageId:string,conversationId:string){
  if(!ready)return;
  try{await sql`INSERT INTO lc_push_jobs(endpoint,message_id,site_name) SELECT p.endpoint,${messageId},s.name FROM lc_push_subscriptions p JOIN users u ON u.id::text=p.user_id CROSS JOIN conversations c JOIN sites s ON s.id=c.site_id WHERE c.id=${conversationId} ON CONFLICT(endpoint,message_id) DO NOTHING`;}catch{console.error('Не удалось поставить push в очередь');}
}
async function drain(){
  if(!ready||busy)return;busy=true;
  try{
    await sql`DELETE FROM lc_push_jobs WHERE created_at<now()-interval '24 hours' OR attempts>=8`;
    for(let n=0;n<10;n++){
      const [job]=await sql`WITH candidate AS (SELECT id FROM lc_push_jobs WHERE next_attempt<=now() AND attempts<8 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE lc_push_jobs j SET next_attempt=now()+interval '60 seconds',attempts=j.attempts+1 FROM candidate c WHERE j.id=c.id RETURNING j.*`;
      if(!job)break;
      const [sub]=await sql`SELECT p.* FROM lc_push_subscriptions p JOIN users u ON u.id::text=p.user_id WHERE p.endpoint=${job.endpoint}`;
      if(!sub){await sql`DELETE FROM lc_push_jobs WHERE id=${job.id}`;continue;}
      try{await deliver({...sub,site_name:job.site_name});await sql`DELETE FROM lc_push_jobs WHERE id=${job.id}`;}catch(error:any){if(error.statusCode===404||error.statusCode===410)await sql`DELETE FROM lc_push_subscriptions WHERE endpoint=${job.endpoint}`;else await sql`UPDATE lc_push_jobs SET next_attempt=now()+${Math.min(3600,15*2**Number(job.attempts))}*interval '1 second' WHERE id=${job.id}`;}
    }
  }catch{console.error('Ошибка обработки очереди push');}finally{busy=false;}
}
export async function pushRoutes(app:FastifyInstance){
  try{await initialize();}catch{app.log.error('Web Push отключён: проверьте базу, PUBLIC_URL и неизменность JWT_SECRET');}
  const timer=setInterval(()=>void drain(),2000);timer.unref();app.addHook('onClose',async()=>{clearInterval(timer);});
  app.get('/push/config',{preHandler:requireOperator},async()=>({enabled:ready,publicKey:ready?publicKey:null}));
  app.post('/push/subscriptions',{preHandler:requireOperator},async(req,reply)=>{
    if(!ready)return reply.code(503).send({error:'Push временно недоступен'});
    const parsed=subscription.safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Некорректная подписка'});
    const p=parsed.data;const rows=await sql`INSERT INTO lc_push_subscriptions(endpoint,user_id,p256dh,auth) VALUES(${p.endpoint},${req.operator!.id},${p.keys.p256dh},${p.keys.auth}) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now() WHERE lc_push_subscriptions.user_id=excluded.user_id RETURNING endpoint`;
    if(!rows.length)return reply.code(409).send({error:'Это устройство подписано на другой аккаунт. Отключите прежнюю подписку.'});return {ok:true};
  });
  app.delete('/push/subscriptions',{preHandler:requireOperator},async(req,reply)=>{const parsed=z.object({endpoint}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Некорректная подписка'});await sql`DELETE FROM lc_push_subscriptions WHERE endpoint=${parsed.data.endpoint} AND user_id=${req.operator!.id}`;return {ok:true};});
  app.post('/push/test',{preHandler:requireOperator,config:{rateLimit:{max:3,timeWindow:'1 minute'}}},async(req,reply)=>{
    if(!ready)return reply.code(503).send({error:'Push временно недоступен'});const parsed=z.object({endpoint}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Некорректная подписка'});
    const [sub]=await sql`SELECT * FROM lc_push_subscriptions WHERE endpoint=${parsed.data.endpoint} AND user_id=${req.operator!.id}`;if(!sub)return reply.code(404).send({error:'Сначала включите уведомления'});
    try{await deliver(sub,true);return {ok:true};}catch(error:any){if(error.statusCode===404||error.statusCode===410)await sql`DELETE FROM lc_push_subscriptions WHERE endpoint=${sub.endpoint}`;return reply.code(502).send({error:'Не удалось отправить push. Переподключите уведомления.'});}
  });
}

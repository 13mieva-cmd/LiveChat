import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db.js';
import { conversations, sites, visitors } from '../schema.js';
import { requireOperator } from '../auth.js';
import { getVisitorConversation } from '../chat-service.js';
import { enqueueVisitorPush } from '../push.js';
import { broadcast } from '../ws.js';

const maxBytes=1024*1024;
const configuredQuota=Number(process.env.PHOTO_STORAGE_MB??200);
const quotaBytes=(Number.isInteger(configuredQuota)&&configuredQuota>=10&&configuredQuota<=2048?configuredQuota:200)*maxBytes;
const upload=z.object({clientId:z.string().uuid(),data:z.string().min(4).max(1400000).regex(/^[A-Za-z0-9+/]+={0,2}$/)});
const visitorCredentials=z.object({siteKey:z.string().min(6).max(64),visitorToken:z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)});
type Actor={conversationId:string;visitorId:string;senderType:'visitor'|'operator';senderId:string|null;senderName?:string};
function problem(statusCode:number,message:string):Error & {statusCode:number}{return Object.assign(new Error(message),{statusCode});}
function allowed(origin:string|undefined,domain:string){try{if(!origin||origin==='null')return false;const a=new URL(origin),b=new URL(domain.includes('://')?domain:'https://'+domain);return ['http:','https:'].includes(a.protocol)&&a.hostname===b.hostname&&(!domain.includes('://')||a.origin===b.origin);}catch{return false;}}
async function visitorAccess(credentials:unknown,origin:string|undefined){const parsed=visitorCredentials.safeParse(credentials);if(!parsed.success)throw problem(403,'Нет доступа к переписке');const [site]=await db.select().from(sites).where(eq(sites.publicKey,parsed.data.siteKey)).limit(1);if(!site||!allowed(origin,site.domain))throw problem(403,'Нет доступа к переписке');const [visitor]=await db.select().from(visitors).where(and(eq(visitors.siteId,site.id),eq(visitors.token,parsed.data.visitorToken))).limit(1);if(!visitor)throw problem(403,'Нет доступа к переписке');return {site,visitor};}
async function normalizeImage(data:string){if(data.length%4)throw problem(400,'Повреждённое изображение');const buffer=Buffer.from(data,'base64');if(!buffer.length||buffer.length>maxBytes)throw problem(413,'После сжатия изображение должно быть не больше 1 МБ');try{const image=sharp(buffer,{limitInputPixels:20000000,animated:false}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw problem(415,'Поддерживаются только статичные JPEG, PNG и WebP');const output=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer();if(output.length>maxBytes)throw problem(413,'Фото слишком большое. Уменьшите изображение.');return output;}catch(error:any){if(error.statusCode)throw error;throw problem(415,'Не удалось прочитать изображение. Используйте JPEG, PNG или WebP.');}}
async function storePhoto(actor:Actor,body:unknown){const parsed=upload.safeParse(body);if(!parsed.success)throw problem(400,'Некорректное изображение');const bytes=await normalizeImage(parsed.data.data);
  const result=await sql.begin(async tx=>{
    await tx`SELECT pg_advisory_xact_lock(734210)`;
    const [existing]=await tx`SELECT id,conversation_id AS "conversationId",sender_type AS "senderType",sender_id AS "senderId",body,client_id AS "clientId",status,edited,created_at AS "createdAt" FROM messages WHERE conversation_id=${actor.conversationId} AND client_id=${parsed.data.clientId} LIMIT 1`;
    if(existing){if(existing.senderType!==actor.senderType||existing.senderId!==actor.senderId)throw problem(409,'Идентификатор отправки уже занят');const [photo]=await tx`SELECT message_id FROM lc_chat_photos WHERE message_id=${existing.id} AND expires_at>now()`;if(!photo)throw problem(409,'Эта отправка уже существует или срок хранения фото истёк');return {message:existing,created:false};}
    await tx`DELETE FROM lc_chat_photos WHERE expires_at<=now()`;
    const [usage]=await tx`SELECT coalesce(sum(octet_length(bytes)),0)::bigint AS size FROM lc_chat_photos`;if(Number(usage.size)+bytes.length>quotaBytes)throw problem(507,'Хранилище фото заполнено. Отправьте текст или используйте мессенджер.');
    const [recent]=actor.senderType==='visitor'?await tx`SELECT count(*)::int AS count FROM lc_chat_photos p JOIN messages m ON m.id=p.message_id WHERE m.conversation_id=${actor.conversationId} AND m.sender_type='visitor' AND p.created_at>now()-interval '1 hour'`:await tx`SELECT count(*)::int AS count FROM lc_chat_photos p JOIN messages m ON m.id=p.message_id WHERE m.sender_id=${actor.senderId} AND p.created_at>now()-interval '1 hour'`;
    if(Number(recent.count)>=(actor.senderType==='visitor'?10:50))throw problem(429,'Слишком много фотографий. Повторите позже.');
    const id=randomUUID(),text='📷 Фото [photo:'+id+']';
    const [message]=await tx`INSERT INTO messages(id,conversation_id,sender_type,sender_id,body,client_id) VALUES(${id},${actor.conversationId},${actor.senderType},${actor.senderId},${text},${parsed.data.clientId}) RETURNING id,conversation_id AS "conversationId",sender_type AS "senderType",sender_id AS "senderId",body,client_id AS "clientId",status,edited,created_at AS "createdAt"`;
    await tx`INSERT INTO lc_chat_photos(message_id,bytes,expires_at) VALUES(${id},${bytes},now()+interval '30 days')`;
    if(actor.senderType==='visitor')await tx`UPDATE conversations SET last_activity_at=now(),status='active',closed_at=null WHERE id=${actor.conversationId}`;else await tx`UPDATE conversations SET last_activity_at=now() WHERE id=${actor.conversationId}`;
    return {message,created:true};
  });
  const message={...result.message,...(actor.senderName?{senderName:actor.senderName}:{})};
  if(result.created){if(actor.senderType==='visitor')await enqueueVisitorPush(String(message.id),actor.conversationId);broadcast('visitor:'+actor.visitorId,{type:'message',message});broadcast('operators',{type:'message',conversationId:actor.conversationId,message});}
  return {message};
}
async function sendError(error:any,reply:FastifyReply){if(typeof error.statusCode==='number')return reply.code(error.statusCode).send({error:error.message});throw error;}
export async function photoRoutes(app:FastifyInstance):Promise<void>{
  await sql`CREATE TABLE IF NOT EXISTS lc_chat_photos (message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, bytes bytea NOT NULL CHECK(octet_length(bytes)<=1048576), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS lc_chat_photos_expiry ON lc_chat_photos(expires_at)`;
  const cleanup=async()=>{try{await sql`DELETE FROM lc_chat_photos WHERE expires_at<=now()`;}catch{app.log.error('Не удалось удалить просроченные фотографии');}};await cleanup();const timer=setInterval(()=>void cleanup(),600000);timer.unref();app.addHook('onClose',async()=>{clearInterval(timer);});
  app.post('/widget/photos',{bodyLimit:2*1024*1024,config:{rateLimit:{max:6,timeWindow:'1 minute'}}},async(request,reply)=>{try{const {site,visitor}=await visitorAccess(request.body,request.headers.origin);const conversation=await getVisitorConversation(site.id,visitor.id);return await storePhoto({conversationId:conversation.id,visitorId:visitor.id,senderType:'visitor',senderId:null},request.body);}catch(error){return sendError(error,reply);}});
  app.post('/conversations/:id/photos',{preHandler:requireOperator,bodyLimit:2*1024*1024,config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async(request,reply)=>{try{const parsed=z.object({id:z.string().uuid()}).safeParse(request.params);if(!parsed.success)throw problem(400,'Некорректный диалог');const [conversation]=await db.select().from(conversations).where(eq(conversations.id,parsed.data.id)).limit(1);if(!conversation)throw problem(404,'Диалог не найден');return await storePhoto({conversationId:conversation.id,visitorId:conversation.visitorId,senderType:'operator',senderId:request.operator!.id,senderName:request.operator!.name},request.body);}catch(error){return sendError(error,reply);}});
  app.get('/photos/:id',async(request:FastifyRequest,reply:FastifyReply)=>{
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Cross-Origin-Resource-Policy','cross-origin');
    try{const parsed=z.object({id:z.string().uuid()}).safeParse(request.params);if(!parsed.success)throw problem(404,'Фото не найдено');const key=request.headers['x-livechat-site-key'];let owner:string|null=null,conversationId:string|null=null;
      if(typeof key==='string'){const access=await visitorAccess({siteKey:key,visitorToken:request.headers['x-livechat-visitor-token']},request.headers.origin);owner=access.visitor.id;}else{await requireOperator(request,reply);if(reply.sent)return;const target=z.string().uuid().safeParse(request.headers['x-livechat-conversation-id']);if(!target.success)throw problem(403,'Не указан диалог');conversationId=target.data;}
      const [photo]=await sql`SELECT p.bytes,m.conversation_id,c.visitor_id FROM lc_chat_photos p JOIN messages m ON m.id=p.message_id JOIN conversations c ON c.id=m.conversation_id WHERE p.message_id=${parsed.data.id} AND p.expires_at>now() LIMIT 1`;
      if(!photo||(owner&&photo.visitor_id!==owner)||(conversationId&&photo.conversation_id!==conversationId))throw problem(404,'Фото недоступно или срок хранения истёк');
      return reply.type('image/jpeg').header('Content-Disposition','inline; filename="chat-photo.jpg"').send(photo.bytes);
    }catch(error){return sendError(error,reply);}
  });
}

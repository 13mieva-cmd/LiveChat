import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { db } from './db.js';
import { conversations,messages,sites,visitors,users } from './schema.js';
import { and,eq,desc,inArray } from 'drizzle-orm';
import { verifyOperatorToken, operatorPayloadActive } from './auth.js';
import { createMessage } from './chat-service.js';
import { messageSchema } from './validation.js';
import { env } from './env.js';
import { z } from 'zod';
import { DraftGate } from './draft-gate.js';

const rooms=new Map<string,Set<WebSocket>>();
const visitorConnections=new Map<WebSocket,{siteId:string;visitorId:string;reset:()=>void}>();
const gate=new DraftGate(event=>broadcast('operators',event));
const uuid=z.string().uuid();
const ack=z.object({messageIds:z.array(uuid).min(1).max(100),status:z.enum(['delivered','read'])});
export function broadcast(room:string,payload:unknown):void {
  if((payload as any)?.type==='conversation_closed')for(const entry of visitorConnections.values())if(room==='visitor:'+entry.visitorId)entry.reset();
  const data=JSON.stringify(payload);
  for(const ws of rooms.get(room)??[])if(ws.readyState===WebSocket.OPEN)ws.send(data);
}
export function updateDraftSite(siteId:string,enabled:boolean):void {
  gate.setSiteEnabled(siteId,enabled);
  for(const [ws,entry] of visitorConnections)if(entry.siteId===siteId){if(!enabled)entry.reset();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'draft_policy',enabled}));}
}
function join(room:string,ws:WebSocket):void {if(!rooms.has(room))rooms.set(room,new Set());rooms.get(room)!.add(ws);}
function allowed(origin:string|undefined,domain:string):boolean {try{if(!origin||origin==='null')return false;const a=new URL(origin),b=new URL(domain.includes('://')?domain:'https://'+domain);return ['http:','https:'].includes(a.protocol)&&a.hostname===b.hostname&&(!domain.includes('://')||a.origin===b.origin);}catch{return false;}}
export function setupWs(server:Server):void {
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:32768,perMessageDeflate:false});
  wss.on('connection',(ws,request)=>{
    const sessionId=randomUUID();
    let ready=false,visitorId:string|null=null,operatorId:string|null=null,draftConversation:string|null=null;
    let operatorToken:string|null=null,authTimer:ReturnType<typeof setInterval>|undefined;
    let count=0,resetAt=Date.now()+60000,chain=Promise.resolve();
    const send=(value:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));};
    const reset=()=>{gate.close(sessionId);draftConversation=null;send({type:'draft_consent',allowed:false});};
    const validateOperator=async()=>{
      if(!operatorToken)return false;
      const payload=verifyOperatorToken(operatorToken);
      return !!payload&&await operatorPayloadActive(payload);
    };
    ws.on('error',()=>{});
    ws.on('close',()=>{clearInterval(authTimer);gate.close(sessionId);visitorConnections.delete(ws);for(const [room,sockets] of rooms){sockets.delete(ws);if(!sockets.size)rooms.delete(room);}});
    const authentication=(async()=>{
      const url=new URL(request.url??'/','http://localhost'),token=url.searchParams.get('token');
      if(token){
        const payload=verifyOperatorToken(token);
        if(!payload||!allowed(request.headers.origin,env.publicUrl)||!(await operatorPayloadActive(payload)))return ws.close(4003,'Доступ запрещён');
        const [user]=await db.select().from(users).where(eq(users.id,payload.sub)).limit(1);
        if(!user)return ws.close(4003,'Доступ запрещён');operatorId=user.id;operatorToken=token;
        if(ws.readyState!==WebSocket.OPEN)return;join('operators',ws);
        authTimer=setInterval(()=>{void validateOperator().then(active=>{if(!active)ws.close(4003,'Сессия завершена');}).catch(()=>ws.close(1011,'Ошибка проверки сессии'));},60000);
        authTimer.unref();
      }else{
        const key=url.searchParams.get('siteKey'),token=url.searchParams.get('visitorToken');
        if(!key||!token||key.length>64||token.length>64)return ws.close(4003,'Доступ запрещён');
        const [site]=await db.select().from(sites).where(eq(sites.publicKey,key)).limit(1);
        if(!site||!allowed(request.headers.origin,site.domain))return ws.close(4003,'Доступ запрещён');
        const [visitor]=await db.select().from(visitors).where(and(eq(visitors.siteId,site.id),eq(visitors.token,token))).limit(1);
        if(!visitor)return ws.close(4003,'Доступ запрещён');visitorId=visitor.id;
        if(ws.readyState!==WebSocket.OPEN)return;join('visitor:'+visitorId,ws);visitorConnections.set(ws,{siteId:site.id,visitorId,reset});
        gate.setSiteEnabled(site.id,site.draftPreviewEnabled);send({type:'draft_policy',enabled:site.draftPreviewEnabled});
      }ready=true;
    })().catch(()=>ws.close(1011,'Ошибка подключения'));
    async function handle(data:any):Promise<void>{
      await authentication;if(!ready||ws.readyState!==WebSocket.OPEN||!data||typeof data!=='object')return;
      if(operatorId&&!(await validateOperator())){ws.close(4003,'Сессия завершена');return;}
      if(data.type==='draft_consent'&&data.allowed===false){reset();return;}
      let conversation;
      if(visitorId)[conversation]=await db.select().from(conversations).where(eq(conversations.visitorId,visitorId)).orderBy(desc(conversations.createdAt)).limit(1);
      else if(operatorId&&uuid.safeParse(data.conversationId).success)[conversation]=await db.select().from(conversations).where(eq(conversations.id,data.conversationId)).limit(1);
      if(!conversation)return;
      if(visitorId&&(data.type==='draft_consent'||data.type==='draft')){
        const [site]=await db.select().from(sites).where(eq(sites.id,conversation.siteId)).limit(1);
        if(ws.readyState!==WebSocket.OPEN)return;
        if(!site?.draftPreviewEnabled||conversation.status==='closed'){reset();return;}
        gate.setSiteEnabled(site.id,true);
        if(data.type==='draft_consent'){
          if(data.allowed!==true)return;
          gate.open(sessionId,site.id,conversation.id);draftConversation=conversation.id;
          send({type:'draft_consent',allowed:gate.consent(sessionId,true)});
        }else{
          if(draftConversation!==conversation.id||!gate.update(sessionId,data.text))send({type:'draft_consent',allowed:false});
        }return;
      }
      if(data.type==='message'){
        const parsed=messageSchema.safeParse(data);if(!parsed.success){send({type:'error',error:'Некорректное сообщение'});return;}
        if(visitorId)gate.clear(sessionId);
        const message=await createMessage({conversationId:conversation.id,senderType:visitorId?'visitor':'operator',senderId:operatorId,body:parsed.data.body,clientId:parsed.data.clientId});
        broadcast('visitor:'+conversation.visitorId,{type:'message',message});broadcast('operators',{type:'message',conversationId:conversation.id,message});return;
      }
      if(data.type==='typing'){const event={type:'typing',conversationId:conversation.id,who:visitorId?'visitor':'operator'};broadcast(visitorId?'operators':'visitor:'+conversation.visitorId,event);return;}
      if(data.type==='ack'){const parsed=ack.safeParse(data);if(!parsed.success)return;
        const affected=await db.update(messages).set({status:parsed.data.status}).where(and(eq(messages.conversationId,conversation.id),eq(messages.senderType,visitorId?'operator':'visitor'),inArray(messages.id,parsed.data.messageIds),inArray(messages.status,parsed.data.status==='read'?['sent','delivered']:['sent']))).returning({id:messages.id});
        const event={type:'status_updated',conversationId:conversation.id,messageIds:affected.map(m=>m.id),status:parsed.data.status};broadcast('visitor:'+conversation.visitorId,event);broadcast('operators',event);
      }
    }
    ws.on('message',raw=>{
      if(Date.now()>=resetAt){count=0;resetAt=Date.now()+60000;}if(++count>240){ws.close(1008,'Слишком много событий');return;}
      let data:unknown;try{data=JSON.parse(raw.toString());}catch{send({type:'error',error:'Некорректный JSON'});return;}
      chain=chain.then(()=>handle(data)).catch(()=>send({type:'error',error:'Не удалось обработать событие'}));
    });
  });
  wss.on('close',()=>gate.dispose());
}

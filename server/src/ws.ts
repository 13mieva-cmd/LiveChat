import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { db } from './db.js';
import { conversations, messages, sites, visitors, users } from './schema.js';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { verifyOperatorToken } from './auth.js';
import { createMessage } from './chat-service.js';
import { messageSchema } from './validation.js';
import { env } from './env.js';
import { z } from 'zod';

const rooms = new Map<string, Set<WebSocket>>();
const idSchema = z.string().uuid();
const ackSchema = z.object({ messageIds: z.array(idSchema).min(1).max(100), status: z.enum(['delivered','read']), conversationId: idSchema.optional() });
export function broadcast(room: string, payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const ws of rooms.get(room) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(text);
}
function join(room: string, ws: WebSocket): void {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
}
function domainMatches(origin: string | undefined, domain: string): boolean {
  try {
    if (!origin || origin === 'null') return false;
    const actual = new URL(origin);
    const expected = new URL(domain.includes('://') ? domain : 'https://' + domain);
    return ['http:','https:'].includes(actual.protocol) && actual.hostname === expected.hostname && (!domain.includes('://') || actual.origin === expected.origin);
  } catch { return false; }
}
export function setupWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32768, perMessageDeflate: false });
  wss.on('connection', (ws, request) => {
    let ready = false, visitorId: string | null = null, operatorId: string | null = null;
    let count = 0, resetAt = Date.now() + 60000, chain = Promise.resolve();
    const send = (payload: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); };
    const reject = () => ws.close(4003, 'Доступ запрещён');
    ws.on('error', () => {});
    ws.on('close', () => {
      for (const [room, sockets] of rooms) { sockets.delete(ws); if (!sockets.size) rooms.delete(room); }
    });
    async function authenticate(): Promise<void> {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        if (!domainMatches(request.headers.origin, env.publicUrl)) return reject();
        const payload = verifyOperatorToken(token);
        if (!payload) return reject();
        const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
        if (!user) return reject();
        operatorId = user.id;
        if (ws.readyState !== WebSocket.OPEN) return;
        join('operators', ws);
      } else {
        const key = url.searchParams.get('siteKey'), token = url.searchParams.get('visitorToken');
        if (!key || !token || key.length > 64 || token.length > 64) return reject();
        const [site] = await db.select().from(sites).where(eq(sites.publicKey, key)).limit(1);
        if (!site || !domainMatches(request.headers.origin, site.domain)) return reject();
        const [visitor] = await db.select().from(visitors).where(and(eq(visitors.siteId, site.id), eq(visitors.token, token))).limit(1);
        if (!visitor) return reject();
        visitorId = visitor.id;
        if (ws.readyState !== WebSocket.OPEN) return;
        join('visitor:' + visitorId, ws);
      }
      ready = true;
    }
    const authentication = authenticate().catch(() => ws.close(1011, 'Ошибка подключения'));
    async function handle(data: any): Promise<void> {
      await authentication;
      if (!ready || ws.readyState !== WebSocket.OPEN) return;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'draft' || data.type === 'subscribe') return;
      let conversation;
      if (visitorId) {
        [conversation] = await db.select().from(conversations).where(eq(conversations.visitorId, visitorId)).orderBy(desc(conversations.createdAt)).limit(1);
      } else if (operatorId && idSchema.safeParse(data.conversationId).success) {
        [conversation] = await db.select().from(conversations).where(eq(conversations.id, data.conversationId)).limit(1);
      }
      if (!conversation) return;
      if (data.type === 'message') {
        const parsed = messageSchema.safeParse(data);
        if (!parsed.success) { send({type:'error',error:'Некорректное сообщение'}); return; }
        const message = await createMessage({conversationId:conversation.id,senderType:visitorId?'visitor':'operator',senderId:operatorId,body:parsed.data.body,clientId:parsed.data.clientId});
        broadcast('visitor:' + conversation.visitorId, {type:'message',message});
        broadcast('operators', {type:'message',conversationId:conversation.id,message});
        return;
      }
      if (data.type === 'typing') {
        const payload = {type:'typing',conversationId:conversation.id,who:visitorId?'visitor':'operator'};
        broadcast(visitorId?'operators':'visitor:' + conversation.visitorId,payload);
        return;
      }
      if (data.type === 'ack') {
        const parsed = ackSchema.safeParse(data);
        if (!parsed.success) return;
        const affected = await db.update(messages).set({status:parsed.data.status}).where(and(
          eq(messages.conversationId,conversation.id),
          eq(messages.senderType,visitorId?'operator':'visitor'),
          inArray(messages.id,parsed.data.messageIds),
          inArray(messages.status,parsed.data.status==='read'?['sent','delivered']:['sent'])
        )).returning({id:messages.id});
        const payload = {type:'status_updated',conversationId:conversation.id,messageIds:affected.map(m=>m.id),status:parsed.data.status};
        broadcast('visitor:' + conversation.visitorId,payload);
        broadcast('operators',payload);
      }
    }
    ws.on('message', raw => {
      if (Date.now() >= resetAt) { count = 0; resetAt = Date.now() + 60000; }
      if (++count > 120) { ws.close(1008, 'Слишком много событий'); return; }
      let data: unknown;
      try { data = JSON.parse(raw.toString()); } catch { send({type:'error',error:'Некорректный JSON'}); return; }
      chain = chain.then(() => handle(data)).catch(() => send({type:'error',error:'Не удалось обработать событие. Повторите попытку.'}));
    });
  });
}

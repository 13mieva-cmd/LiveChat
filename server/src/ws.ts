import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { db } from './db.js';
import { conversations, messages, sites, visitors } from './schema.js';
import { and, eq } from 'drizzle-orm';
import { verifyOperatorToken } from './auth.js';
import { createMessage } from './chat-service.js';
import { createThrottle, normalizeText } from './utils.js';
import { messageSchema, draftSchema } from './validation.js';

const rooms = new Map<string, Set<WebSocket>>();
const drafts = new Map<string, string>();
const rateCounters = new Map<WebSocket, { count: number; resetAt: number }>();

export function broadcast(room: string, payload: unknown): void {
  const connections = rooms.get(room);
  if (!connections) return;
  const data = JSON.stringify(payload);
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function join(room: string, ws: WebSocket): void {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
}

function allow(ws: WebSocket, limit = 60): boolean {
  const now = Date.now();
  const counter = rateCounters.get(ws);
  if (!counter || counter.resetAt < now) {
    rateCounters.set(ws, { count: 1, resetAt: now + 60000 });
    return true;
  }
  counter.count += 1;
  return counter.count <= limit;
}

export function setupWs(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, request) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const siteKey = url.searchParams.get('siteKey');
    const visitorToken = url.searchParams.get('visitorToken');

    let visitorRoom: string | null = null;
    let operatorId: string | null = null;

    if (token) {
      const payload = verifyOperatorToken(token);
      if (!payload) return ws.close(4001, 'Не авторизован');
      operatorId = payload.sub;
      join('operators', ws);
    } else if (siteKey && visitorToken) {
      const [site] = await db.select().from(sites).where(eq(sites.publicKey, siteKey)).limit(1);
      if (!site) return ws.close(4004, 'Сайт не найден');

      const [visitor] = await db.select().from(visitors)
        .where(and(eq(visitors.siteId, site.id), eq(visitors.token, visitorToken))).limit(1);
      if (!visitor) return ws.close(4004, 'Посетитель не найден');

      visitorRoom = `visitor:${visitor.id}`;
      join(visitorRoom, ws);
    } else {
      return ws.close(4000, 'Некорректное подключение');
    }

    ws.on('message', async (raw) => {
      if (!allow(ws)) return;

      let data: any;
      try { data = JSON.parse(raw.toString()); } catch { return; }

      if (data.type === 'subscribe' && operatorId) {
        const [conversation] = await db.select().from(conversations)
          .where(eq(conversations.id, data.conversationId)).limit(1);
        if (conversation) {
          join(`visitor:${conversation.visitorId}`, ws);
          const draft = drafts.get(conversation.id);
          if (draft) ws.send(JSON.stringify({ type: 'draft', conversationId: conversation.id, text: draft }));
        }
        return;
      }

      if (data.type === 'message' && visitorRoom) {
        const parsed = messageSchema.safeParse(data);
        if (!parsed.success) return;

        const [conversation] = await db.select().from(conversations)
          .where(eq(conversations.visitorId, visitorRoom.replace('visitor:', ''))).limit(1);
        if (!conversation) return;

        const message = await createMessage({
          conversationId: conversation.id,
          senderType: 'visitor',
          body: parsed.data.body,
          clientId: parsed.data.clientId
        });

        broadcast(visitorRoom, { type: 'message', message });
        broadcast('operators', {
          type: 'conversation_updated',
          conversationId: conversation.id,
          siteId: conversation.siteId,
          preview: message.body
        });
        return;
      }

      if (data.type === 'message' && operatorId) {
        const parsed = messageSchema.safeParse(data);
        if (!parsed.success) return;

        const [conversation] = await db.select().from(conversations)
          .where(eq(conversations.id, data.conversationId)).limit(1);
        if (!conversation) return;

        const message = await createMessage({
          conversationId: conversation.id,
          senderType: 'operator',
          senderId: operatorId,
          body: parsed.data.body,
          clientId: parsed.data.clientId
        });

        broadcast(`visitor:${conversation.visitorId}`, { type: 'message', message: { ...message, senderName: 'Оператор' } });
        broadcast('operators', { type: 'message', conversationId: conversation.id, message: { ...message, senderName: 'Оператор' } });
        return;
      }

      if (data.type === 'typing' && visitorRoom) {
        broadcast(visitorRoom, { type: 'typing', who: 'visitor' });
        return;
      }

      if (data.type === 'typing' && operatorId && data.conversationId) {
        const [conversation] = await db.select().from(conversations)
          .where(eq(conversations.id, data.conversationId)).limit(1);
        if (conversation) broadcast(`visitor:${conversation.visitorId}`, { type: 'typing', who: 'operator' });
        return;
      }

      if (data.type === 'draft' && visitorRoom) {
        const parsed = draftSchema.safeParse(data);
        if (!parsed.success) return;

        const [conversation] = await db.select().from(conversations)
          .where(eq(conversations.visitorId, visitorRoom.replace('visitor:', ''))).limit(1);
        if (!conversation) return;

        const [site] = await db.select().from(sites).where(eq(sites.id, conversation.siteId)).limit(1);
        if (!site?.draftPreviewEnabled) return;

        drafts.set(conversation.id, normalizeText(parsed.data.text));
        broadcast(visitorRoom, { type: 'draft', conversationId: conversation.id, text: drafts.get(conversation.id) });
        return;
      }

      if (data.type === 'ack') {
        const ids: string[] = Array.isArray(data.messageIds) ? data.messageIds.slice(0, 100) : [];
        const status = data.status === 'read' ? 'read' : 'delivered';
        for (const id of ids) {
          await db.update(messages).set({ status }).where(eq(messages.id, id));
        }
        if (visitorRoom) broadcast(visitorRoom, { type: 'status_updated', messageIds: ids, status });
        return;
      }
    });

    ws.on('close', () => {
      for (const [room, connections] of rooms.entries()) {
        connections.delete(ws);
        if (connections.size === 0) rooms.delete(room);
      }
      rateCounters.delete(ws);
    });
  });
}

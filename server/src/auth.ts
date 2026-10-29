import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env.js';
import { db } from './db.js';
import { users } from './schema.js';
import { eq } from 'drizzle-orm';
import { operatorSessionActive } from './operator-sessions.js';

export type OperatorPayload = { sub: string; email: string; sid?: string };

export function signOperatorToken(payload: OperatorPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyOperatorToken(token: string): OperatorPayload | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    if (payload.sid !== undefined && typeof payload.sid !== 'string') return null;
    return payload as OperatorPayload;
  } catch { return null; }
}

export async function operatorPayloadActive(payload: OperatorPayload): Promise<boolean> {
  return payload.sid === undefined || await operatorSessionActive(payload.sid, payload.sub);
}

export async function requireOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyOperatorToken(token) : null;
  if (!payload || !(await operatorPayloadActive(payload))) { await reply.code(401).send({ error: 'Требуется авторизация' }); return; }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) { await reply.code(401).send({ error: 'Пользователь не найден' }); return; }
  request.operator = user;
}

import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env.js';
import { db } from './db.js';
import { users } from './schema.js';
import { eq } from 'drizzle-orm';

export type OperatorPayload = { sub: string; email: string };

export function signOperatorToken(payload: OperatorPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyOperatorToken(token: string): OperatorPayload | null {
  try { return jwt.verify(token, env.jwtSecret) as OperatorPayload; } catch { return null; }
}

export async function requireOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyOperatorToken(token) : null;
  if (!payload) { await reply.code(401).send({ error: 'Требуется авторизация' }); return; }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) { await reply.code(401).send({ error: 'Пользователь не найден' }); return; }
  request.operator = user;
}

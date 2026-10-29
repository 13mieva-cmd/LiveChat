import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import { env } from './env.js';

const secure = new URL(env.publicUrl).protocol === 'https:' || env.nodeEnv === 'production';
const cookieName = secure ? '__Host-livechat-session' : 'livechat-session';
const maxAge = 180 * 24 * 60 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SessionUser = { id: string; email: string; passwordHash: string };

function digest(value: string): string {
  return createHmac('sha256', env.jwtSecret).update(value).digest('hex');
}
function cookieSecret(request: FastifyRequest): string | null {
  const values = (request.headers.cookie || '').split(';').map(value => value.trim());
  const value = values.find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
function writeCookie(reply: FastifyReply, secret: string, clear = false): void {
  reply.header('Set-Cookie', cookieName + '=' + secret + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (clear ? 0 : maxAge) + (secure ? '; Secure' : ''));
  reply.header('Cache-Control', 'no-store');
}
export function sessionOriginAllowed(request: FastifyRequest): boolean {
  return request.headers.origin === new URL(env.publicUrl).origin;
}
function accessToken(id: string, email: string, sid: string): string {
  return jwt.sign({ sub: id, email, sid }, env.jwtSecret, { expiresIn: '7d', algorithm: 'HS256' });
}
export async function createOperatorSession(user: SessionUser, reply: FastifyReply): Promise<string> {
  const id = randomUUID(), secret = randomBytes(32).toString('hex');
  await sql`INSERT INTO operator_sessions (id, user_id, secret_hash, password_hash, expires_at)
    VALUES (${id}, ${user.id}, ${digest(secret)}, ${user.passwordHash}, now() + interval '180 days')`;
  writeCookie(reply, secret);
  return accessToken(user.id, user.email, id);
}
export async function operatorSessionActive(sid: string, userId: string): Promise<boolean> {
  if (!uuid.test(sid) || !uuid.test(userId)) return false;
  const rows = await sql`SELECT s.id FROM operator_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND s.user_id = ${userId} AND s.expires_at > now()
      AND s.password_hash = u.password_hash LIMIT 1`;
  return rows.length === 1;
}
export async function registerOperatorSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/refresh', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!sessionOriginAllowed(request)) return reply.code(403).send({ error: 'Недопустимый источник запроса' });
    const secret = cookieSecret(request);
    if (!secret) return reply.code(401).send({ error: 'Требуется вход' });
    const rows = await sql`UPDATE operator_sessions s SET expires_at = now() + interval '180 days'
      FROM users u WHERE s.secret_hash = ${digest(secret)} AND u.id = s.user_id
        AND s.expires_at > now() AND s.password_hash = u.password_hash
      RETURNING s.id, u.id AS user_id, u.email, u.name, u.status`;
    const row = rows[0];
    if (!row) {
      writeCookie(reply, '', true);
      return reply.code(401).send({ error: 'Сохранённый вход недействителен' });
    }
    writeCookie(reply, secret);
    return { token: accessToken(String(row.user_id), String(row.email), String(row.id)),
      user: { id: row.user_id, email: row.email, name: row.name, status: row.status } };
  });
  app.post('/auth/logout', async (request, reply) => {
    if (!sessionOriginAllowed(request)) return reply.code(403).send({ error: 'Недопустимый источник запроса' });
    const secret = cookieSecret(request);
    if (secret) await sql`DELETE FROM operator_sessions WHERE secret_hash = ${digest(secret)}`;
    writeCookie(reply, '', true);
    return { ok: true };
  });
  app.post('/auth/logout-all', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!sessionOriginAllowed(request)) return reply.code(403).send({ error: 'Недопустимый источник запроса' });
    const secret = cookieSecret(request);
    if (!secret) return reply.code(401).send({ error: 'Требуется вход' });
    const rows = await sql`DELETE FROM operator_sessions WHERE user_id IN (
      SELECT s.user_id FROM operator_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.secret_hash = ${digest(secret)} AND s.expires_at > now() AND s.password_hash = u.password_hash
    ) RETURNING id`;
    writeCookie(reply, '', true);
    if (!rows.length) return reply.code(401).send({ error: 'Сохранённый вход недействителен' });
    return { ok: true };
  });
}

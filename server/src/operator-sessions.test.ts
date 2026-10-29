import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';

vi.mock('./db.js', () => ({ sql: vi.fn() }));
vi.mock('./env.js', () => ({ env: { publicUrl: 'https://chat.example.test', nodeEnv: 'test', jwtSecret: 'test-session-secret-not-for-production' } }));

import { sql } from './db.js';
import { createOperatorSession, operatorSessionActive, registerOperatorSessionRoutes } from './operator-sessions.js';

const query = vi.mocked(sql);
const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => { vi.resetAllMocks(); });

describe('operator sessions', () => {
  it('rejects malformed session identifiers before querying the database', async () => {
    expect(await operatorSessionActive('invalid', userId)).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('checks session activity against the database', async () => {
    query.mockResolvedValueOnce([] as never);
    expect(await operatorSessionActive(sessionId, userId)).toBe(false);
    query.mockResolvedValueOnce([{ id: sessionId }] as never);
    expect(await operatorSessionActive(sessionId, userId)).toBe(true);
  });

  it('rejects cross-origin refresh even with a cookie', async () => {
    const app = Fastify();
    await registerOperatorSessionRoutes(app);
    try {
      const response = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { origin: 'https://other.example.test', cookie: '__Host-livechat-session=' + 'a'.repeat(64) } });
      expect(response.statusCode).toBe(403);
      expect(query).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('requires a saved cookie for refresh', async () => {
    const app = Fastify();
    await registerOperatorSessionRoutes(app);
    try {
      const response = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { origin: 'https://chat.example.test' } });
      expect(response.statusCode).toBe(401);
      expect(query).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it('issues a secure cookie and a seven-day token bound to a server session', async () => {
    const app = Fastify();
    query.mockResolvedValueOnce([] as never);
    app.post('/test-login', async (_request, reply) => ({ token: await createOperatorSession({ id: userId, email: 'operator@example.test', passwordHash: 'test-password-hash' }, reply) }));
    try {
      const response = await app.inject({ method: 'POST', url: '/test-login' });
      expect(response.statusCode).toBe(200);
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toContain('__Host-livechat-session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Secure');
      const payload = jwt.verify(response.json().token, 'test-session-secret-not-for-production') as jwt.JwtPayload;
      expect(payload.sub).toBe(userId);
      expect(typeof payload.sid).toBe('string');
      expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60);
    } finally { await app.close(); }
  });
});

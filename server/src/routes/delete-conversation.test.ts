import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';

const mocks = vi.hoisted(() => ({ begin: vi.fn(), query: vi.fn(), broadcast: vi.fn() }));
vi.mock('../db.js', () => ({ sql: { begin: mocks.begin } }));
vi.mock('../ws.js', () => ({ broadcast: mocks.broadcast }));
vi.mock('../auth.js', () => ({
  requireOperator: async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization !== 'Bearer test') {
      await reply.code(401).send({ error: 'Требуется авторизация' });
    }
  }
}));

import { deleteConversationRoutes } from './delete-conversation.js';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = { lastActivityAt: '2026-01-01T10:00:00.000Z', closedAt: '2026-01-01T10:01:00.000Z' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.begin.mockImplementation(async (run: (query: typeof mocks.query) => Promise<unknown>) => run(mocks.query));
});

async function remove(body: unknown = snapshot, authenticated = true) {
  const app = Fastify();
  await app.register(deleteConversationRoutes);
  try {
    return await app.inject({ method: 'DELETE', url: '/conversations/' + id,
      headers: authenticated ? { authorization: 'Bearer test' } : {}, payload: body as Record<string, unknown> });
  } finally { await app.close(); }
}

describe('deleting completed conversations', () => {
  it('requires operator authentication', async () => {
    const response = await remove(snapshot, false);
    expect(response.statusCode).toBe(401);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('rejects an incomplete confirmation snapshot', async () => {
    const response = await remove({ lastActivityAt: snapshot.lastActivityAt });
    expect(response.statusCode).toBe(400);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('returns 404 for an already deleted conversation', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await remove();
    expect(response.statusCode).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('does not delete an active conversation', async () => {
    mocks.query.mockResolvedValueOnce([{ id, status: 'active', unchanged: true }]);
    const response = await remove();
    expect(response.statusCode).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('requires a new confirmation when the conversation changed', async () => {
    mocks.query.mockResolvedValueOnce([{ id, status: 'closed', unchanged: false }]);
    const response = await remove();
    expect(response.statusCode).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('deletes an unchanged closed conversation and notifies other panels', async () => {
    mocks.query.mockResolvedValueOnce([{ id, status: 'closed', unchanged: true }])
      .mockResolvedValueOnce([{ relation: 'lc_push_jobs' }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const response = await remove();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, conversationId: id });
    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(mocks.broadcast).toHaveBeenCalledWith('operators', { type: 'conversation_deleted', conversationId: id });
  });

  it('does not announce deletion if the transaction fails', async () => {
    mocks.query.mockRejectedValueOnce(new Error('Database unavailable'));
    const response = await remove();
    expect(response.statusCode).toBe(500);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});

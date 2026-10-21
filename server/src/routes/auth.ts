import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { users } from '../schema.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { signOperatorToken, requireOperator } from '../auth.js';
import { z } from 'zod';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6).max(200) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверный email или пароль' });

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }

    return {
      token: signOperatorToken({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name, status: user.status }
    };
  });

  app.get('/auth/me', { preHandler: requireOperator }, async (request) => {
    const user = request.operator!;
    return { id: user.id, email: user.email, name: user.name, status: user.status };
  });

  app.patch('/auth/status', { preHandler: requireOperator }, async (request, reply) => {
    const parsed = z.object({ status: z.enum(['online', 'away', 'offline']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверный статус' });

    const [user] = await db.update(users).set({ status: parsed.data.status })
      .where(eq(users.id, request.operator!.id)).returning();
    return { id: user.id, status: user.status };
  });
}

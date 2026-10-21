import 'fastify';
import type { users } from './schema.js';
declare module 'fastify' {
  interface FastifyRequest { operator?: typeof users.$inferSelect; }
}

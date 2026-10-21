import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './env.js';
import { registerRoutes } from './routes/index.js';
import { setupWs } from './ws.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024, trustProxy: true });

await app.register(cors, { origin: true, credentials: true });
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'Слишком много запросов. Попробуйте позже.' })
});

await runMigrations();
await seed();
await registerRoutes(app);

const operatorDist = path.resolve('..', 'apps/operator/dist');
const widgetDist = path.resolve('..', 'apps/widget/dist');

if (existsSync(operatorDist)) {
  await app.register(fastifyStatic, { root: operatorDist, prefix: '/panel/', decorateReply: false });
}

if (existsSync(widgetDist)) {
  await app.register(fastifyStatic, { root: widgetDist, prefix: '/widget-assets/', decorateReply: false });
}

app.get('/health', async () => ({ status: 'ok' }));
await app.listen({ port: env.port, host: '0.0.0.0' });
setupWs(app.server);

console.log(`Сервер запущен: ${env.publicUrl}`);

import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { siteRoutes } from './sites.js';
import { widgetRoutes } from './widget.js';
import { conversationRoutes } from './conversations.js';
import { quickReplyRoutes } from './quick-replies.js';
import { pushRoutes } from '../push.js';
import { photoRoutes } from './photos.js';
import { profileRoutes } from './profiles.js';
import { deleteConversationRoutes } from './delete-conversation.js';
import { presenceRoutes } from './presence.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(siteRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(widgetRoutes, { prefix: '/api' });
  await app.register(conversationRoutes, { prefix: '/api' });
  await app.register(quickReplyRoutes, { prefix: '/api' });
  await app.register(pushRoutes, { prefix: '/api' });
  await app.register(photoRoutes, { prefix: '/api' });
  await app.register(deleteConversationRoutes, { prefix: '/api' });
  await app.register(presenceRoutes, { prefix: '/api' });
}

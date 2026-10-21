import { z } from 'zod';

export const messageSchema = z.object({
  clientId: z.string().min(8).max(64),
  body: z.string().trim().min(1).max(4000)
});

export const draftSchema = z.object({ text: z.string().max(4000) });

export const siteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  domain: z.string().trim().min(3).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4f46e5'),
  logoUrl: z.string().url().max(500).nullable().optional(),
  headerTitle: z.string().trim().min(1).max(80).default('Поддержка'),
  greeting: z.string().trim().min(1).max(300).default('Здравствуйте! Чем можем помочь?'),
  position: z.enum(['left', 'right']).default('right'),
  offsetX: z.number().int().min(0).max(100).default(20),
  offsetY: z.number().int().min(0).max(100).default(20),
  quickButtons: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    message: z.string().trim().min(1).max(300),
    autoReply: z.string().trim().max(1000).optional()
  })).max(3).default([]),
  draftPreviewEnabled: z.boolean().default(false),
  soundEnabled: z.boolean().default(true),
  mobileBehavior: z.enum(['panel', 'fullscreen']).default('panel'),
  hiddenPages: z.string().max(2000).default(''),
  autoInviteEnabled: z.boolean().default(false),
  autoInviteDelaySeconds: z.number().int().min(5).max(600).default(30),
  offlineMessage: z.string().trim().max(500).default('Сейчас мы не в сети. Оставьте сообщение, и мы ответим.'),
  retentionDays: z.number().int().min(1).max(3650).default(365)
});

export const quickReplySchema = z.object({
  siteId: z.string().uuid().nullable().optional(),
  category: z.string().trim().min(1).max(60).default('Общее'),
  shortcut: z.string().trim().max(30).nullable().optional(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2000)
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const editMessageSchema = z.object({ body: z.string().trim().min(1).max(4000) });

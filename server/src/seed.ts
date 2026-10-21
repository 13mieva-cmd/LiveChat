import { db } from './db.js';
import { sites, users, quickReplies } from './schema.js';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { env } from './env.js';
import { eq } from 'drizzle-orm';

export async function seed(): Promise<void> {
  const [existingUser] = await db.select().from(users).where(eq(users.email, env.ownerEmail)).limit(1);
  let ownerId: string;

  if (existingUser) {
    ownerId = existingUser.id;
  } else {
    const [created] = await db.insert(users).values({
      email: env.ownerEmail,
      passwordHash: await bcrypt.hash(env.ownerPassword, 12),
      name: env.ownerName
    }).returning();
    ownerId = created.id;
    console.log(`Создан владелец: ${env.ownerEmail}`);
  }

  const existingSites = await db.select().from(sites);
  if (existingSites.length > 0) return;

  const defaults = [
    { name: 'Сайт 1', domain: 'site1.example', color: '#4f46e5' },
    { name: 'Сайт 2', domain: 'site2.example', color: '#0f766e' }
  ];

  for (const item of defaults) {
    const publicKey = nanoid(16);
    const [site] = await db.insert(sites).values({
      ...item,
      publicKey,
      quickButtons: [
        { label: 'Узнать стоимость', message: 'Хочу узнать стоимость', autoReply: 'Конечно! Напишите, какой продукт вас интересует.' },
        { label: 'Задать вопрос', message: 'У меня есть вопрос', autoReply: 'Задайте вопрос, и я отвечу.' },
        { label: 'Связаться с поддержкой', message: 'Нужна помощь поддержки', autoReply: 'Опишите проблему, и мы поможем.' }
      ]
    }).returning();

    console.log(`Создан сайт "${site.name}". Публичный ключ: ${publicKey}`);

    await db.insert(quickReplies).values({
      siteId: site.id,
      category: 'Приветствие',
      shortcut: '/hello',
      title: 'Приветствие',
      body: 'Здравствуйте, {visitorName}! Чем могу помочь?'
    });
  }

  console.log(`Оператор: ${env.ownerEmail}`);
  console.log(`Публичный URL: ${env.publicUrl}`);
}

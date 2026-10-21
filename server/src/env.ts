import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../.env');

dotenv.config({ path: rootEnv });
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  ownerEmail: process.env.OWNER_EMAIL ?? 'admin@example.com',
  ownerPassword: process.env.OWNER_PASSWORD ?? 'change-me-strong-password',
  ownerName: process.env.OWNER_NAME ?? 'Владелец',
  maxmindDbPath: process.env.MAXMIND_DB_PATH || null
};

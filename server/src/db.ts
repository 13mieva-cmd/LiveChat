import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from './env.js';

export const sql = postgres(env.databaseUrl, { max: 10 });
export const db = drizzle(sql, { schema });

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../drizzle');

export async function runMigrations(): Promise<void> {
  const sql = postgres(env.databaseUrl, { max: 1 });
  await sql`create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const applied = new Set((await sql`select filename from schema_migrations`).map((row) => row.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(path.join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into schema_migrations (filename) values (${file})`;
    });
  }

  await sql.end();
}

if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(() => { console.log('Миграции применены'); process.exit(0); })
    .catch((error) => { console.error(error); process.exit(1); });
}

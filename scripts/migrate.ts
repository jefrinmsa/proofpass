import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('Database ready');
} finally {
  await db.end();
}

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createDbPool, isCloud } from '@zk-auth/shared/server';
const db = createDbPool();
try {
  await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  if (isCloud())
    await db.query(await readFile(new URL('./hosted-security.sql', import.meta.url), 'utf8'));
  console.log('Database ready');
} finally {
  await db.end();
}

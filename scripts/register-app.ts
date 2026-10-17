import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const [id, ...origins] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]{1,64}$/.test(id) || !origins.length)
  throw new Error('Usage: npm run app:register -- demo-a http://localhost:3000');
for (const origin of origins) {
  const u = new URL(origin);
  if (
    u.origin !== origin ||
    !['http:', 'https:'].includes(u.protocol) ||
    (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname))
  )
    throw new Error('Use exact HTTPS origins or localhost HTTP origins');
}
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const seed = BigInt('0x' + randomBytes(16).toString('hex')).toString();
  // Origin updates deliberately retain the seed so existing account identifiers remain stable.
  const r = await db.query(
    'INSERT INTO applications(id,origins,nullifier_seed) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET origins=EXCLUDED.origins RETURNING id,nullifier_seed',
    [id, JSON.stringify(origins), seed],
  );
  console.log(JSON.stringify(r.rows[0]));
} finally {
  await db.end();
}

import 'dotenv/config';
import { createDbPool } from '@zk-auth/shared/server';
const db = createDbPool();
try {
  for (const table of [
    'challenges',
    'assertion_redemptions',
    'sessions',
    'student_email_challenges',
  ])
    await db.query(`DELETE FROM ${table} WHERE expires_at<NOW()`);
  console.log('Expired challenges, redemption records, and sessions removed.');
} finally {
  await db.end();
}

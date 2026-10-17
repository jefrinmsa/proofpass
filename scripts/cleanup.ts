import 'dotenv/config';
import pg from 'pg';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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

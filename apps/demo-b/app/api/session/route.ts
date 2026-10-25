import { sessionHandlers } from '@zk-auth/demo/server';
import { isCloud, requiredEnv } from '@zk-auth/shared/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST, DELETE } = sessionHandlers(
  'demo-b',
  process.env.APP_ORIGIN ?? (isCloud() ? requiredEnv('APP_ORIGIN') : 'http://localhost:3001'),
);

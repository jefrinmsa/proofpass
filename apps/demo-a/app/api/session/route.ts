import { sessionHandlers } from '@zk-auth/demo/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST, DELETE } = sessionHandlers(
  'demo-a',
  process.env.APP_ORIGIN ?? 'http://localhost:3000',
);

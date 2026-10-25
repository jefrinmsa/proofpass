import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { attachDatabasePool } from '@vercel/functions';

export type Environment = Record<string, string | undefined>;
export const isCloud = (env: Environment = process.env) =>
  env.DEPLOYMENT_ENV === 'cloud' || env.VERCEL === '1';
export function requiredEnv(key: string, env: Environment = process.env) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
export function exactOrigin(value: string) {
  const u = new URL(value);
  if (
    u.origin !== value ||
    !(
      u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))
    )
  )
    throw new Error('Expected exact HTTPS origin or local HTTP origin');
  return value;
}
export function authIssuer(env: Environment = process.env) {
  return exactOrigin(
    env.AUTH_ISSUER ?? (isCloud(env) ? requiredEnv('AUTH_ISSUER', env) : 'http://localhost:4000'),
  );
}
export async function secretValue(
  valueKey: string,
  fileKey: string,
  env: Environment = process.env,
) {
  const value = env[valueKey] ?? (env[fileKey] ? await readFile(env[fileKey]!, 'utf8') : undefined);
  if (!value?.trim()) throw new Error(`Missing ${valueKey} or ${fileKey}`);
  return value.trim().replace(/\\n/g, '\n');
}
export function createDbPool(env: Environment = process.env) {
  const cloud = isCloud(env);
  const connectionString = env.DATABASE_URL;
  const max = Number(env.DB_POOL_MAX ?? (cloud ? 3 : 10));
  if (!Number.isInteger(max) || max < 1 || max > 10)
    throw new Error('DB_POOL_MAX must be between 1 and 10');
  let url = connectionString;
  let ssl: pg.PoolConfig['ssl'];
  if (cloud) {
    let parsed: URL;
    try {
      parsed = new URL(requiredEnv('DATABASE_URL', env));
    } catch {
      throw new Error('Missing or invalid cloud DATABASE_URL');
    }
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    )
      throw new Error('Cloud requires a separate remote PostgreSQL database');
    if (parsed.searchParams.get('sslmode') === 'disable')
      throw new Error('Cloud database TLS is required');
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      parsed.searchParams.delete(key);
    url = parsed.toString();
    ssl = {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}),
    };
  }
  const pool = new pg.Pool({
    connectionString: url,
    max,
    ssl,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  if (env.VERCEL === '1') attachDatabasePool(pool);
  return pool;
}

import { it, expect, vi, afterEach } from 'vitest';
import { browserSettings } from '../packages/shared/src/browser';
import { authIssuer, createDbPool, exactOrigin, secretValue } from '../packages/shared/src/server';
import { storageClient } from '../packages/shared/src/storage';
import { checkAsset } from '../scripts/public-assets';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { buildServer } from '../apps/api/src/server';
afterEach(() => vi.unstubAllGlobals());
it('allows CORS only for registered exact origins and denies it during database failures', async () => {
  let offline = false;
  const db = {
    query: async (_sql: string, values: string[]) => {
      if (offline) throw new Error('database unavailable');
      return {
        rowCount: values[0] === JSON.stringify(['https://library.example.com']) ? 1 : 0,
        rows: [],
      };
    },
  } as unknown as pg.Pool;
  const app = await buildServer(
    undefined,
    { keys: [] },
    {
      db,
      chainId: 11155111,
      verifier: '0x1111111111111111111111111111111111111111',
      getRoot: async () => '',
      setRoot: async () => {},
      verifyProof: async () => false,
      signAssertion: async () => '',
      otpHashSecret: 'ab'.repeat(32),
    },
  );
  try {
    const request = (origin: string) =>
      app.inject({ method: 'GET', url: '/health', headers: { origin } });
    expect(
      (await request('https://library.example.com')).headers['access-control-allow-origin'],
    ).toBe('https://library.example.com');
    expect(
      (await request('https://unregistered-preview.vercel.app')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
    offline = true;
    expect(
      (await request('https://library.example.com')).headers['access-control-allow-origin'],
    ).toBeUndefined();
  } finally {
    await app.close();
  }
});
it('removes Supabase anonymous and authenticated access to application tables', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('scripts/schema.sql', 'utf8'));
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO anon, authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await db.exec('SET ROLE anon; SELECT * FROM applications; RESET ROLE;');
    await db.exec(await readFile('scripts/hosted-security.sql', 'utf8'));
    const tables = [
      'applications',
      'challenges',
      'assertion_redemptions',
      'sessions',
      'student_enrollments',
      'student_email_challenges',
      'student_credentials',
    ];
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of tables)
        await expect(db.query(`SELECT * FROM ${table}`)).rejects.toThrow();
      await db.exec('RESET ROLE');
    }
    const security = await db.query<{ relrowsecurity: boolean }>(
      'SELECT relrowsecurity FROM pg_class WHERE relname = ANY($1)',
      [tables],
    );
    expect(security.rows).toHaveLength(tables.length);
    expect(security.rows.every((row) => row.relrowsecurity)).toBe(true);
  } finally {
    await db.close();
  }
});
const cloud = {
  DEPLOYMENT_ENV: 'cloud',
  DATABASE_URL: 'postgresql://demo:password@pooler.example.com:6543/postgres',
  AUTH_ISSUER: 'https://auth.example.com',
};
it('rejects invalid hosted URLs and local-chain browser settings', () => {
  expect(() => authIssuer({ DEPLOYMENT_ENV: 'cloud' })).toThrow();
  expect(() => exactOrigin('https://example.com/path')).toThrow();
  expect(() => browserSettings({ NEXT_PUBLIC_DEPLOYMENT_ENV: 'cloud' })).toThrow();
  const browser = {
    NEXT_PUBLIC_DEPLOYMENT_ENV: 'cloud',
    NEXT_PUBLIC_CHAIN_ID: '11155111',
    NEXT_PUBLIC_AUTH_API: 'https://auth.example.com',
    NEXT_PUBLIC_RPC_URL: 'https://rpc.example.com/key',
    NEXT_PUBLIC_STUDENT_LAB_URL: 'https://lab.example.com',
    NEXT_PUBLIC_LIBRARY_URL: 'https://library.example.com',
  };
  expect(browserSettings(browser).chainId).toBe(11155111);
  expect(() => browserSettings({ ...browser, NEXT_PUBLIC_CHAIN_ID: '31337' })).toThrow();
  expect(() =>
    browserSettings({ ...browser, NEXT_PUBLIC_AUTH_API: 'http://localhost:4000' }),
  ).toThrow();
});
it('bounds hosted database pools and enforces verified TLS', async () => {
  expect(() => createDbPool({ ...cloud, DATABASE_URL: 'postgres://a:b@localhost/db' })).toThrow();
  expect(() =>
    createDbPool({ ...cloud, DATABASE_URL: cloud.DATABASE_URL + '?sslmode=disable' }),
  ).toThrow();
  expect(() => createDbPool({ ...cloud, DB_POOL_MAX: '100' })).toThrow();
  const pool = createDbPool(cloud);
  expect(pool.options.max).toBe(3);
  expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
  await pool.end();
  expect(await secretValue('KEY', 'FILE', { KEY: 'line1\\nline2' })).toBe('line1\nline2');
});
it('signs only expected private storage paths for sixty seconds and rejects foreign redirects', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ signedURL: '/object/sign/proofpass-materials/book.pdf?token=test-only' }),
      );
    }),
  );
  const client = storageClient({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  });
  const link = await client.sign('proofpass-materials', 'book.pdf', true);
  expect(new URL(link).origin).toBe('https://project.supabase.co');
  expect(new URL(link).searchParams.get('download')).toBe('book.pdf');
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ expiresIn: 60 });
  expect(calls[0].init.cache).toBe('no-store');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            signedURL: 'https://attacker.example/object/sign/proofpass-materials/book.pdf',
          }),
        ),
    ),
  );
  await expect(client.sign('proofpass-materials', 'book.pdf', false)).rejects.toThrow();
});
it('rejects altered pinned public assets', () => {
  const bytes = Buffer.from('published artifact');
  const hash = createHash('sha256').update(bytes).digest('hex');
  checkAsset(bytes, hash);
  expect(() => checkAsset(Buffer.from('changed'), hash)).toThrow('PUBLIC_ARTIFACT_HASH_MISMATCH');
});

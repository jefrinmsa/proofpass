import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import type pg from 'pg';
import { NextRequest } from 'next/server';
import { PgStore } from '../apps/api/src/store';
import { sessionHandlers } from '../packages/demo/src/server';
import { challengeMessage, signalFor, type Challenge } from '../packages/shared/src/index';
describe('PostgreSQL persistence via embedded PostgreSQL engine', () => {
  it('atomically consumes a challenge and rolls back session replay', async () => {
    const db = new PGlite();
    await db.exec(await readFile('scripts/schema.sql', 'utf8'));
    // Adapter uses the real PostgreSQL engine; production uses a pg connection pool.
    const query = async (sql: string, params?: unknown[]) => {
      const r = await db.query(sql, params);
      return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    };
    const adapter = {
      query,
      connect: async () => ({ query, release: () => {} }),
    } as unknown as pg.Pool;
    try {
      await query('INSERT INTO applications(id,origins,nullifier_seed) VALUES($1,$2,$3)', [
        'demo-a',
        JSON.stringify(['http://localhost:3000']),
        '123',
      ]);
      const store = new PgStore(adapter);
      expect((await store.getApp('demo-a'))?.nullifierSeed).toBe('123');
      const fields = {
        id: crypto.randomUUID(),
        appId: 'demo-a',
        origin: 'http://localhost:3000',
        wallet: ('0x' + '11'.repeat(20)) as `0x${string}`,
        chainId: 31337,
        verifier: ('0x' + 'ab'.repeat(20)) as `0x${string}`,
        nonce: 'nonce',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        nullifierSeed: '123',
      };
      const message = challengeMessage(fields);
      const c: Challenge = { ...fields, message, signal: signalFor(message) };
      await store.saveChallenge(c);
      expect(await store.getChallenge(c.id)).toEqual(c);
      expect(
        await Promise.all([store.consumeChallenge(c.id), store.consumeChallenge(c.id)]),
      ).toEqual([true, false]);
      const claims = {
        sub: 'scoped-user',
        wallet: fields.wallet,
        ageAbove18: true as const,
        environment: 'test' as const,
        jti: 'one-time-assertion',
        exp: Math.floor(Date.now() / 1000) + 300,
        aud: 'demo-a',
      };
      const handlers = sessionHandlers('demo-a', 'http://localhost:3000', {
        pool: adapter,
        verify: async () => claims,
      });
      const request = () =>
        new NextRequest('http://localhost:3000/api/session', {
          method: 'POST',
          headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({ assertion: 'valid-test-assertion' }),
        });
      const signedIn = await handlers.POST(request());
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers.get('set-cookie')!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=strict');
      expect((await handlers.POST(request())).status).toBe(409);
      const r = await handlers.GET(
        new NextRequest('http://localhost:3000/api/session', { headers: { cookie } }),
      );
      expect((await r.json()).user.sub).toBe('scoped-user');
      const b = sessionHandlers('demo-b', 'http://localhost:3001', {
        pool: adapter,
        verify: async () => {
          throw new Error('wrong audience');
        },
      });
      const other = await b.GET(
        new NextRequest('http://localhost:3001/api/session', { headers: { cookie } }),
      );
      expect((await other.json()).authenticated).toBe(false);
      expect(
        (
          await b.POST(
            new NextRequest('http://localhost:3001/api/session', {
              method: 'POST',
              headers: { origin: 'http://localhost:3001' },
              body: JSON.stringify({ assertion: 'app-a-token' }),
            }),
          )
        ).status,
      ).toBe(401);
      await handlers.DELETE(
        new NextRequest('http://localhost:3000/api/session', {
          method: 'DELETE',
          headers: { origin: 'http://localhost:3000', cookie },
        }),
      );
      expect(
        (
          await (
            await handlers.GET(
              new NextRequest('http://localhost:3000/api/session', { headers: { cookie } }),
            )
          ).json()
        ).authenticated,
      ).toBe(false);
    } finally {
      await db.close();
    }
  });
});

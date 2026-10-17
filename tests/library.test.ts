import { it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type pg from 'pg';
import { NextRequest } from 'next/server';
import { libraryHandlers } from '../apps/demo-b/lib/library';

it('protects catalog and file bytes with an active Campus Library session', async () => {
  const db = new PGlite();
  await mkdir('.local', { recursive: true });
  const directory = await mkdtemp(path.resolve('.local/library-test-'));
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ root: '123' }))),
    );
    await db.exec(await readFile('scripts/schema.sql', 'utf8'));
    const query = async (sql: string, values?: unknown[]) => {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    };
    const adapter = { query } as unknown as pg.Pool;
    const handler = libraryHandlers({ directory, db: adapter });
    const request = (url: string, cookie?: string) =>
      new NextRequest(`http://localhost:3001${url}`, { headers: cookie ? { cookie } : {} });
    const insert = async (token: string, app: string, expired = false) =>
      query('INSERT INTO sessions(token_hash,app_id,claims,expires_at) VALUES($1,$2,$3,$4)', [
        createHash('sha256').update(token).digest('hex'),
        app,
        JSON.stringify({
          sub: 'test-subject',
          wallet: 'test-wallet',
          studentEnrolled: true,
          credentialPolicy: 'active-enrollment-unexpired-card-email-wallet-v1',
          registryRoot: '123',
          accessUntil: Math.floor(Date.now() / 1000) + 28000,
        }),
        new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(),
      ]);
    await insert('active-token', 'demo-b');
    await insert('student-token', 'demo-a');
    await insert('expired-token', 'demo-b', true);
    const cookie = 'zk_demo_b=active-token';
    for (const invalid of [
      undefined,
      'zk_demo_b=unknown',
      'zk_demo_b=expired-token',
      'zk_demo_a=student-token',
      'zk_demo_b=student-token',
    ]) {
      expect((await handler.list(request('/api/library', invalid))).status).toBe(401);
      expect(
        (await handler.file(request('/api/library/cn-notes', invalid), 'cn-notes')).status,
      ).toBe(401);
    }
    const pdf = Buffer.from('%PDF-1.7 synthetic test material');
    await writeFile(path.join(directory, 'jefrincn.pdf'), pdf);
    await writeFile(
      path.join(directory, 'SOFTWARE PROJECT MANAGEMENT AND PROCESS MODELS [Autosaved].pptx'),
      Buffer.from('PK test slides'),
    );
    await writeFile(
      path.join(directory, 'Agile_Operations_Management.pptx'),
      Buffer.from('PK other test slides'),
    );
    const catalog = await handler.list(request('/api/library', cookie));
    expect(catalog.status).toBe(200);
    expect((await catalog.json()).materials).toHaveLength(3);
    const file = await handler.file(request('/api/library/cn-notes', cookie), 'cn-notes');
    expect(file.status).toBe(200);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(pdf);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.headers.get('content-disposition')).toContain('inline');
    expect(file.headers.get('cache-control')).toContain('no-store');
    const download = await handler.file(
      request('/api/library/cn-notes?download=1', cookie),
      'cn-notes',
    );
    expect(download.headers.get('content-disposition')).toContain('attachment');
    const slides = await handler.file(
      request('/api/library/project-management', cookie),
      'project-management',
    );
    expect(slides.headers.get('content-disposition')).toContain('attachment');
    expect(slides.headers.get('content-type')).toContain('presentationml');
    expect((await handler.file(request('/api/library/unknown', cookie), '../../.env')).status).toBe(
      404,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ root: '456' }))),
    );
    expect((await handler.list(request('/api/library', cookie))).status).toBe(401);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    expect((await handler.file(request('/api/library/cn-notes', cookie), 'cn-notes')).status).toBe(
      503,
    );
    await query('DELETE FROM sessions WHERE app_id=$1', ['demo-b']);
    expect((await handler.file(request('/api/library/cn-notes', cookie), 'cn-notes')).status).toBe(
      401,
    );
  } finally {
    vi.unstubAllGlobals();
    await db.close();
    if (
      path.dirname(directory) !== path.resolve('.local') ||
      !path.basename(directory).startsWith('library-test-')
    )
      throw new Error('Unexpected temporary directory');
    await rm(directory, { recursive: true, force: true });
  }
});

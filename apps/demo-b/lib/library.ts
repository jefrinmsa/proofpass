import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@zk-auth/demo/server';
import { isCloud } from '@zk-auth/shared/server';
import { storageClient } from '@zk-auth/shared/storage';
import { materialCatalog as materials } from '@zk-auth/shared';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};
export function libraryHandlers(options?: {
  directory?: string;
  db?: pg.Pool;
  storage?: {
    info(bucket: string, name: string): Promise<{ size: number }>;
    sign(bucket: string, name: string, download: boolean, downloadName?: string): Promise<string>;
  };
}) {
  const directory = options?.directory ?? path.resolve(process.cwd(), '.local/library');
  const mode = process.env.MATERIAL_STORAGE ?? (isCloud() ? 'supabase' : 'local');
  if (!['local', 'supabase'].includes(mode) || (isCloud() && mode !== 'supabase'))
    throw new Error('Hosted materials require private Supabase storage');
  const storage = options?.storage ?? (mode === 'supabase' ? storageClient() : undefined);
  const bucket = process.env.SUPABASE_MATERIALS_BUCKET ?? 'proofpass-materials';
  const error = (code: string, status: number) =>
    NextResponse.json({ error: code }, { status, headers });
  return {
    async list(req: NextRequest) {
      try {
        if (!(await readSession(req, 'demo-b', options?.db)))
          return error('LIBRARY_LOGIN_REQUIRED', 401);
        const catalog = await Promise.all(
          materials.map(async (material) => {
            const file = storage
              ? await storage.info(bucket, material.storageKey)
              : await stat(path.join(directory, material.file));
            return {
              id: material.id,
              title: material.title,
              filename: material.file,
              format: material.format,
              bytes: file.size,
            };
          }),
        );
        return NextResponse.json({ materials: catalog }, { headers });
      } catch {
        return error('LIBRARY_UNAVAILABLE', 503);
      }
    },
    async file(req: NextRequest, id: string) {
      try {
        if (!(await readSession(req, 'demo-b', options?.db)))
          return error('LIBRARY_LOGIN_REQUIRED', 401);
        // Only fixed catalog entries can resolve files; the request never supplies a path.
        const material = materials.find((entry) => entry.id === id);
        if (!material) return error('MATERIAL_NOT_FOUND', 404);
        const download =
          material.format !== 'PDF' || req.nextUrl.searchParams.get('download') === '1';
        if (storage) {
          const signed = await storage.sign(bucket, material.storageKey, download, material.file);
          return new NextResponse(null, { status: 303, headers: { ...headers, Location: signed } });
        }
        const data = await readFile(path.join(directory, material.file));
        return new NextResponse(new Uint8Array(data), {
          headers: {
            ...headers,
            'Content-Type': material.type,
            'Content-Length': String(data.length),
            'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${material.file}"; filename*=UTF-8''${encodeURIComponent(material.file)}`,
          },
        });
      } catch {
        return error('LIBRARY_UNAVAILABLE', 503);
      }
    },
  };
}

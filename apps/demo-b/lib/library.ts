import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@zk-auth/demo/server';

const materials = [
  {
    id: 'cn-notes',
    title: 'jefrincn',
    file: 'jefrincn.pdf',
    format: 'PDF',
    type: 'application/pdf',
  },
  {
    id: 'project-management',
    title: 'Software Project Management and Process Models',
    file: 'SOFTWARE PROJECT MANAGEMENT AND PROCESS MODELS [Autosaved].pptx',
    format: 'PPTX',
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  {
    id: 'agile-operations',
    title: 'Agile Operations Management',
    file: 'Agile_Operations_Management.pptx',
    format: 'PPTX',
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
] as const;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};
export function libraryHandlers(options?: { directory?: string; db?: pg.Pool }) {
  const directory = options?.directory ?? path.resolve(process.cwd(), '.local/library');
  const error = (code: string, status: number) =>
    NextResponse.json({ error: code }, { status, headers });
  return {
    async list(req: NextRequest) {
      try {
        if (!(await readSession(req, 'demo-b', options?.db)))
          return error('LIBRARY_LOGIN_REQUIRED', 401);
        const catalog = await Promise.all(
          materials.map(async (material) => {
            const file = await stat(path.join(directory, material.file));
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
        const data = await readFile(path.join(directory, material.file));
        const download =
          material.format !== 'PDF' || req.nextUrl.searchParams.get('download') === '1';
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

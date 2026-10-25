import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function publicAssets() {
  const manifests = [
    ['scripts/student-artifact-hashes.json', 'zk/student'],
    ['scripts/ocr-artifact-hashes.json', 'ocr'],
  ] as const;
  const entries: { path: string; sha256: string; source: string }[] = [];
  for (const [manifest, prefix] of manifests) {
    const values = JSON.parse(
      await readFile(path.join(repositoryRoot, manifest), 'utf8'),
    ) as Record<string, string>;
    for (const [name, sha256] of Object.entries(values)) {
      if (!/^[\w.-]+$/.test(name) || !/^[a-f0-9]{64}$/.test(sha256))
        throw new Error('Invalid public artifact manifest');
      entries.push({
        path: `${prefix}/${name}`,
        sha256,
        source: path.join(repositoryRoot, 'apps/demo-a/public', prefix, name),
      });
    }
  }
  return entries;
}
export function checkAsset(bytes: Uint8Array, sha256: string) {
  if (createHash('sha256').update(bytes).digest('hex') !== sha256)
    throw new Error('PUBLIC_ARTIFACT_HASH_MISMATCH');
}
export async function prepareAssets(app: 'demo-a' | 'demo-b', baseURL?: string) {
  const destination = path.join(repositoryRoot, 'apps', app, 'public');
  if (baseURL && new URL(baseURL).protocol !== 'https:')
    throw new Error('ARTIFACT_BASE_URL must use HTTPS');
  for (const entry of await publicAssets()) {
    const target = path.join(destination, entry.path);
    let bytes: Uint8Array | undefined;
    try {
      const existing = await readFile(target);
      checkAsset(existing, entry.sha256);
      bytes = existing;
    } catch {}
    if (!bytes) {
      if (baseURL) {
        const response = await fetch(baseURL.replace(/\/$/, '') + '/' + entry.path, {
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw new Error('PUBLIC_ARTIFACT_DOWNLOAD_FAILED');
        bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        try {
          bytes = await readFile(entry.source);
        } catch {
          throw new Error(
            'Public assets missing: set ARTIFACT_BASE_URL or prepare local student/OCR artifacts',
          );
        }
      }
      checkAsset(bytes, entry.sha256);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  }
  await copyFile(
    path.join(repositoryRoot, 'fixtures/student-card.png'),
    path.join(destination, 'student-card.png'),
  );
}

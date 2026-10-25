import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { storageClient } from '../packages/shared/src/storage';
import { materialCatalog } from '../packages/shared/src/materials';
import { publicAssets, checkAsset, repositoryRoot } from './public-assets';
const storage = storageClient();
const artifactBucket = process.env.SUPABASE_ARTIFACTS_BUCKET ?? 'proofpass-artifacts';
const materialBucket = process.env.SUPABASE_MATERIALS_BUCKET ?? 'proofpass-materials';
async function ensureBucket(id: string, isPublic: boolean) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid storage bucket');
  const buckets = await (await storage.request('bucket')).json();
  const existing = buckets.find((b: { id: string }) => b.id === id);
  if (existing) {
    if (existing.public !== isPublic)
      throw new Error(
        'Existing bucket visibility is incorrect; refusing to change it automatically',
      );
    return;
  }
  await storage.request('bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name: id, public: isPublic }),
  });
}
await ensureBucket(artifactBucket, true);
await ensureBucket(materialBucket, false);
// Version the complete manifest. Updating assets cannot silently overwrite an older deployment's key.
const { createHash } = await import('node:crypto');
const manifest = await publicAssets();
const release = createHash('sha256')
  .update(JSON.stringify(manifest.map(({ path, sha256 }) => ({ path, sha256 }))))
  .digest('hex')
  .slice(0, 16);
const encode = (key: string) => key.split('/').map(encodeURIComponent).join('/');
for (const entry of manifest) {
  const bytes = await readFile(entry.source);
  checkAsset(bytes, entry.sha256);
  const type = entry.path.endsWith('.wasm')
    ? 'application/wasm'
    : entry.path.endsWith('.json')
      ? 'application/json'
      : entry.path.endsWith('.js')
        ? 'application/javascript'
        : 'application/octet-stream';
  await storage.request(`object/${artifactBucket}/${release}/${encode(entry.path)}`, {
    method: 'POST',
    headers: { 'Content-Type': type, 'cache-control': '31536000', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
}
for (const material of materialCatalog) {
  const bytes = await readFile(
    path.join(repositoryRoot, 'apps/demo-b/.local/library', material.file),
  );
  await storage.request(`object/${materialBucket}/${encode(material.file)}`, {
    method: 'POST',
    headers: { 'Content-Type': material.type, 'cache-control': '0', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
}
const base =
  process.env.SUPABASE_URL!.replace(/\/$/, '') +
  `/storage/v1/object/public/${artifactBucket}/${release}`;
console.log('Uploaded verified public artifacts and private materials.');
console.log(`ARTIFACT_BASE_URL=${base}`);

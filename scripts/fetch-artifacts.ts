import { mkdir, writeFile, link, copyFile, rename } from 'node:fs/promises';
import { createWriteStream, existsSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { artifactUrls } from '@anon-aadhaar/core';
import hashes from './artifact-hashes.json';
await mkdir('.local/zk', { recursive: true });
const files = [
  ['aadhaar-verifier.wasm', artifactUrls.v2.wasm],
  ['circuit_final.zkey', artifactUrls.v2.zkey],
  ['vkey.json', artifactUrls.v2.vk],
];
const manifest = [];
for (const [name, url] of files) {
  const path = `.local/zk/${name}`;
  if (!existsSync(path)) {
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`Artifact download failed: ${r.status}`);
    console.log(`Downloading ${name} (${r.headers.get('content-length') ?? 'unknown'} bytes)`);
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(path + '.partial'));
    await rename(path + '.partial', path);
  }
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  const digest = hash.digest('hex');
  if (digest !== hashes[name as keyof typeof hashes])
    throw new Error(`Artifact hash mismatch: ${name}. Refusing to use changed artifacts.`);
  manifest.push({ name, url, sha256: digest });
  for (const app of ['demo-a', 'demo-b']) {
    const directory = `apps/${app}/public/zk`;
    await mkdir(directory, { recursive: true });
    try {
      await link(path, `${directory}/${name}`);
    } catch {
      await copyFile(path, `${directory}/${name}`);
    }
  }
}
await writeFile('.local/zk/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Public artifacts cached; hashes recorded in .local/zk/manifest.json');

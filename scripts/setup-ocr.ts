import { copyFile, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('.local/ocr', { recursive: true });
const language = '.local/ocr/eng.traineddata.gz';
try {
  await readFile(language);
} catch {
  const r = await fetch('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz');
  if (!r.ok) throw new Error('OCR language download failed');
  await writeFile(language, new Uint8Array(await r.arrayBuffer()));
}
const files: [string, string][] = [
  ['worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
  ['eng.traineddata.gz', language],
];
for (const file of await readdir('node_modules/tesseract.js-core'))
  if (/^tesseract-core.*\.(wasm|js)$/.test(file))
    files.push([file, `node_modules/tesseract.js-core/${file}`]);
const hashes: Record<string, string> = {};
for (const [name, src] of files) {
  hashes[name] = createHash('sha256')
    .update(await readFile(src))
    .digest('hex');
  for (const app of ['demo-a', 'demo-b']) {
    await mkdir(`apps/${app}/public/ocr`, { recursive: true });
    await copyFile(src, `apps/${app}/public/ocr/${name}`);
  }
}
await writeFile('scripts/ocr-artifact-hashes.json', JSON.stringify(hashes, null, 2) + '\n');
console.log('OCR assets copied locally; student images are never sent to an OCR service.');

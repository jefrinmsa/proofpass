import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read: (b: Buffer) => { data: Buffer; width: number; height: number } } };
};
it('all synthetic QR images decode to the exact signed fixture payload', () => {
  for (const name of ['adult', 'underage', 'eighteenth-birthday', 'nineteenth-birthday']) {
    const png = PNG.sync.read(readFileSync(`fixtures/${name}.png`));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(readFileSync(`fixtures/${name}.txt`, 'utf8').trim());
  }
});

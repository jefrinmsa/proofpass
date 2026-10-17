import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
await mkdir('.local', { recursive: true });
await writeFile('.local/signing-private.pem', privateKey, { flag: 'wx', mode: 0o600 });
await writeFile('.local/signing-public.pem', publicKey, { flag: 'wx' });
console.log('Created local signing keys; private key is ignored by Git.');

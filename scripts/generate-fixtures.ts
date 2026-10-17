import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { sign, verify, constants } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { returnNewDateString } from '@anon-aadhaar/core';
import QRCode from 'qrcode';
// Publicly published upstream TEST key; it has no authority outside test-mode verifiers.
const root =
  'https://raw.githubusercontent.com/anon-aadhaar/anon-aadhaar/main/packages/circuits/assets/';
await mkdir('.local/test-assets', { recursive: true });
await mkdir('fixtures', { recursive: true });
async function asset(name: string) {
  const path = `.local/test-assets/${name}`;
  try {
    return await readFile(path, 'utf8');
  } catch {
    const r = await fetch(root + name);
    if (!r.ok) throw new Error(`Unable to fetch ${name}: ${r.status}`);
    const text = await r.text();
    await writeFile(path, text);
    return text;
  }
}
const privateKey = await asset('testPrivateKey.pem');
const certificate = await asset('testCertificate.pem');
const stamp = returnNewDateString();
const year = Number(stamp.slice(0, 4)),
  month = stamp.slice(4, 6),
  day = stamp.slice(6, 8);
const cases = [
  ['adult', '01-01-1990'],
  ['underage', `01-01-${year - 12}`],
  ['eighteenth-birthday', `${day}-${month}-${year - 18}`],
  ['nineteenth-birthday', `${day}-${month}-${year - 19}`],
];
const photo = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37 + 17) % 254));
for (const [name, dob] of cases) {
  const fields = [
    'V2',
    '0',
    `1234${stamp}`,
    'SYNTHETIC STUDENT',
    dob,
    'F',
    'DEMO CARE',
    'DEMO DISTRICT',
    'DEMO LANDMARK',
    '1',
    'DEMO LOCATION',
    '110001',
    'DEMO POST',
    'Delhi',
    'DEMO STREET',
    'DEMO SUBDISTRICT',
    'DEMO VTC',
    '1234',
  ];
  const data = Buffer.concat([
    ...fields.flatMap((f) => [Buffer.from(f), Buffer.from([255])]),
    photo,
  ]);
  const signature = sign('RSA-SHA256', data, {
    key: privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  });
  if (!verify('RSA-SHA256', data, certificate, signature))
    throw new Error('Synthetic signature failed');
  const qr = BigInt(
    '0x' + deflateSync(Buffer.concat([data, signature])).toString('hex'),
  ).toString();
  await writeFile(`fixtures/${name}.txt`, qr + '\n');
  await QRCode.toFile(`fixtures/${name}.png`, [{ data: qr, mode: 'numeric' }], {
    scale: 8,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
}
for (const app of ['demo-a', 'demo-b']) {
  await mkdir(`apps/${app}/public`, { recursive: true });
  await writeFile(`apps/${app}/public/testCertificate.pem`, certificate);
}
await writeFile(
  'fixtures/manifest.json',
  JSON.stringify(
    {
      environment: 'test',
      signedAtIST: stamp,
      cases: cases.map(([name, dob]) => ({
        name,
        dob,
        expectedAgeFlag: name === 'adult' || name === 'nineteenth-birthday' ? '1' : '0',
      })),
    },
    null,
    2,
  ),
);
console.log(
  'Generated four synthetic signed QR payloads and public test certificates. No real Aadhaar data.',
);

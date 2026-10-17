import { readFile, writeFile } from 'node:fs/promises';
import { groth16 } from 'snarkjs';
import { studentCrypto } from '../packages/shared/src/student-crypto';
const c = await studentCrypto();
const wallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const secret = '1234567890123456789012345678901234567890';
const expiry = 1814399999;
const leaf = c.leaf('CSE2026001', expiry, wallet, c.hash([secret]));
const tree = c.tree([leaf]);
const input = {
  root: tree.root,
  scope: '123456',
  wallet: BigInt(wallet).toString(),
  validUntil: Math.floor(Date.now() / 1000) + 28000,
  signalHash: '42',
  rollHash: c.rollHash('CSE2026001'),
  expiry,
  secret,
  ...tree.path(0),
};
const start = performance.now();
const result = await groth16.fullProve(
  input,
  '.local/student-zk/student_js/student.wasm',
  '.local/student-zk/student.zkey',
  undefined,
  { memorySize: 128 },
  { singleThread: true },
);
const key = JSON.parse(await readFile('.local/student-zk/vkey.json', 'utf8'));
if (!(await groth16.verify(key, result.publicSignals, result.proof)))
  throw new Error('Student proof invalid');
const args = JSON.parse(
  '[' + (await groth16.exportSolidityCallData(result.proof, result.publicSignals)) + ']',
);
await writeFile(
  '.local/student-proof.json',
  JSON.stringify(
    {
      groth16: args
        .slice(0, 3)
        .flat(2)
        .map((v: string) => BigInt(v).toString()),
      publicSignals: result.publicSignals,
    },
    null,
    2,
  ),
);
await writeFile('.local/student-witness.json', JSON.stringify(input));
const measurement = {
  seconds: (performance.now() - start) / 1000,
  publicSignals: result.publicSignals,
};
await writeFile('.local/student-measurement.json', JSON.stringify(measurement, null, 2));
console.log(measurement);
process.exit(0);

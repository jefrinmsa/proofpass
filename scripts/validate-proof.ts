import { readFile, writeFile } from 'node:fs/promises';
import {
  init,
  ArtifactsOrigin,
  generateArgs,
  prove,
  verify,
  packGroth16Proof,
} from '@anon-aadhaar/core';
const name = process.argv[2] ?? 'adult';
await init({
  wasmURL: '.local/zk/aadhaar-verifier.wasm',
  zkeyURL: '.local/zk/circuit_final.zkey',
  vkeyURL: process.cwd() + '/.local/zk/vkey.json',
  artifactsOrigin: ArtifactsOrigin.local,
});
const args = await generateArgs({
  qrData: (await readFile(`fixtures/${name}.txt`, 'utf8')).trim(),
  certificateFile: await readFile('apps/demo-a/public/testCertificate.pem', 'utf8'),
  nullifierSeed: 123456n,
  signal: '42',
  fieldsToRevealArray: ['revealAgeAbove18'],
});
const start = performance.now();
const result = await prove(args, (state) => console.log(state));
if (!(await verify(result, true))) throw new Error('Generated proof failed verification');
const expected = name === 'adult' || name === 'nineteenth-birthday' ? '1' : '0';
if (result.proof.ageAbove18 !== expected) throw new Error(`Age flag mismatch for ${name}`);
const proof = {
  nullifierSeed: result.proof.nullifierSeed,
  nullifier: result.proof.nullifier,
  timestamp: result.proof.timestamp,
  signal: '42',
  reveal: [result.proof.ageAbove18, result.proof.gender, result.proof.pincode, result.proof.state],
  groth16: packGroth16Proof(result.proof.groth16Proof).map(String),
};
await writeFile(`.local/${name}-proof.json`, JSON.stringify(proof, null, 2));
const report = {
  fixture: name,
  valid: true,
  ageAbove18: result.proof.ageAbove18,
  seconds: (performance.now() - start) / 1000,
};
await writeFile(`.local/${name}-measurement.json`, JSON.stringify(report, null, 2));
console.log(report);
// snarkjs worker threads otherwise keep this one-shot validation command alive.
process.exit(0);

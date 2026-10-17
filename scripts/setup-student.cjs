// Local educational ceremony. Independently audited setup is required for production.
const { spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const path = require('node:path');
const dir = '.local/student-zk';
mkdirSync(dir, { recursive: true });
function run(file, args) {
  const r = spawnSync(process.execPath, [file, ...args], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run('scripts/compile-student.cjs', []);
const snark = 'node_modules/snarkjs/cli.js';
if (!existsSync(`${dir}/pot14_final.ptau`)) {
  run(snark, ['powersoftau', 'new', 'bn128', '14', `${dir}/pot0.ptau`]);
  run(snark, [
    'powersoftau',
    'contribute',
    `${dir}/pot0.ptau`,
    `${dir}/pot1.ptau`,
    '--name=Local educational contribution',
    `-e=${randomBytes(64).toString('hex')}`,
  ]);
  run(snark, ['powersoftau', 'prepare', 'phase2', `${dir}/pot1.ptau`, `${dir}/pot14_final.ptau`]);
}
run(snark, [
  'groth16',
  'setup',
  `${dir}/student.r1cs`,
  `${dir}/pot14_final.ptau`,
  `${dir}/initial.zkey`,
]);
run(snark, [
  'zkey',
  'contribute',
  `${dir}/initial.zkey`,
  `${dir}/student.zkey`,
  '--name=Local educational phase 2',
  `-e=${randomBytes(64).toString('hex')}`,
]);
run(snark, [
  'zkey',
  'verify',
  `${dir}/student.r1cs`,
  `${dir}/pot14_final.ptau`,
  `${dir}/student.zkey`,
]);
run(snark, ['zkey', 'export', 'verificationkey', `${dir}/student.zkey`, `${dir}/vkey.json`]);
run(snark, ['zkey', 'export', 'solidityverifier', `${dir}/student.zkey`, `${dir}/Verifier.sol`]);
const source = readFileSync(`${dir}/Verifier.sol`, 'utf8').replace(
  'contract Groth16Verifier',
  'contract StudentGroth16Verifier',
);
writeFileSync('contracts/StudentGroth16Verifier.sol', source);
const hashes = {};
for (const [name, src] of Object.entries({
  'student.wasm': `${dir}/student_js/student.wasm`,
  'student.zkey': `${dir}/student.zkey`,
  'vkey.json': `${dir}/vkey.json`,
})) {
  hashes[name] = createHash('sha256').update(readFileSync(src)).digest('hex');
  for (const app of ['demo-a', 'demo-b']) {
    const out = `apps/${app}/public/zk/student`;
    mkdirSync(out, { recursive: true });
    copyFileSync(src, path.join(out, name));
  }
}
writeFileSync('scripts/student-artifact-hashes.json', JSON.stringify(hashes, null, 2) + '\n');
console.log(
  'Student circuit ready. Local test ceremony only; verifier and artifact hashes must be deployed together.',
);

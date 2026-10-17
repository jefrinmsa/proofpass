import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { groth16 } from 'snarkjs';
it('student circuit rejects changed private enrollment data, wallet, expiry and paths', async () => {
  const witness = JSON.parse(await readFile('.local/student-witness.json', 'utf8'));
  const prove = (overrides: object) =>
    groth16.fullProve(
      { ...witness, ...overrides },
      '.local/student-zk/student_js/student.wasm',
      '.local/student-zk/student.zkey',
      undefined,
      { memorySize: 128 },
      { singleThread: true },
    );
  for (const alteration of [
    { rollHash: '999' },
    { expiry: 1 },
    { expiry: Number(witness.validUntil) - 1 },
    { wallet: '123' },
    { secret: '456' },
    { siblings: Array(8).fill('1') },
    { directions: [2, ...witness.directions.slice(1)] },
    { root: '123' },
  ])
    await expect(prove(alteration)).rejects.toThrow();
  // Inclusive expiry boundary: validUntil equal to the authorized expiry is allowed.
  const positive = await prove({ validUntil: witness.expiry });
  const key = JSON.parse(await readFile('.local/student-zk/vkey.json', 'utf8'));
  expect(await groth16.verify(key, positive.publicSignals, positive.proof)).toBe(true);
}, 60000);

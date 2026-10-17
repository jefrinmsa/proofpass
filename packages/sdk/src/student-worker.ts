import { groth16 } from 'snarkjs';
import { studentCrypto } from '../../shared/src/student-crypto';
import type { StudentCredential, StudentChallenge } from '@zk-auth/shared';
self.onmessage = async (
  e: MessageEvent<{
    credential: StudentCredential;
    challenge: StudentChallenge;
    leaves: string[];
    wasm: string;
    zkey: string;
  }>,
) => {
  try {
    const { credential: c, challenge: q, leaves, wasm, zkey } = e.data;
    const { hash, leaf, rollHash, tree } = await studentCrypto();
    const expected = leaf(c.roll, c.expiry, c.wallet, hash([c.secret]));
    const snapshot = tree(leaves);
    if (snapshot.root !== q.root) throw new Error('REGISTRY_CHANGED');
    if (c.wallet.toLowerCase() !== q.wallet.toLowerCase()) throw new Error('WALLET_MISMATCH');
    if (c.expiry < q.validUntil) throw new Error('CARD_EXPIRED_OR_EXPIRING_SOON');
    const witness = {
      root: q.root,
      scope: q.scope,
      wallet: BigInt(q.wallet).toString(),
      validUntil: q.validUntil,
      signalHash: q.signal,
      rollHash: rollHash(c.roll),
      expiry: c.expiry,
      secret: c.secret,
      ...snapshot.path(leaves.indexOf(expected)),
    };
    const { proof, publicSignals } = await groth16.fullProve(
      witness,
      wasm,
      zkey,
      undefined,
      { memorySize: 128 },
      { singleThread: true },
    );
    const args = JSON.parse(
      '[' + (await groth16.exportSolidityCallData(proof, publicSignals)) + ']',
    );
    self.postMessage({
      proof: {
        groth16: args
          .slice(0, 3)
          .flat(2)
          .map((v: string) => BigInt(v).toString()),
        publicSignals,
      },
    });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : 'PROOF_GENERATION_FAILED' });
  }
};

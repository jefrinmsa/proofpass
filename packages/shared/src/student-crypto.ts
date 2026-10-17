import { buildPoseidon } from 'circomlibjs';
import { keccak256, stringToHex } from 'viem';
import { FIELD } from './student';
let ready: ReturnType<typeof buildPoseidon> | undefined;
export async function studentCrypto() {
  const poseidon = await (ready ??= buildPoseidon());
  const hash = (values: (string | bigint | number)[]) =>
    poseidon.F.toString(poseidon(values.map(BigInt)));
  const rollHash = (roll: string) => (BigInt(keccak256(stringToHex(roll))) % FIELD).toString();
  const leaf = (roll: string, expiry: number, wallet: string, secretCommitment: string) =>
    hash([rollHash(roll), expiry, BigInt(wallet), secretCommitment]);
  function tree(leaves: string[]) {
    if (leaves.length > 256) throw new Error('REGISTRY_FULL');
    const layers: string[][] = [Array.from({ length: 256 }, (_, i) => leaves[i] ?? '0')];
    for (let d = 0; d < 8; d++) {
      const prev = layers[d];
      layers.push(
        Array.from({ length: prev.length / 2 }, (_, i) => hash([prev[i * 2], prev[i * 2 + 1]])),
      );
    }
    return {
      root: layers[8][0],
      path(index: number) {
        if (index < 0 || index >= leaves.length) throw new Error('ENROLLMENT_NOT_ACTIVE');
        const siblings: string[] = [];
        const directions: number[] = [];
        for (let d = 0; d < 8; d++) {
          siblings.push(layers[d][index ^ 1]);
          directions.push(index % 2);
          index = Math.floor(index / 2);
        }
        return { siblings, directions };
      },
    };
  }
  return { hash, rollHash, leaf, tree };
}

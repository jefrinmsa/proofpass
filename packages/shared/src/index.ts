import { z } from 'zod';
import { keccak256, stringToHex, type Address } from 'viem';
export * from './student';

export const EDUCATIONAL_NOTICE = 'Test credentials — educational demonstration';
export const AGE_POLICY = 'Completed age greater than 18 (19+), at the QR signing date';
export const scalar = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78)
  .refine(
    (v) =>
      BigInt(v) < 21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    'Outside scalar field',
  );
const coordinate = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78)
  .refine(
    (v) =>
      BigInt(v) < 21888242871839275222246405745257275088696311157297823662689037894645226208583n,
    'Outside base field',
  );
export const address = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((v) => v.toLowerCase() as Address);
export const proofSchema = z
  .object({
    nullifierSeed: scalar,
    nullifier: scalar,
    timestamp: scalar,
    signal: z
      .string()
      .regex(/^(0|[1-9][0-9]*)$/)
      .max(78)
      .refine((v) => BigInt(v) < 2n ** 256n),
    reveal: z.tuple([scalar, scalar, scalar, scalar]),
    groth16: z.tuple([
      coordinate,
      coordinate,
      coordinate,
      coordinate,
      coordinate,
      coordinate,
      coordinate,
      coordinate,
    ]),
  })
  .strict();
export type AuthProof = z.infer<typeof proofSchema>;
export interface Challenge {
  id: string;
  appId: string;
  origin: string;
  wallet: Address;
  chainId: number;
  verifier: Address;
  nonce: string;
  expiresAt: string;
  nullifierSeed: string;
  message: string;
  signal: string;
}
export function challengeMessage(c: Omit<Challenge, 'message' | 'signal'>): string {
  return [
    'Aadhaar ZK demo authentication v1',
    `Application: ${c.appId}`,
    `Origin: ${c.origin}`,
    `Wallet: ${c.wallet}`,
    `Chain: ${c.chainId}`,
    `Verifier: ${c.verifier}`,
    `Challenge: ${c.id}`,
    `Nonce: ${c.nonce}`,
    `Expires: ${c.expiresAt}`,
    `Nullifier seed: ${c.nullifierSeed}`,
    'Environment: test',
  ].join('\n');
}
export function signalFor(message: string): string {
  return BigInt(keccak256(stringToHex(message))).toString();
}
export const authAbi = [
  {
    type: 'function',
    name: 'verify',
    stateMutability: 'view',
    inputs: [
      { name: 'nullifierSeed', type: 'uint256' },
      { name: 'nullifier', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'signal', type: 'uint256' },
      { name: 'reveal', type: 'uint256[4]' },
      { name: 'groth16', type: 'uint256[8]' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'demonstrate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nullifierSeed', type: 'uint256' },
      { name: 'nullifier', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'signal', type: 'uint256' },
      { name: 'reveal', type: 'uint256[4]' },
      { name: 'groth16', type: 'uint256[8]' },
    ],
    outputs: [],
  },
] as const;
export function proofArgs(p: AuthProof) {
  return [
    BigInt(p.nullifierSeed),
    BigInt(p.nullifier),
    BigInt(p.timestamp),
    BigInt(p.signal),
    p.reveal.map(BigInt) as [bigint, bigint, bigint, bigint],
    p.groth16.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
  ] as const;
}

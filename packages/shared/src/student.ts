import { z } from 'zod';
import { keccak256, stringToHex } from 'viem';
export const STUDENT_POLICY = 'active-enrollment-unexpired-card-email-wallet-v1';
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const scalar = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78)
  .refine((v) => BigInt(v) < FIELD);
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase() as `0x${string}`);
export const studentProofSchema = z
  .object({
    publicSignals: z.tuple([scalar, scalar, scalar, scalar, scalar, scalar, scalar]),
    groth16: z
      .array(
        z
          .string()
          .regex(/^(0|[1-9][0-9]*)$/)
          .max(78)
          .refine(
            (v) =>
              BigInt(v) <
              21888242871839275222246405745257275088696311157297823662689037894645226208583n,
          ),
      )
      .length(8),
  })
  .strict();
export type StudentProof = z.infer<typeof studentProofSchema>;
export const studentCredentialSchema = z
  .object({
    version: z.literal('proofpass-student-v1'),
    roll: z.string().regex(/^[A-Z0-9-]{3,40}$/),
    expiry: z.number().int().positive().max(4102444800),
    wallet: address,
    secret: scalar,
  })
  .strict();
export type StudentCredential = z.infer<typeof studentCredentialSchema>;
export interface StudentChallenge {
  id: string;
  appId: string;
  origin: string;
  wallet: `0x${string}`;
  chainId: number;
  verifier: `0x${string}`;
  root: string;
  scope: string;
  validUntil: number;
  expiresAt: string;
  nonce: string;
  message: string;
  signal: string;
}
export function studentMessage(c: Omit<StudentChallenge, 'message' | 'signal'>) {
  return 'ProofPass student authentication v1\n' + JSON.stringify(c);
}
export function studentSignal(message: string) {
  return (BigInt(keccak256(stringToHex(message))) % FIELD).toString();
}
export const studentAbi = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'verifier',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'registryRoot',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setRegistryRoot',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'root', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'verify',
    stateMutability: 'view',
    inputs: [
      { name: 'proof', type: 'uint256[8]' },
      { name: 'signals', type: 'uint256[7]' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'demonstrate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proof', type: 'uint256[8]' },
      { name: 'signals', type: 'uint256[7]' },
    ],
    outputs: [],
  },
] as const;
export function studentProofArgs(p: StudentProof) {
  return [
    p.groth16.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    p.publicSignals.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint],
  ] as const;
}

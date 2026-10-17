import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createPublicClient, createWalletClient, http, getAddress } from 'viem';
import { hardhat } from 'viem/chains';
import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';
import { authAbi, proofArgs, studentAbi, studentProofArgs } from '@zk-auth/shared';
import { testPublicKeyHash } from '@anon-aadhaar/core';
import { PgStore } from './store';
import { buildServer } from './server';
function required(k: string) {
  const value = process.env[k];
  if (!value) throw new Error(`Missing ${k}`);
  return value;
}
const chainId = Number(required('CHAIN_ID'));
if (![31337, 11155111].includes(chainId))
  throw new Error('Only local Hardhat and Sepolia are supported');
const verifier = getAddress(required('VERIFIER_ADDRESS')).toLowerCase() as `0x${string}`;
const client = createPublicClient({
  transport: http(required('RPC_URL'), { timeout: 15000, retryCount: 0 }),
});
if ((await client.getChainId()) !== chainId) throw new Error('RPC chain does not match CHAIN_ID');
const keyAbi = [
  {
    type: 'function',
    name: 'testPublicKeyHash',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;
if (
  (await client.readContract({
    address: verifier,
    abi: keyAbi,
    functionName: 'testPublicKeyHash',
  })) !== BigInt(testPublicKeyHash)
)
  throw new Error('Verifier is not configured with the published test signing key');
const privateKey = await importPKCS8(
  await readFile(required('JWT_PRIVATE_KEY_FILE'), 'utf8'),
  'RS256',
);
const publicKey = await importSPKI(
  await readFile(required('JWT_PUBLIC_KEY_FILE'), 'utf8'),
  'RS256',
);
const kid = required('JWT_KEY_ID');
const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
const pool = new pg.Pool({ connectionString: required('DATABASE_URL') });
const signAssertion = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(required('ISSUER'))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
const studentVerifier = getAddress(
  required('STUDENT_VERIFIER_ADDRESS'),
).toLowerCase() as `0x${string}`;
if (chainId !== 31337 || process.env.STUDENT_LOCAL_ISSUER !== 'true')
  throw new Error('Student issuer currently supports the local college demonstration only');
const issuerWallet = createWalletClient({ chain: hardhat, transport: http(required('RPC_URL')) });
const [issuerAccount] = await issuerWallet.getAddresses();
const server = await buildServer(
  {
    store: new PgStore(pool),
    chainId,
    verifier,
    verifyProof: (p) =>
      client.readContract({
        address: verifier,
        abi: authAbi,
        functionName: 'verify',
        args: proofArgs(p),
      }),
    signAssertion: (claims) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .setIssuer(required('ISSUER'))
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
  },
  { keys: [jwk] },
  {
    db: pool,
    chainId,
    verifier: studentVerifier,
    mailDirectory: process.env.STUDENT_MAIL_DIRECTORY,
    getRoot: async () =>
      String(
        await client.readContract({
          address: studentVerifier,
          abi: studentAbi,
          functionName: 'registryRoot',
        }),
      ),
    setRoot: async (root) => {
      const hash = await issuerWallet.writeContract({
        account: issuerAccount,
        address: studentVerifier,
        abi: studentAbi,
        functionName: 'setRegistryRoot',
        args: [BigInt(root)],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('REGISTRY_UPDATE_FAILED');
    },
    verifyProof: (p) =>
      client.readContract({
        address: studentVerifier,
        abi: studentAbi,
        functionName: 'verify',
        args: studentProofArgs(p),
      }),
    signAssertion,
  },
);
await server.listen({ port: Number(process.env.PORT ?? 4000), host: '127.0.0.1' });
console.log(
  `Authentication API listening on ${server.server.address() ? (process.env.PORT ?? 4000) : 'unknown'} (test credentials only)`,
);
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => {
    void server.close().then(() => pool.end());
  });

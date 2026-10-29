import 'dotenv/config';
import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';
import { createPublicClient, getAddress, http } from 'viem';
import { authAbi, proofArgs } from '@zk-auth/shared';
import {
  createDbPool,
  exactOrigin,
  isCloud,
  requiredEnv,
  secretValue,
} from '@zk-auth/shared/server';
import { createRegistryClient } from '@zk-auth/shared/registry';
import { buildServer } from './server.js';
import { PgStore } from './store.js';
import { createStudentMailer } from './mail.js';
import type { Dependencies } from './service.js';

const cloud = isCloud();
if (cloud && process.env.EMAIL_DELIVERY !== 'smtp')
  throw new Error('Hosted demo requires real SMTP delivery');
const issuer = exactOrigin(requiredEnv('ISSUER'));
if (cloud && !issuer.startsWith('https:')) throw new Error('Hosted issuer must use HTTPS');
const registry = await createRegistryClient().catch(() => {
  // Upstream RPC errors can include provider credentials in their request URL.
  throw new Error(
    'REGISTRY_STARTUP_UNAVAILABLE: check the chain, deployed contracts and owner settings',
  );
});
const otpHashSecret = cloud ? requiredEnv('OTP_HASH_SECRET') : process.env.OTP_HASH_SECRET;
const privateKey = await importPKCS8(
  await secretValue('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_FILE'),
  'RS256',
);
const publicKey = await importSPKI(
  await secretValue('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_FILE'),
  'RS256',
);
const kid = requiredEnv('JWT_KEY_ID');
const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
const pool = createDbPool();
const signAssertion = (claims: Record<string, unknown>) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
let legacy: Dependencies | undefined;
if (!cloud && process.env.ENABLE_LEGACY_AADHAAR !== 'false' && process.env.VERIFIER_ADDRESS) {
  const { testPublicKeyHash } = await import('@anon-aadhaar/core');
  const client = createPublicClient({
    transport: http(requiredEnv('RPC_URL'), { timeout: 15000, retryCount: 0 }),
  });
  const verifier = getAddress(requiredEnv('VERIFIER_ADDRESS')).toLowerCase() as `0x${string}`;
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
    throw new Error('Legacy verifier test signing key mismatch');
  legacy = {
    store: new PgStore(pool),
    chainId: registry.chainId,
    verifier,
    verifyProof: (p) =>
      client.readContract({
        address: verifier,
        abi: authAbi,
        functionName: 'verify',
        args: proofArgs(p),
      }),
    signAssertion,
  };
}
const server = await buildServer(
  legacy,
  { keys: [jwk] },
  {
    db: pool,
    chainId: registry.chainId,
    verifier: registry.verifier,
    mailer: createStudentMailer(),
    otpHashSecret,
    getRoot: registry.getRoot,
    setRoot: registry.setRoot,
    verifyProof: registry.verifyProof,
    signAssertion,
  },
);
await server.listen({
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? (cloud ? '0.0.0.0' : '127.0.0.1'),
});
console.log('ProofPass API ready (educational test credentials only)');
if (!process.env.VERCEL)
  for (const event of ['SIGINT', 'SIGTERM'])
    process.on(event, () => {
      void server.close().then(() => pool.end());
    });
export default server;

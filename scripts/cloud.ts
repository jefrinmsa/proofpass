import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parse } from 'dotenv';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { exactOrigin, requiredEnv, secretValue } from '../packages/shared/src/server';
import { repositoryRoot } from './public-assets';

const file = path.join(repositoryRoot, '.local/cloud.env');
const [action, app] = process.argv.slice(2);
const core = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RPC_URL',
  'REGISTRY_OWNER_PRIVATE_KEY',
];
const exists = async (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );
await mkdir(path.dirname(file), { recursive: true });
if (action === 'init') {
  if (!(await exists(file)))
    await writeFile(file, await readFile(path.join(repositoryRoot, '.env.cloud.example')), {
      mode: 0o600,
    });
}
const env = parse(await readFile(file));
async function save() {
  await writeFile(
    file,
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
}
function requireCore() {
  for (const key of core) requiredEnv(key, env);
  if (env.CHAIN_ID !== '11155111' || env.DEPLOYMENT_ENV !== 'cloud')
    throw new Error('Cloud deployment must explicitly select Sepolia');
}
function run(script: string, args: string[] = [], extra: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env, ...extra },
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Cloud operation failed; later steps were not run');
}
const tsx = 'node_modules/tsx/dist/cli.mjs';
if (action === 'init') {
  const privateFile = path.join(repositoryRoot, '.local/cloud-signing-private.pem');
  const publicFile = path.join(repositoryRoot, '.local/cloud-signing-public.pem');
  const present = await Promise.all([exists(privateFile), exists(publicFile)]);
  if (present[0] !== present[1])
    throw new Error('Incomplete signing key pair; restore the missing file before continuing');
  if (!present[0]) {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    await writeFile(privateFile, keys.privateKey, { mode: 0o600 });
    await writeFile(publicFile, keys.publicKey, { mode: 0o600 });
  }
  env.JWT_PRIVATE_KEY_FILE = privateFile;
  env.JWT_PUBLIC_KEY_FILE = publicFile;
  env.OTP_HASH_SECRET ||= randomBytes(32).toString('hex');
  env.NEXT_PUBLIC_DEPLOYMENT_ENV = 'cloud';
  await save();
  console.log('Private cloud settings initialized. Existing keys and OTP secret were preserved.');
} else if (action === 'check') {
  let missing = false;
  for (const key of core) {
    const ready = Boolean(env[key]?.trim());
    missing ||= !ready;
    console.log(`${key}: ${ready ? 'saved' : 'MISSING'}`);
  }
  if (missing) process.exitCode = 1;
} else if (action === 'deploy-contracts') {
  requireCore();
  if (env.STUDENT_VERIFIER_ADDRESS)
    throw new Error('A verifier is already configured; refusing to replace its proving identity');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(env.RPC_URL, { timeout: 15000, retryCount: 0 }),
  });
  if ((await client.getChainId()) !== 11155111) throw new Error('RPC is not Sepolia');
  const ownerKey = requiredEnv('REGISTRY_OWNER_PRIVATE_KEY', env);
  if (!/^0x[0-9a-fA-F]{64}$/.test(ownerKey)) throw new Error('Invalid registry owner key format');
  const account = privateKeyToAccount(ownerKey as `0x${string}`);
  if ((await client.getBalance({ address: account.address })) === 0n)
    throw new Error('Dedicated Sepolia wallet needs test ETH');
  run(
    'node_modules/hardhat/internal/cli/cli.js',
    ['run', 'scripts/deploy-student.cjs', '--network', 'sepolia'],
    { SEPOLIA_RPC_URL: env.RPC_URL, DEPLOYER_PRIVATE_KEY: env.REGISTRY_OWNER_PRIVATE_KEY },
  );
  const deployed = JSON.parse(
    await readFile(path.join(repositoryRoot, 'deployments/student-sepolia.json'), 'utf8'),
  );
  if (deployed.chainId !== 11155111) throw new Error('Unexpected deployment chain');
  env.STUDENT_VERIFIER_ADDRESS = deployed.verifier;
  await save();
  console.log('Sepolia verifier address saved in private cloud settings.');
} else if (action === 'database') {
  requireCore();
  requiredEnv('STUDENT_VERIFIER_ADDRESS', env);
  for (const key of ['NEXT_PUBLIC_STUDENT_LAB_URL', 'NEXT_PUBLIC_LIBRARY_URL'])
    exactOrigin(requiredEnv(key, env));
  run(tsx, ['scripts/migrate.ts']);
  run(tsx, ['scripts/student-admin.ts', 'seed']);
  run(tsx, ['scripts/student-admin.ts', 'email', 'CSE2026001', requiredEnv('SMTP_USER', env)]);
  run(tsx, ['scripts/register-app.ts', 'demo-a', env.NEXT_PUBLIC_STUDENT_LAB_URL]);
  run(tsx, ['scripts/register-app.ts', 'demo-b', env.NEXT_PUBLIC_LIBRARY_URL]);
} else if (action === 'environment') {
  requireCore();
  if (!['api', 'demo-a', 'demo-b'].includes(app)) throw new Error('Specify api, demo-a or demo-b');
  const api = exactOrigin(requiredEnv('ISSUER', env));
  if (!api.startsWith('https://')) throw new Error('Hosted issuer must use HTTPS');
  const result: Record<string, string> = {
    DEPLOYMENT_ENV: 'cloud',
    NODE_ENV: 'production',
    DATABASE_URL: env.DATABASE_URL,
    DB_POOL_MAX: '3',
  };
  if (env.DATABASE_SSL_CA) result.DATABASE_SSL_CA = env.DATABASE_SSL_CA;
  if (app === 'api') {
    for (const key of [
      'CHAIN_ID',
      'RPC_URL',
      'REGISTRY_OWNER_PRIVATE_KEY',
      'STUDENT_VERIFIER_ADDRESS',
      'ISSUER',
      'JWT_KEY_ID',
      'OTP_HASH_SECRET',
      'EMAIL_DELIVERY',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_FROM',
    ])
      result[key] = requiredEnv(key, env);
    for (const key of ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY', 'SMTP_PASSWORD'])
      result[key] = await secretValue(key, key + '_FILE', env);
    result.ENABLE_LEGACY_AADHAAR = 'false';
  } else {
    result.AUTH_ISSUER = api;
    result.APP_ORIGIN = exactOrigin(
      requiredEnv(
        app === 'demo-a' ? 'NEXT_PUBLIC_STUDENT_LAB_URL' : 'NEXT_PUBLIC_LIBRARY_URL',
        env,
      ),
    );
    for (const key of ['NEXT_PUBLIC_STUDENT_LAB_URL', 'NEXT_PUBLIC_LIBRARY_URL'])
      result[key] = exactOrigin(requiredEnv(key, env));
    result.NEXT_PUBLIC_AUTH_API = api;
    result.NEXT_PUBLIC_CHAIN_ID = '11155111';
    result.NEXT_PUBLIC_DEPLOYMENT_ENV = 'cloud';
    result.NEXT_PUBLIC_RPC_URL = requiredEnv('NEXT_PUBLIC_RPC_URL', env);
    result.ARTIFACT_BASE_URL = requiredEnv('ARTIFACT_BASE_URL', env);
    if (app === 'demo-b')
      for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_MATERIALS_BUCKET'])
        result[key] = requiredEnv(key, env);
    if (app === 'demo-b') result.MATERIAL_STORAGE = 'supabase';
  }
  const target = path.join(repositoryRoot, `.local/vercel-${app}.env`);
  await writeFile(
    target,
    Object.entries(result)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log(
    `Prepared private Vercel settings for ${app}. Import .local/vercel-${app}.env into that project only.`,
  );
} else throw new Error('Use init, check, deploy-contracts, database or environment APP');

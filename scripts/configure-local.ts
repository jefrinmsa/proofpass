import { readFile, writeFile } from 'node:fs/promises';
const deployment = JSON.parse(await readFile('deployments/localhost.json', 'utf8'));
let env: string;
try {
  env = await readFile('.env', 'utf8');
} catch {
  env = await readFile('.env.example', 'utf8');
}
function set(key: string, value: string) {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, 'm').test(env)
    ? env.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : env + '\n' + line;
}
set('VERIFIER_ADDRESS', deployment.verifier);
set('CHAIN_ID', '31337');
set('RPC_URL', 'http://127.0.0.1:8545');
if (process.argv.includes('--embedded'))
  set('DATABASE_URL', 'postgres://postgres:postgres@127.0.0.1:5433/postgres');
await writeFile('.env', env);
const database = env.match(/^DATABASE_URL=(.*)$/m)?.[1];
for (const app of ['demo-a', 'demo-b'])
  await writeFile(
    `apps/${app}/.env.local`,
    `DATABASE_URL=${database}\nAUTH_ISSUER=http://localhost:4000\nNEXT_PUBLIC_AUTH_API=http://localhost:4000\nNEXT_PUBLIC_LOCAL_ARTIFACTS=true\n`,
  );
console.log(
  'Configured local verifier and app environments. Restart demo servers to load environment changes.',
);

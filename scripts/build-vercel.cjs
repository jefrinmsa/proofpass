const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { existsSync } = require('node:fs');
const root = path.resolve(__dirname, '..');
const app = process.argv[2];
if (!['demo-a', 'demo-b', 'api'].includes(app)) throw new Error('Specify demo-a, demo-b or api');
function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
function build(workspace) {
  const npmCli =
    process.env.npm_execpath ||
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (existsSync(npmCli)) return run([npmCli, 'run', 'build', '-w', workspace]);
  if (process.platform === 'win32')
    throw new Error('Run this build through npm so its CLI path is available');
  const r = spawnSync('npm', ['run', 'build', '-w', workspace], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
build('@zk-auth/shared');
build('@zk-auth/sdk');
if (app !== 'api') run(['node_modules/tsx/dist/cli.mjs', 'scripts/prepare-public-assets.ts', app]);
build(`@zk-auth/${app}`);

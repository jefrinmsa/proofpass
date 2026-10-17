// Avoid circom2's CLI converting WASI paths to Windows backslashes.
const fs = require('node:fs');
const { CircomRunner, bindings } = require('circom2');
const out = '.local/student-compile/' + require('node:crypto').randomUUID();
fs.mkdirSync(out, { recursive: true });
const runner = new CircomRunner({
  args: ['circuits/student.circom', '--r1cs', '--wasm', '--sym', '-l', 'node_modules', '-o', out],
  preopens: { '.': '.' },
  bindings: { ...bindings, fs },
});
runner
  .execute(fs.readFileSync(require.resolve('circom2/circom.wasm')))
  .then(() => {
    fs.mkdirSync('.local/student-zk', { recursive: true });
    fs.cpSync(out, '.local/student-zk', { recursive: true, force: true });
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });

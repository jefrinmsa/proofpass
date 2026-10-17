import { defineConfig } from 'tsup';
const common = {
  format: ['esm', 'cjs'] as ('esm' | 'cjs')[],
  dts: { resolve: ['@zk-auth/shared'] },
  noExternal: ['@zk-auth/shared'],
  splitting: false,
};
export default defineConfig([
  { ...common, entry: ['src/index.ts', 'src/server.ts'] },
  { ...common, format: ['esm'], entry: ['src/react.tsx'], banner: { js: '"use client";' } },
  { ...common, format: ['esm'], dts: false, entry: ['src/proof-worker.ts'] },
]);

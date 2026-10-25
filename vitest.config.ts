import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, fileParallelism: false },
  resolve: {
    alias: {
      '@zk-auth/shared/server': fileURLToPath(
        new URL('./packages/shared/src/server.ts', import.meta.url),
      ),
      '@zk-auth/shared/registry': fileURLToPath(
        new URL('./packages/shared/src/registry.ts', import.meta.url),
      ),
      '@zk-auth/shared/storage': fileURLToPath(
        new URL('./packages/shared/src/storage.ts', import.meta.url),
      ),
      '@zk-auth/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});

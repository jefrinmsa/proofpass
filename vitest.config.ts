import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 },
  resolve: {
    alias: {
      '@zk-auth/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
});

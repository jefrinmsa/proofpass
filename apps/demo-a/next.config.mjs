import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
export default {
  transpilePackages: ['@zk-auth/demo', '@zk-auth/sdk', '@zk-auth/shared'],
  webpack(config, { isServer }) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      readline: false,
      net: false,
      tls: false,
      'pino-pretty': false,
    };
    if (!isServer)
      config.resolve.alias = {
        ...config.resolve.alias,
        snarkjs$: path.join(path.dirname(require.resolve('snarkjs')), 'browser.esm.js'),
      };
    return config;
  },
};

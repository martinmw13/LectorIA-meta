import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Server modules import `server-only` to fail at client import time;
      // tests run on the server, so an empty module is enough.
      'server-only': `${root}vitest.stub.server-only.ts`,
      '@/core': `${root}core`,
      '@/server': `${root}server`,
    },
  },
  test: {
    // Only app tests live here; scripts/ are owned by `node --test`.
    include: ['core/**/*.test.ts', 'server/**/*.test.ts', 'app/**/*.test.{ts,tsx}'],
  },
});

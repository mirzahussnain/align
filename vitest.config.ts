import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Default environment stays `node` for the large deterministic/service test
    // suite. React component tests opt into jsdom per-file via the docblock
    //   // @vitest-environment jsdom
    // so only they pay for a DOM.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    maxWorkers: '50%',
  },
});

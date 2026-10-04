import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});

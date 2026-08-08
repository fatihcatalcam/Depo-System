import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // PGlite her test dosyasinda kendi WebAssembly ornegini acar;
    // is parcacigi havuzunda cakisir, bu yuzden fork havuzu kullaniyoruz.
    pool: 'forks',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});

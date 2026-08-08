import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // Her test dosyasi beforeAll icinde kendi PGlite ornegini acip goc
    // uyguluyor; varsayilan 10 saniye yetmiyor.
    hookTimeout: 60_000,
    // PGlite her test dosyasinda kendi WebAssembly ornegini acar;
    // is parcacigi havuzunda cakisir, bu yuzden fork havuzu kullaniyoruz.
    pool: 'forks',
    // Ayni anda cok sayida WASM Postgres acmak makineyi bogar ve hook'lar
    // zaman asimina ugrar. Dort es zamanli dosya iyi bir denge.
    maxWorkers: 4,
  },
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
});

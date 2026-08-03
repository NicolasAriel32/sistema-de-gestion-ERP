import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Los tests corren sobre `/lib/domain`: lógica pura, sin React, sin
 * Supabase, sin red. Por eso el entorno es `node` y no hay setup de DOM.
 *
 * El alias `@/` replica el de `tsconfig.json`; sin él, los módulos que
 * importan `@/lib/...` no resuelven fuera de Next.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});

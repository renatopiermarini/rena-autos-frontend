import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Both suites cover pure modules — no DOM, no React, no network. Keep it that way:
// if a test here needs a browser environment, it belongs in a different setup.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['{app,components,lib}/**/*.test.ts'],
  },
})

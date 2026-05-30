import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
    // exclude node_modules and generated files
    exclude: ['node_modules', '**/dist/**', 'e2e/**'],
  },
})

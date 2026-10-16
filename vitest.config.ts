import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Pin NODE_ENV for the test run. `react` resolves `act` from its development
    // build only, so an ambient NODE_ENV=production (e.g. exported by a shell or
    // CI job) makes every React component test fail with "act is not a function".
    // Setting it here keeps the suite deterministic regardless of the caller.
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
    // exclude node_modules and generated files
    exclude: ['node_modules', '**/dist/**', 'e2e/**'],
  },
})

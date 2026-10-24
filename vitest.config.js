import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
try {
  const wt = require('node:worker_threads')
  if (typeof wt.markAsUncloneable !== 'function') {
    wt.markAsUncloneable = (obj) => obj
  }
} catch {
  // worker_threads not available in non-node environments
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    execArgv: ['--require', './src/test/polyfill.cjs'],
    testTimeout: 15000,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/**/*.test.*', 'src/test/**'],
      thresholds: {
        lines: 27,
        functions: 12,
        statements: 25,
        branches: 13,
      },
    },
  },
})

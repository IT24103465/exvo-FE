import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
try {
  const wt = require('node:worker_threads')
  if (typeof wt.markAsUncloneable !== 'function') {
    wt.markAsUncloneable = (obj) => obj
  }
} catch {
  // worker_threads not available in jsdom or non-node environments
}

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }),
})

globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, val) => store.set(String(key), String(val)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

afterEach(() => {
  cleanup()
})

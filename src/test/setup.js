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

afterEach(() => {
  cleanup()
})

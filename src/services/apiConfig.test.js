import { describe, expect, test } from 'vitest'
import { API_BASE_URL, BACKEND_UNAVAILABLE_MESSAGE, buildApiUrl } from './apiConfig.js'

describe('API configuration', () => {
  test('uses the local gateway during development by default', () => {
    expect(API_BASE_URL).toBe('http://localhost:5000')
    expect(buildApiUrl('/api/auth/login')).toBe('http://localhost:5000/api/auth/login')
  })

  test('provides the shared unavailable-backend message', () => {
    expect(BACKEND_UNAVAILABLE_MESSAGE).toBe('Backend service is not currently available')
  })
})

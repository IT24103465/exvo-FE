import { describe, expect, test } from 'vitest'
import { API_BASE_URL, BACKEND_UNAVAILABLE_MESSAGE, buildApiUrl } from './apiConfig.js'

describe('API configuration', () => {
  test('uses the local gateway during development by default', () => {
    expect(API_BASE_URL).toBe('http://localhost:5000')
    expect(buildApiUrl('/api/auth/login')).toBe('http://localhost:5000/api/auth/login')
  })

  test('provides a user-facing availability message without implementation details', () => {
    expect(BACKEND_UNAVAILABLE_MESSAGE).toBe('The service is currently unavailable. Please try again shortly.')
  })
})

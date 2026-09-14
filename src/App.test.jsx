import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import App from './App.jsx'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Exvo homepage', () => {
  test('renders the branded homepage and opens the login flow from navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    )

    render(<App />)

    expect(screen.getByText('UPCOMING', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle Navigation Menu' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Navigation Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }))

    await waitFor(() => {
      expect(screen.getByLabelText('EMAIL / USERNAME')).toBeInTheDocument()
      expect(screen.getByLabelText('PASSWORD')).toBeInTheDocument()
    })
  })
})

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

  test('supports login feedback, password visibility, and account mode switching', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ token: 'test-token', fullName: 'Test User' })),
    )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Navigation Menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }))

    expect(screen.queryByRole('button', { name: 'Forgot Password?' })).not.toBeInTheDocument()

    const passwordInput = screen.getByLabelText('PASSWORD')
    expect(passwordInput).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    fireEvent.change(screen.getByLabelText('EMAIL / USERNAME'), { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /LOGIN TO EXVO/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Login successful! Welcome back.'))

    fireEvent.click(screen.getByRole('tab', { name: 'CREATE ACCOUNT' }))
    expect(screen.getByLabelText('FULL NAME')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Register Company' }))
    expect(screen.getByLabelText('COMPANY NAME')).toBeInTheDocument()
    expect(screen.getByLabelText('REGISTRATION NO')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Terms' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Privacy Policy/)).not.toBeInTheDocument()
  })

  test('opens event details and starts the ticket gateway for a catalog event', async () => {
    const event = {
      id: 7,
      title: 'Neon Night',
      artistOrOrganizer: 'The Signal',
      category: 'Concert',
      venue: 'Colombo Arena',
      eventDate: '2026-10-12T19:30:00',
      price: 2500,
      availableTickets: 300,
      imageUrl: '/event.jpg',
      ticketTiersJson: JSON.stringify([{ id: 'standard', name: 'Standard', price: 2500, quantity: 200 }]),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.includes('categories')) return Response.json([{ id: 1, name: 'Concert' }])
        if (url.includes('/profile')) return Response.json({ name: 'Test User', email: 'user@example.com' })
        return Response.json([event])
      }),
    )
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('user', JSON.stringify({ fullName: 'Test User', email: 'user@example.com', role: 'Attendee' }))

    render(<App />)

    const carouselCard = await screen.findByTitle('Click to view details: Neon Night')
    fireEvent.click(carouselCard)
    expect(screen.getByRole('dialog')).toHaveTextContent('Neon Night')
    expect(screen.getByRole('dialog')).toHaveTextContent('Standard')

    fireEvent.click(screen.getByRole('button', { name: /GET TICKETS NOW/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('EXVO SECURE TICKET GATEWAY')
    expect(screen.getByText('Select Ticket Tiers & Quantities')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close ticket booking' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { getAllEvents, getMyEvents, createEvent, updateEvent } from './services/eventService'
import { updateUserProfile } from './services/authService'
import { localDate } from './services/eventDateTime'
import { confirmGeneralBooking, confirmSeatHold, getAttendeeSeatingPlan, getEventAvailability, getMyTickets, holdSeats, releaseSeatHold } from './services/bookingService'

vi.mock('./services/eventService', () => ({
  getAllEvents: vi.fn(),
  getMyEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventVisibility: vi.fn(),
  deleteEvent: vi.fn(),
  getCategories: vi.fn(async () => [{ id: 1, name: 'Concert' }]),
}))
vi.mock('./services/authService', () => ({
  getCurrentUserProfile: vi.fn(async () => null),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
  updateUserProfile: vi.fn(),
  deleteUserAccount: vi.fn(),
}))
vi.mock('./services/bookingService', () => ({
  getAttendeeSeatingPlan: vi.fn(),
  getEventAvailability: vi.fn(),
  holdSeats: vi.fn(),
  confirmGeneralBooking: vi.fn(),
  confirmSeatHold: vi.fn(),
  getMyTickets: vi.fn(),
  releaseSeatHold: vi.fn(),
  getOrganizerSeatingPlan: vi.fn(),
  saveSeatingPlan: vi.fn(),
  bookingPlanToSeatingConfig: vi.fn((plan) => ({ enabled: Boolean(plan?.isVisibleToAttendees), zones: [] })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  getAllEvents.mockResolvedValue([])
  getMyEvents.mockResolvedValue([])
  getAttendeeSeatingPlan.mockResolvedValue(null)
  getEventAvailability.mockResolvedValue(null)
  holdSeats.mockResolvedValue({ holdId: 1, eventId: 1, seatCodes: ['A-01'], expiresAtUtc: new Date(Date.now() + 300000).toISOString() })
  releaseSeatHold.mockResolvedValue(null)
  confirmGeneralBooking.mockResolvedValue({ bookingReference: 'EXVO-GA' })
  confirmSeatHold.mockResolvedValue({ bookingReference: 'EXVO-TEST' })
  getMyTickets.mockResolvedValue([])
})
afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const signIn = () => {
  localStorage.setItem('token', 'organizer-token')
  localStorage.setItem(
    'user',
    JSON.stringify({ id: 11, fullName: 'Shared company', email: 'owner@example.com', role: 'Organizer' }),
  )
}
const openDashboard = () => fireEvent.click(screen.getByRole('button', { name: 'DASHBOARD' }))

test.each(['View full profile', 'Click to view full profile', 'card'])('profile popup opens profile and edit controls through %s', async (title) => {
  signIn()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Open profile options' }))
  fireEvent.click(title === 'card' ? screen.getByTitle('View full profile').parentElement : screen.getByTitle(title))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /Edit Profile/i }))
  expect(within(dialog).getByDisplayValue('Shared company')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close profile' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('hidden navigation profile opens the full profile editor directly', async () => {
  signIn()
  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: 'Toggle Navigation Menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'PROFILE' }))

  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /Edit Profile/i }))
  fireEvent.click(within(dialog).getByRole('button', { name: /Save Changes/i }))

  await waitFor(() => expect(updateUserProfile).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Shared company',
    email: 'owner@example.com',
  })))
})

test.each(['home', 'dashboard', 'details', 'booking'])(
  'expired events are removed from public %s views and retained as hidden in the dashboard',
  async (surface) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-20T18:29:59Z'))
    signIn()
    const event = {
      id: 1,
      organizerId: 11,
      title: 'Ending concert',
      eventDate: '2026-09-21T00:00:00',
      startsAtUtc: '2026-09-20T18:30:00Z',
      availableTickets: 20,
      ticketTiers: [{ id: '1', name: 'General', price: 100, quantity: 20 }],
    }
    getAllEvents.mockResolvedValue([event])
    getMyEvents.mockResolvedValue([event])
    await act(async () => {
      render(<App />)
    })
    const card = screen.getByTitle('Click to view details: Ending concert')
    if (surface === 'dashboard')
      await act(async () => {
        openDashboard()
      })
    if (surface === 'details' || surface === 'booking') {
      fireEvent.click(card)
      if (surface === 'booking') fireEvent.click(screen.getByRole('button', { name: /GET TICKETS NOW/ }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001)
    })
    expect(screen.queryByTitle('Click to view details: Ending concert')).not.toBeInTheDocument()
    if (surface === 'dashboard') {
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getAllByText('Ending concert')).not.toHaveLength(0)
      expect(within(dialog).getByText('HIDDEN')).toBeInTheDocument()
      expect(within(dialog).getByText('TOTAL EVENTS').nextSibling).toHaveTextContent('1')
    } else if (surface !== 'home') {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
    expect(getAllEvents).toHaveBeenCalledTimes(1)
  },
)

test('attendee selects and clears only available database seats and sees live totals', async () => {
  signIn()
  getAllEvents.mockResolvedValue([
    {
      id: 1,
      title: 'Assigned seating event',
      availableTickets: 2,
      ticketTiers: [{ id: 'tier-1', name: 'Premium', price: 2500, quantity: 2 }],
    },
  ])
  getAttendeeSeatingPlan.mockResolvedValue({
    eventId: 1,
    isVisibleToAttendees: true,
    status: 'Published',
    sections: [
      {
        id: 10,
        name: 'Orchestra',
        rowCount: 1,
        seatsPerRow: 2,
        price: 2500,
        seats: [
          { id: 100, seatCode: 'A-01', rowLabel: 'A', seatNumber: 1, ticketTierId: 1, price: 2500, isEnabled: true, status: 'Available' },
          { id: 101, seatCode: 'A-02', rowLabel: 'A', seatNumber: 2, ticketTierId: 1, price: 2500, isEnabled: true, status: 'Held' },
        ],
      },
    ],
  })

  render(<App />)
  await waitFor(() => expect(screen.getByTitle('Click to view details: Assigned seating event')).toBeInTheDocument())
  fireEvent.click(screen.getByTitle('Click to view details: Assigned seating event'))
  fireEvent.click(await screen.findByRole('button', { name: /GET TICKETS NOW/i }))
  expect(await screen.findByRole('button', { name: /CHOOSE SEATS/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /CHOOSE SEATS/i }))

  const unavailableSeat = screen.getByTitle(/Row A, Seat 2/)
  expect(unavailableSeat).toBeDisabled()
  fireEvent.click(screen.getByTitle(/Row A, Seat 1/))
  expect(screen.getByText(/A-01/)).toBeInTheDocument()
  expect(screen.getByText(/2500/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /CONTINUE/i })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /CONTINUE/i }))
  expect(await screen.findByText(/Seats held for you/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /CONFIRM RESERVATION/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Clear Selection/i }))
  expect(screen.getByRole('button', { name: /CONTINUE/i })).toBeDisabled()
})

test('general admission quantity cannot exceed BookingService availability', async () => {
  signIn()
  getAllEvents.mockResolvedValue([
    { id: 2, title: 'General admission event', availableTickets: 50, minPrice: 1200, ticketTiers: [] },
  ])
  getAttendeeSeatingPlan.mockResolvedValue(null)
  getEventAvailability.mockResolvedValue({ eventId: 2, availableSeatCount: 1, tiers: [] })

  render(<App />)
  fireEvent.click(await screen.findByTitle('Click to view details: General admission event'))
  fireEvent.click(await screen.findByRole('button', { name: /GET TICKETS NOW/i }))
  const increase = screen.getByRole('button', { name: '+' })
  expect(increase).toBeDisabled()
  expect(screen.getByText('1')).toBeInTheDocument()
})

test('public lists show skeletons until a successful empty response', async () => {
  const request = deferred()
  getAllEvents.mockReturnValue(request.promise)
  render(<App />)
  expect(screen.getAllByRole('status', { name: 'Loading events' }).length).toBeGreaterThan(0)
  expect(screen.queryByText(/No Events Yet|No Events Found/i)).not.toBeInTheDocument()
  await act(async () => request.resolve([]))
  expect(screen.queryByRole('status', { name: 'Loading events' })).not.toBeInTheDocument()
  expect(screen.getByText('No Events Yet')).toBeInTheDocument()
})

test('failed public requests show errors and retry instead of an empty state', async () => {
  getAllEvents.mockRejectedValueOnce(new Error('offline'))
  render(<App />)
  await screen.findAllByRole('alert')
  expect(screen.queryByText(/No Events Yet|No Events Found/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0])
  await screen.findByText('No Events Yet')
})

test('uses the event title anywhere a missing poster would be shown', async () => {
  signIn()
  const event = {
    id: 8,
    organizerId: 11,
    title: 'Posterless Night',
    eventDate: '2099-10-12T19:30:00',
    ticketTiers: [{ id: '1', name: 'General', price: 100, quantity: 20 }],
  }
  getAllEvents.mockResolvedValue([event])
  getMyEvents.mockResolvedValue([event])
  render(<App />)

  expect((await screen.findAllByRole('img', { name: 'Posterless Night poster' })).length).toBeGreaterThan(1)
  fireEvent.click(screen.getByTitle('Click to view details: Posterless Night'))
  expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'Posterless Night poster' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /GET TICKETS NOW/ }))
  expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'Posterless Night poster' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Close ticket booking' }))
  openDashboard()
  expect(
    await within(screen.getByRole('dialog')).findByRole('img', { name: 'Posterless Night poster' }),
  ).toBeInTheDocument()
})

test('organizer dashboard never falls back to public events with a matching name', async () => {
  signIn()
  getAllEvents.mockResolvedValue([
    {
      id: 22,
      organizerId: 22,
      organizerName: 'Shared company',
      title: 'Other organizer',
      eventDate: '2099-01-01T19:00:00',
    },
  ])
  const request = deferred()
  getMyEvents.mockReturnValue(request.promise)
  render(<App />)
  await screen.findByTitle('Click to view details: Other organizer')
  openDashboard()
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('status', { name: 'Loading events' })).toBeInTheDocument()
  expect(within(dialog).queryByText('Other organizer')).not.toBeInTheDocument()
  expect(within(dialog).queryByText(/No events created/)).not.toBeInTheDocument()
  await act(async () => request.resolve([]))
  expect(within(dialog).getByText(/No events created by you/)).toBeInTheDocument()
  expect(within(dialog).getByText('TOTAL EVENTS').nextSibling).toHaveTextContent('0')
})

test('organizer request failure shows an error and no empty state or counts', async () => {
  signIn()
  getMyEvents.mockRejectedValue(new Error('forbidden'))
  render(<App />)
  openDashboard()
  const dialog = screen.getByRole('dialog')
  await within(dialog).findByRole('alert')
  expect(within(dialog).queryByText(/No events created/)).not.toBeInTheDocument()
  expect(within(dialog).getByText('TOTAL EVENTS').nextSibling).toHaveTextContent('—')
})

test('organizer counts and search use only the scoped response, including hidden events', async () => {
  signIn()
  getMyEvents.mockResolvedValue([
    { id: 1, title: 'My concert', organizerId: 11, availableTickets: 20 },
    { id: 2, title: 'My hidden concert', organizerId: 11, availableTickets: 30, isHidden: true },
  ])
  render(<App />)
  openDashboard()
  const dialog = screen.getByRole('dialog')
  await within(dialog).findAllByText('My concert')
  expect(within(dialog).getByText('TOTAL EVENTS').nextSibling).toHaveTextContent('2')
  expect(within(dialog).getByText('TOTAL PASSES').nextSibling).toHaveTextContent('50')
  fireEvent.change(within(dialog).getByPlaceholderText('Filter events...'), { target: { value: 'hidden' } })
  expect(within(dialog).queryByText('My concert')).not.toBeInTheDocument()
  expect(within(dialog).getAllByText('My hidden concert').length).toBeGreaterThan(0)
})

test('a late response from the previous account cannot replace the current organizer events', async () => {
  signIn()
  const previous = deferred()
  getMyEvents
    .mockReturnValueOnce(previous.promise)
    .mockResolvedValueOnce([{ id: 2, organizerId: 22, title: 'Current account' }])
  render(<App />)
  openDashboard()
  localStorage.setItem('user', JSON.stringify({ id: 22, role: 'Organizer', fullName: 'Next organizer' }))
  fireEvent(window, new window.Event('storage'))
  await screen.findAllByText('Current account')
  await act(async () => previous.resolve([{ id: 1, title: 'Previous account' }]))
  expect(screen.queryByText('Previous account')).not.toBeInTheDocument()
  expect(screen.getAllByText('Current account').length).toBeGreaterThan(0)
})

test('profile menu and panel close on outside click, Escape, navigation and menu actions', async () => {
  signIn()
  render(<App />)
  const toggle = screen.getByRole('button', { name: 'Open profile options' })
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('menu'))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.click(document.body)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'View full profile' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('dialog'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'View full profile' }))
  fireEvent.click(document.body)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  fireEvent(window, new window.Event('popstate'))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  fireEvent.click(toggle)
  openDashboard()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  await waitFor(() => expect(getMyEvents).toHaveBeenCalled())
})

test.each(['create', 'edit'])(
  '%s form restricts dates/times and rejects bypassed past values on submission',
  async (mode) => {
    signIn()
    getMyEvents.mockResolvedValue([
      {
        id: 1,
        organizerId: 11,
        title: 'My concert',
        venue: 'Arena',
        eventDate: '2099-10-12T19:30:00',
        ticketTiers: [{ id: '1', name: 'General', price: 100, quantity: 10 }],
      },
    ])
    render(<App />)
    if (mode === 'create') {
      fireEvent.click(screen.getByRole('button', { name: 'ADD EVENT' }))
    } else {
      openDashboard()
      fireEvent.click(await screen.findByTitle('Edit Event Details'))
    }
    const date = screen.getByLabelText('Event date')
    const time = screen.getByLabelText('Event time')
    expect(date).toHaveAttribute('min', localDate())
    fireEvent.change(date, { target: { value: localDate() } })
    expect(time.getAttribute('min')).toMatch(/^\d{2}:\d{2}$/)
    fireEvent.change(date, { target: { value: '2000-01-01' } })
    fireEvent.submit(date.closest('form'))
    expect(screen.getByText(/Event date and time must be in the future/)).toBeInTheDocument()
    expect(createEvent).not.toHaveBeenCalled()
    expect(updateEvent).not.toHaveBeenCalled()
    fireEvent.change(date, { target: { value: '2099-10-12' } })
    fireEvent.change(time, { target: { value: '19:30' } })
    expect(screen.queryByText(/Event date and time must be in the future/)).not.toBeInTheDocument()
    if (mode === 'edit') {
      fireEvent.submit(date.closest('form'))
      await waitFor(() =>
        expect(updateEvent).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ date: '2099-10-12', time: '19:30', venue: 'Arena' }),
        ),
      )
    }
  },
)

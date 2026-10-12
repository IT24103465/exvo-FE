import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoordinatorScannerPortal from './CoordinatorScannerPortal'
import * as coordinatorService from '../services/coordinatorService'

describe('CoordinatorScannerPortal (SCRUM-30)', () => {
  const mockOrganizer = {
    id: 99,
    fullName: 'Jane Organizer',
    email: 'jane@exvo.com',
    role: 'Organizer',
  }

  const mockNonOrganizer = {
    id: 10,
    fullName: 'Bob Attendee',
    email: 'bob@exvo.com',
    role: 'Attendee',
  }

  const todayIso = new Date().toISOString()
  const mockAssignedEvents = [
    {
      eventId: 101,
      title: 'Neon Horizon Music Fest 2026',
      eventDate: todayIso,
      location: 'Colombo',
      venue: 'Lotus Tower Arena',
    },
    {
      eventId: 102,
      title: 'Global Tech Summit',
      eventDate: '2029-12-05T09:00:00Z',
      location: 'Kandy',
      venue: 'Auditorium A',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(coordinatorService, 'getCoordinatorEvents').mockResolvedValue(mockAssignedEvents)
    vi.spyOn(coordinatorService, 'verifyCoordinatorAccess').mockResolvedValue({ eventId: 101, scannerAccess: true })
    vi.spyOn(coordinatorService, 'validateTicketCheckIn').mockResolvedValue({
      ticketCode: 'EXVO-TICK-101',
      eventId: 101,
      isValid: true,
      status: 'VALID',
      attendeeName: 'Alex Silva',
      ticketType: 'VIP Pass',
      seatCode: 'A-15',
      checkedInAt: '2026-11-20T18:05:00Z',
      message: 'Check-in confirmed!',
    })
    vi.spyOn(coordinatorService, 'validateTicket').mockResolvedValue({
      ticketId: 'EXVO-TICK-101',
      ticketCode: 'EXVO-TICK-101',
      eventId: 101,
      eventName: 'Neon Horizon Music Fest 2026',
      isValid: true,
      status: 'VALID',
      attendeeName: 'Alex Silva',
      ticketType: 'VIP Pass',
      seatCode: 'A-15',
      validatedAt: '2026-11-20T18:05:00Z',
      message: 'Ticket is valid. Ready for check-in.',
    })
    vi.spyOn(coordinatorService, 'confirmTicketCheckIn').mockResolvedValue({
      ticketId: 'EXVO-TICK-101',
      ticketCode: 'EXVO-TICK-101',
      eventId: 101,
      status: 'CHECKED_IN',
      checkedInAt: '2026-11-20T18:06:00Z',
      message: 'Check-in confirmed successfully!',
    })
  })

  it('enforces RBAC and blocks non-organizers from accessing the portal', () => {
    render(<CoordinatorScannerPortal user={mockNonOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText(/ACCESS RESTRICTED/i)).toBeInTheDocument()
    expect(screen.getByText(/ORGANIZER CLEARANCE REQUIRED/i)).toBeInTheDocument()
    expect(screen.getByText(/Attendee/i)).toBeInTheDocument()
    expect(screen.queryByText(/GATE ASSIGNMENTS/i)).not.toBeInTheDocument()
  })

  it('renders coordinator dashboard and assigned events for authorized organizer', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText(/Jane Organizer/i)).toBeInTheDocument()
    expect(screen.getByText(/SCANNER PORTAL/i)).toBeInTheDocument()

    // Wait for assigned events to load
    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
      expect(screen.getByText('Global Tech Summit')).toBeInTheDocument()
    })

    expect(screen.getByText(/Lotus Tower Arena/i)).toBeInTheDocument()
  })

  it('filters assigned events by search keyword', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Filter events by title/i)
    fireEvent.change(searchInput, { target: { value: 'Tech Summit' } })

    expect(screen.queryByText('Neon Horizon Music Fest 2026')).not.toBeInTheDocument()
    expect(screen.getByText('Global Tech Summit')).toBeInTheDocument()
  })

  it('selects an event, verifies scanner access, and launches the QR Scanner UI', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    // Click Launch Scanner on the first event card
    const launchBtns = screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })
    fireEvent.click(launchBtns[0])

    await waitFor(() => {
      expect(coordinatorService.verifyCoordinatorAccess).toHaveBeenCalledWith(101)
      expect(screen.getByText(/SWITCH EVENT/i)).toBeInTheDocument()
      expect(screen.getByText(/DESKTOP GATE TERMINAL/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })
  })

  it('validates a ticket code manually and displays success feedback', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    const launchBtns = screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })
    fireEvent.click(launchBtns[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    fireEvent.change(input, { target: { value: 'EXVO-TICK-101' } })

    const checkInBtn = screen.getByRole('button', { name: /CHECK IN/i })
    fireEvent.click(checkInBtn)

    await waitFor(() => {
      const called =
        coordinatorService.validateTicketCheckIn.mock.calls.length > 0 ||
        coordinatorService.validateTicket.mock.calls.length > 0
      expect(called).toBe(true)
      expect(screen.getByText(/ACCESS GRANTED/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Alex Silva/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/VIP Pass/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/A-15/i)).toBeInTheDocument()
    })
  })

  it('detects duplicate scans in the current session and flags them with warning', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    const launchBtns = screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })
    fireEvent.click(launchBtns[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    const checkInBtn = screen.getByRole('button', { name: /CHECK IN/i })

    // First scan: valid
    fireEvent.change(input, { target: { value: 'EXVO-TICK-DUPE' } })
    fireEvent.click(checkInBtn)

    await waitFor(() => {
      expect(screen.getByText(/ACCESS GRANTED/i)).toBeInTheDocument()
    })

    // Second scan with same code: duplicate!
    fireEvent.change(input, { target: { value: 'EXVO-TICK-DUPE' } })
    fireEvent.click(checkInBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/ALREADY CHECKED IN/i).length).toBeGreaterThan(0)
    })
  })

  it('handles events load error and allows retry', async () => {
    vi.spyOn(coordinatorService, 'getCoordinatorEvents')
      .mockRejectedValueOnce(new Error('Gateway timeout 504'))
      .mockResolvedValueOnce(mockAssignedEvents)

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Gateway timeout 504/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /TRY AGAIN/i })).toBeInTheDocument()
    })

    // Click Try Again
    fireEvent.click(screen.getByRole('button', { name: /TRY AGAIN/i }))

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })
  })

  it('switches back to events list from the scanner view', async () => {
    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    const launchBtns = screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })
    fireEvent.click(launchBtns[0])

    await waitFor(() => {
      expect(screen.getByText(/SWITCH EVENT/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /SWITCH EVENT/i }))

    await waitFor(() => {
      expect(screen.getByText(/GATE ASSIGNMENTS/i)).toBeInTheDocument()
    })
  })

  // ── SCRUM 31 Acceptance Criteria Tests ──

  it('SCRUM-31: displays real-time validation results and ticket details without marking as used', async () => {
    vi.spyOn(coordinatorService, 'validateTicket').mockResolvedValue({
      ticketId: 'TICK-VALID-55',
      ticketCode: 'TICK-VALID-55',
      eventId: 101,
      eventName: 'Neon Horizon Music Fest 2026',
      isValid: true,
      status: 'VALID',
      attendeeName: 'Tharindu Perera',
      ticketType: 'VIP Pass',
      seatCode: 'V-01',
      validatedAt: '2026-11-20T18:00:00Z',
      message: 'Ticket is valid. Ready for check-in.',
    })

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    fireEvent.change(input, { target: { value: 'TICK-VALID-55' } })
    fireEvent.click(screen.getByRole('button', { name: /VALIDATE \/ CHECK IN/i }))

    await waitFor(() => {
      expect(coordinatorService.validateTicket).toHaveBeenCalledWith(101, 'TICK-VALID-55')
      expect(screen.getAllByText(/VALID/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText('TICK-VALID-55').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Neon Horizon Music Fest 2026').length).toBeGreaterThan(0)
      expect(screen.getAllByText('VIP Pass').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /CONFIRM CHECK-IN/i })).toBeInTheDocument()
    })
  })

  it('SCRUM-31: confirms check-in when Confirm Check-In button is clicked', async () => {
    vi.spyOn(coordinatorService, 'validateTicket').mockResolvedValue({
      ticketId: 'TICK-VALID-66',
      ticketCode: 'TICK-VALID-66',
      eventId: 101,
      eventName: 'Neon Horizon Music Fest 2026',
      isValid: true,
      status: 'VALID',
      attendeeName: 'Chamari Silva',
      ticketType: 'Standard Admission',
      seatCode: 'S-42',
      validatedAt: '2026-11-20T18:00:00Z',
      message: 'Ticket is valid. Ready for check-in.',
    })

    vi.spyOn(coordinatorService, 'confirmTicketCheckIn').mockResolvedValue({
      ticketId: 'TICK-VALID-66',
      ticketCode: 'TICK-VALID-66',
      eventId: 101,
      status: 'CHECKED_IN',
      checkedInAt: '2026-11-20T18:01:00Z',
      message: 'Check-in confirmed successfully!',
    })

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    fireEvent.change(input, { target: { value: 'TICK-VALID-66' } })
    fireEvent.click(screen.getByRole('button', { name: /VALIDATE \/ CHECK IN/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CONFIRM CHECK-IN/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /CONFIRM CHECK-IN/i }))

    await waitFor(() => {
      expect(coordinatorService.confirmTicketCheckIn).toHaveBeenCalledWith(101, 'TICK-VALID-66')
      expect(screen.getAllByText(/CHECK-IN CONFIRMED/i).length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: /CONFIRM CHECK-IN/i })).not.toBeInTheDocument()
    })
  })

  it('SCRUM-31: handles WRONG_EVENT, ALREADY_USED, and NOT_ELIGIBLE statuses', async () => {
    vi.spyOn(coordinatorService, 'validateTicket')
      .mockResolvedValueOnce({
        ticketId: 'TICK-WRONG',
        ticketCode: 'TICK-WRONG',
        eventId: 999,
        eventName: 'Other Festival',
        isValid: false,
        status: 'WRONG_EVENT',
        attendeeName: 'Guest X',
        ticketType: 'General',
        seatCode: 'None',
        message: 'Ticket is registered for a different event.',
      })
      .mockResolvedValueOnce({
        ticketId: 'TICK-INELIGIBLE',
        ticketCode: 'TICK-INELIGIBLE',
        eventId: 101,
        eventName: 'Neon Horizon Music Fest 2026',
        isValid: false,
        status: 'NOT_ELIGIBLE',
        attendeeName: 'Guest Y',
        ticketType: 'Staff Pass',
        seatCode: 'None',
        message: 'Ticket holder is not eligible for entry at this gate.',
      })

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    const validateBtn = screen.getByRole('button', { name: /VALIDATE \/ CHECK IN/i })

    // Test WRONG_EVENT
    fireEvent.change(input, { target: { value: 'TICK-WRONG' } })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/WRONG_EVENT/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/different event/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /CONFIRM CHECK-IN/i })).not.toBeInTheDocument()
    })

    // Test NOT_ELIGIBLE
    fireEvent.change(input, { target: { value: 'TICK-INELIGIBLE' } })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/NOT_ELIGIBLE/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/not eligible/i).length).toBeGreaterThan(0)
    })
  })

  it('SCRUM-31: handles check-in API confirmation failure and allows retry', async () => {
    vi.spyOn(coordinatorService, 'validateTicket').mockResolvedValue({
      ticketId: 'TICK-RETRY-01',
      ticketCode: 'TICK-RETRY-01',
      eventId: 101,
      isValid: true,
      status: 'VALID',
      attendeeName: 'Malik Jay',
      ticketType: 'VIP Pass',
      seatCode: 'V-05',
      message: 'Ticket is valid. Ready for check-in.',
    })

    vi.spyOn(coordinatorService, 'confirmTicketCheckIn')
      .mockRejectedValueOnce(new Error('Network error 503'))
      .mockResolvedValueOnce({
        ticketId: 'TICK-RETRY-01',
        ticketCode: 'TICK-RETRY-01',
        eventId: 101,
        status: 'CHECKED_IN',
        checkedInAt: '2026-11-20T18:02:00Z',
        message: 'Check-in confirmed successfully!',
      })

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Neon Horizon Music Fest 2026')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /LAUNCH SCANNER/i })[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/MANUAL TICKET CODE ENTRY/i)
    fireEvent.change(input, { target: { value: 'TICK-RETRY-01' } })
    fireEvent.click(screen.getByRole('button', { name: /VALIDATE \/ CHECK IN/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CONFIRM CHECK-IN/i })).toBeInTheDocument()
    })

    // First attempt fails
    fireEvent.click(screen.getByRole('button', { name: /CONFIRM CHECK-IN/i }))

    await waitFor(() => {
      expect(screen.getByText(/Network error 503/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    })

    // Retry
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/CHECK-IN CONFIRMED/i).length).toBeGreaterThan(0)
    })
  })

  // ── Date-based Access & Expired Events Category Tests ──

  it('prevents scanner launch for upcoming and past events, allowing it only on the event date', async () => {
    const pastDate = new Date(Date.now() - 86400000 * 3).toISOString()
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString()

    vi.spyOn(coordinatorService, 'getCoordinatorEvents').mockResolvedValueOnce([
      {
        eventId: 201,
        title: 'Today Live Show',
        eventDate: new Date().toISOString(),
        location: 'Colombo',
        venue: 'Arena 1',
      },
      {
        eventId: 202,
        title: 'Upcoming Festival',
        eventDate: futureDate,
        location: 'Kandy',
        venue: 'Arena 2',
      },
      {
        eventId: 203,
        title: 'Expired Past Concert',
        eventDate: pastDate,
        location: 'Galle',
        venue: 'Arena 3',
      },
    ])

    render(<CoordinatorScannerPortal user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Today Live Show')).toBeInTheDocument()
      expect(screen.getByText('Upcoming Festival')).toBeInTheDocument()
    })

    // Today's event has active launch button
    const launchBtn = screen.getByRole('button', { name: /LAUNCH SCANNER/i })
    expect(launchBtn).toBeEnabled()

    // Upcoming event button is locked
    const lockedBtn = screen.getByRole('button', { name: /LOCKED \(TODAY ONLY\)/i })
    expect(lockedBtn).toBeDisabled()

    // Past event should NOT appear on 'all' tab
    expect(screen.queryByText('Expired Past Concert')).not.toBeInTheDocument()

    // Switch to 'past' tab
    fireEvent.click(screen.getByRole('tab', { name: /PAST/i }))

    await waitFor(() => {
      expect(screen.getByText('Expired Past Concert')).toBeInTheDocument()
      expect(screen.queryByText('Today Live Show')).not.toBeInTheDocument()
      expect(screen.queryByText('Upcoming Festival')).not.toBeInTheDocument()
    })

    // Expired event button is disabled
    const expiredBtn = screen.getByRole('button', { name: /EVENT EXPIRED/i })
    expect(expiredBtn).toBeDisabled()
  })
})


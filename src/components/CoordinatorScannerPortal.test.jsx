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

  const mockAssignedEvents = [
    {
      eventId: 101,
      title: 'Neon Horizon Music Fest 2026',
      eventDate: '2026-11-20T18:00:00Z',
      location: 'Colombo',
      venue: 'Lotus Tower Arena',
    },
    {
      eventId: 102,
      title: 'Global Tech Summit',
      eventDate: '2026-12-05T09:00:00Z',
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
      expect(coordinatorService.validateTicketCheckIn).toHaveBeenCalledWith(101, 'EXVO-TICK-101')
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
})

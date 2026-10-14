import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventReportsPage from './EventReportsPage'
import * as analyticsService from '../services/analyticsService'
import * as eventService from '../services/eventService'

describe('EventReportsPage (SCRUM-37)', () => {
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

  const mockOrganizerEvents = [
    {
      id: 101,
      title: 'Neon Horizon Music Fest 2026',
      venue: 'Lotus Tower Arena',
      totalCapacity: 1000,
      minPrice: 3500,
      ticketTiers: [
        { id: 1, name: 'VIP', price: 5000, quantity: 300 },
        { id: 2, name: 'General', price: 3500, quantity: 700 },
      ],
    },
    {
      id: 102,
      title: 'Global Tech Summit 2026',
      venue: 'Auditorium A',
      totalCapacity: 500,
      minPrice: 2000,
      ticketTiers: [{ id: 3, name: 'Delegate', price: 2000, quantity: 500 }],
    },
  ]

  const mockReportData = {
    eventId: 101,
    eventTitle: 'Neon Horizon Music Fest 2026',
    venue: 'Lotus Tower Arena',
    totalTicketsSold: 800,
    totalRevenue: 3100000,
    availableTickets: 200,
    totalCapacity: 1000,
    checkedInAttendees: 600,
    remainingAttendees: 200,
    checkInRate: 75.0,
    venueOccupancyPercentage: 60.0,
    salesFillRate: 80.0,
    ticketTiers: [
      { name: 'VIP', price: 5000, capacity: 300, sold: 250, available: 50, revenue: 1250000 },
      { name: 'General', price: 3500, capacity: 700, sold: 550, available: 150, revenue: 1850000 },
    ],
    hourlyAttendance: [
      { time: '16:00', count: 100 },
      { time: '17:00', count: 250 },
      { time: '18:00', count: 250 },
    ],
    eventsBreakdown: [
      {
        id: 101,
        title: 'Neon Horizon Music Fest 2026',
        venue: 'Lotus Tower Arena',
        ticketsSold: 800,
        available: 200,
        checkedIn: 600,
        remaining: 200,
        checkInRate: 75.0,
        revenue: 3100000,
      },
    ],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(eventService, 'getMyEvents').mockResolvedValue(mockOrganizerEvents)
    vi.spyOn(analyticsService, 'getEventReport').mockResolvedValue(mockReportData)
    vi.spyOn(analyticsService, 'getEventAnalytics').mockResolvedValue(mockReportData)
    vi.spyOn(analyticsService, 'downloadReportFile').mockResolvedValue({
      success: true,
      source: 'client',
      filename: 'test-report.csv',
    })
  })

  it('enforces RBAC and blocks unauthorized users from viewing reports', () => {
    render(<EventReportsPage user={mockNonOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText(/ACCESS RESTRICTED/i)).toBeInTheDocument()
    expect(screen.getByText(/ORGANIZER CLEARANCE REQUIRED/i)).toBeInTheDocument()
    expect(screen.getByText(/Attendee/i)).toBeInTheDocument()
    expect(screen.queryByText(/GENERATE REPORT/i)).not.toBeInTheDocument()
  })

  it('renders reports interface with event selector, report type, and KPI cards', async () => {
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText('SALES & ATTENDANCE REPORTS')).toBeInTheDocument()
    expect(screen.getByLabelText(/SELECT EVENT/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/REPORT TYPE/i)).toBeInTheDocument()

    // Wait for report document preview to populate
    await waitFor(() => {
      expect(screen.getByText('GENERATE REPORT')).toBeInTheDocument()
      expect(screen.getByText('TICKET SALES & FINANCIAL REPORT')).toBeInTheDocument()
      expect(screen.getByText('TOTAL TICKETS SOLD')).toBeInTheDocument()
      expect(screen.getByText('GROSS REVENUE (LKR)')).toBeInTheDocument()
      expect(screen.getByText('AVAILABLE TICKETS')).toBeInTheDocument()
    })

    expect(screen.getAllByText('800').length).toBeGreaterThan(0)
    expect(screen.getAllByText('LKR 3,100,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('200').length).toBeGreaterThan(0)
  })

  it('allows switching report type to Attendance & Check-In Report', async () => {
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByLabelText(/REPORT TYPE/i)).toBeInTheDocument()
    })

    const reportTypeSelect = screen.getByLabelText(/REPORT TYPE/i)
    fireEvent.change(reportTypeSelect, { target: { value: 'attendance' } })

    await waitFor(() => {
      expect(screen.getByText('ATTENDANCE & GATE CHECK-IN AUDIT')).toBeInTheDocument()
      expect(screen.getByText('CHECKED-IN ATTENDEES')).toBeInTheDocument()
      expect(screen.getByText('REMAINING EXPECTED')).toBeInTheDocument()
      expect(screen.getAllByText('CHECK-IN RATE').length).toBeGreaterThan(0)
      expect(screen.getByText('VENUE OCCUPANCY')).toBeInTheDocument()
    })

    expect(screen.getAllByText('600').length).toBeGreaterThan(0)
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0)
  })

  it('clicking GENERATE REPORT triggers fresh backend/service report fetch', async () => {
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('GENERATE REPORT')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('GENERATE REPORT'))

    await waitFor(() => {
      expect(analyticsService.getEventReport).toHaveBeenCalled()
    })
  })

  it('clicking DOWNLOAD CSV calls downloadReportFile with csv format', async () => {
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('DOWNLOAD CSV')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('DOWNLOAD CSV'))

    await waitFor(() => {
      expect(analyticsService.downloadReportFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'csv',
        expect.anything(),
      )
    })
  })

  it('clicking DOWNLOAD PDF calls downloadReportFile with pdf format', async () => {
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('DOWNLOAD PDF')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('DOWNLOAD PDF'))

    await waitFor(() => {
      expect(analyticsService.downloadReportFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'pdf',
        expect.anything(),
      )
    })
  })

  it('allows switching to live dashboard via LIVE DASHBOARD button', async () => {
    const mockNavigateAnalytics = vi.fn()
    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} onNavigateAnalytics={mockNavigateAnalytics} />)

    await waitFor(() => {
      expect(screen.getByText('LIVE DASHBOARD')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('LIVE DASHBOARD'))
    expect(mockNavigateAnalytics).toHaveBeenCalled()
  })

  it('displays empty state when organizer has no events', async () => {
    eventService.getMyEvents.mockResolvedValueOnce([])
    analyticsService.getEventReport.mockResolvedValueOnce(null)
    analyticsService.getEventAnalytics.mockResolvedValueOnce(null)

    render(<EventReportsPage user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('NO EVENTS FOR REPORT GENERATION')).toBeInTheDocument()
      expect(screen.getByText('RETURN TO DASHBOARD')).toBeInTheDocument()
    })
  })
})

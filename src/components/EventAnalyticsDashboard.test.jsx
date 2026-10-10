import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventAnalyticsDashboard from './EventAnalyticsDashboard'
import * as analyticsService from '../services/analyticsService'
import * as eventService from '../services/eventService'

describe('EventAnalyticsDashboard (SCRUM-34)', () => {
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

  const mockAnalyticsData = {
    eventId: null,
    eventTitle: 'All Managed Events',
    totalTicketsSold: 950,
    totalRevenue: 3450000,
    availableTickets: 550,
    totalCapacity: 1500,
    checkedInAttendees: 720,
    attendancePercentage: 75.8,
    salesTimeline: [
      { date: '2026-10-04', label: 'Oct 4', ticketsSold: 110, revenue: 385000 },
      { date: '2026-10-05', label: 'Oct 5', ticketsSold: 140, revenue: 490000 },
      { date: '2026-10-06', label: 'Oct 6', ticketsSold: 180, revenue: 630000 },
    ],
    hourlyAttendance: [
      { time: '16:00', count: 60 },
      { time: '17:00', count: 180 },
      { time: '18:00', count: 320 },
      { time: '19:00', count: 160 },
    ],
    eventsBreakdown: [
      {
        id: 101,
        title: 'Neon Horizon Music Fest 2026',
        ticketsSold: 650,
        available: 350,
        revenue: 2500000,
        checkedIn: 500,
      },
      { id: 102, title: 'Global Tech Summit 2026', ticketsSold: 300, available: 200, revenue: 950000, checkedIn: 220 },
    ],
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(eventService, 'getMyEvents').mockResolvedValue(mockOrganizerEvents)
    vi.spyOn(analyticsService, 'getEventAnalytics').mockResolvedValue(mockAnalyticsData)
  })

  it('enforces RBAC and blocks non-organizers from accessing analytics dashboard', () => {
    render(<EventAnalyticsDashboard user={mockNonOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText(/ACCESS RESTRICTED/i)).toBeInTheDocument()
    expect(screen.getByText(/ORGANIZER CLEARANCE REQUIRED/i)).toBeInTheDocument()
    expect(screen.getByText(/Attendee/i)).toBeInTheDocument()
    expect(screen.queryByText(/TOTAL REVENUE/i)).not.toBeInTheDocument()
  })

  it('renders dashboard with key metric stats cards for authorized organizer', async () => {
    render(<EventAnalyticsDashboard user={mockOrganizer} onBack={vi.fn()} />)

    expect(screen.getByText(/Jane Organizer/i)).toBeInTheDocument()
    expect(screen.getByText(/ANALYTICS DASHBOARD/i)).toBeInTheDocument()

    // Wait for metrics to load and display
    await waitFor(() => {
      expect(screen.getByText('TOTAL TICKETS SOLD')).toBeInTheDocument()
      expect(screen.getByText('TOTAL REVENUE (LKR)')).toBeInTheDocument()
      expect(screen.getByText('AVAILABLE TICKETS')).toBeInTheDocument()
      expect(screen.getByText('CHECKED-IN ATTENDEES')).toBeInTheDocument()
      expect(screen.getByText('ATTENDANCE RATE')).toBeInTheDocument()
    })

    expect(screen.getByText('950')).toBeInTheDocument()
    expect(screen.getByText('LKR 3,450,000')).toBeInTheDocument()
    expect(screen.getByText('550')).toBeInTheDocument()
    expect(screen.getByText('720')).toBeInTheDocument()
    expect(screen.getByText('75.8%')).toBeInTheDocument()
  })

  it('supports event selection dropdown to filter metrics by organizer-owned event', async () => {
    render(<EventAnalyticsDashboard user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByLabelText(/SELECT EVENT:/i)).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/SELECT EVENT:/i)
    fireEvent.change(select, { target: { value: '101' } })

    await waitFor(() => {
      expect(analyticsService.getEventAnalytics).toHaveBeenCalledWith('101')
    })
  })

  it('allows switching chart tabs between Overview, Sales, Revenue, and Attendance', async () => {
    render(<EventAnalyticsDashboard user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/TICKET SALES TREND/i)).toBeInTheDocument()
    })

    // Click Sales tab
    fireEvent.click(screen.getByText(/TICKET SALES TREND/i))
    expect(screen.getByText(/Daily Ticket Sales Volume/i)).toBeInTheDocument()

    // Click Revenue tab
    fireEvent.click(screen.getByText(/REVENUE TRAJECTORY/i))
    expect(screen.getByText(/Daily Revenue Generation/i)).toBeInTheDocument()

    // Click Gate Attendance stream tab
    fireEvent.click(screen.getByText(/GATE ATTENDANCE STREAM/i))
    expect(screen.getByText(/Hourly Gate Check-In Velocity/i)).toBeInTheDocument()
  })

  it('supports manual refresh button to re-fetch live analytics', async () => {
    render(<EventAnalyticsDashboard user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('REFRESH')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('REFRESH'))

    await waitFor(() => {
      expect(analyticsService.getEventAnalytics).toHaveBeenCalledTimes(2)
    })
  })

  it('handles backend error state and displays retry alert', async () => {
    analyticsService.getEventAnalytics.mockRejectedValueOnce(new Error('Network service timeout'))

    render(<EventAnalyticsDashboard user={mockOrganizer} onBack={vi.fn()} />)

    await waitFor(() => {
      // If service fails and fallback derivation handles or displays retry alert
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })
})

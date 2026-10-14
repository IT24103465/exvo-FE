import { beforeEach, expect, test, vi } from 'vitest'
import {
  getEventAnalytics,
  calculateEventRealTimeAnalytics,
  calculateAggregateRealTimeAnalytics,
} from './analyticsService.js'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.setItem('token', 'test-organizer-token')
})

test('getEventAnalytics fetches aggregate overview when no eventId provided', async () => {
  const mockOverview = {
    totalTicketsSold: 1250,
    totalRevenue: 3750000,
    availableTickets: 750,
    checkedInAttendees: 980,
    attendancePercentage: 78.4,
  }

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockOverview,
  })

  const res = await getEventAnalytics()
  expect(res).toEqual(mockOverview)
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/analytics/organizer/overview'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-organizer-token',
      }),
    }),
  )
})

test('getEventAnalytics fetches event-specific analytics when eventId provided', async () => {
  const mockEventAnalytics = {
    eventId: 42,
    totalTicketsSold: 450,
    totalRevenue: 1350000,
    availableTickets: 50,
    checkedInAttendees: 380,
    attendancePercentage: 84.4,
    salesTimeline: [
      { date: '2026-10-01', ticketsSold: 120, revenue: 360000 },
      { date: '2026-10-02', ticketsSold: 180, revenue: 540000 },
    ],
    tierBreakdown: [
      { name: 'VIP', sold: 100, capacity: 100, revenue: 500000 },
      { name: 'General', sold: 350, capacity: 400, revenue: 850000 },
    ],
  }

  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockEventAnalytics,
  })

  const res = await getEventAnalytics(42)
  expect(res).toEqual(mockEventAnalytics)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/analytics/events/42'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-organizer-token',
      }),
    }),
  )
})

test('calculateEventRealTimeAnalytics computes real revenue and sold metrics from live booking availability', () => {
  const mockEvent = {
    id: 10,
    title: 'Colombo Rock Fest',
    venue: 'Lotus Tower Arena',
    totalCapacity: 500,
    ticketTiers: [
      { id: 't1', name: 'VIP', price: 5000, quantity: 100 },
      { id: 't2', name: 'Standard', price: 2500, quantity: 400 },
    ],
  }

  const mockLiveAvailability = {
    eventId: 10,
    tiers: [
      { ticketTierId: 't1', availableQuantity: 20 }, // 80 sold @ 5000 = 400,000
      { ticketTierId: 't2', availableQuantity: 150 }, // 250 sold @ 2500 = 625,000
    ],
  }

  const result = calculateEventRealTimeAnalytics(mockEvent, mockLiveAvailability)
  expect(result.eventId).toBe(10)
  expect(result.totalTicketsSold).toBe(330) // 80 + 250
  expect(result.totalRevenue).toBe(1025000) // 400000 + 625000
  expect(result.availableTickets).toBe(170) // 20 + 150
  expect(result.totalCapacity).toBe(500)
  expect(result.attendancePercentage).toBeGreaterThan(0)
  expect(result.remainingAttendees).toBe(330 - result.checkedInAttendees)
  expect(result.venueOccupancy).toBe(result.checkedInAttendees)
  expect(result.venueOccupancyPercentage).toBeGreaterThan(0)
  expect(result.salesFillRate).toBe(66) // (330 / 500) * 100
})

test('calculateAggregateRealTimeAnalytics calculates total numbers across multiple events', () => {
  const mockEvents = [
    {
      id: 1,
      title: 'Event One',
      ticketTiers: [{ id: '1', name: 'Pass', price: 1000, quantity: 100 }],
    },
    {
      id: 2,
      title: 'Event Two',
      ticketTiers: [{ id: '2', name: 'Pass', price: 2000, quantity: 100 }],
    },
  ]

  const availabilities = {
    1: { tiers: [{ ticketTierId: '1', availableQuantity: 40 }] }, // 60 sold = 60,000
    2: { tiers: [{ ticketTierId: '2', availableQuantity: 50 }] }, // 50 sold = 100,000
  }

  const aggregate = calculateAggregateRealTimeAnalytics(mockEvents, availabilities)
  expect(aggregate.totalEvents).toBe(2)
  expect(aggregate.totalTicketsSold).toBe(110)
  expect(aggregate.totalRevenue).toBe(160000)
  expect(aggregate.availableTickets).toBe(90)
  expect(aggregate.remainingAttendees).toBe(110 - aggregate.checkedInAttendees)
  expect(aggregate.venueOccupancy).toBe(aggregate.checkedInAttendees)
})

test('getEventReport calls backend reports endpoint with eventId and reportType', async () => {
  const mockReport = {
    eventId: 101,
    reportType: 'sales',
    totalTicketsSold: 500,
    totalRevenue: 1500000,
  }

  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockReport,
  })

  const { getEventReport } = await import('./analyticsService.js')
  const report = await getEventReport(101, 'sales')
  expect(report).toEqual(mockReport)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/analytics/events/101/reports?type=sales'),
    expect.anything(),
  )
})

test('generateClientCsv generates formatted CSV string with report sections', async () => {
  const { generateClientCsv } = await import('./analyticsService.js')
  const mockData = {
    eventTitle: 'Neon Fest 2026',
    venue: 'Lotus Arena',
    totalCapacity: 1000,
    totalTicketsSold: 800,
    availableTickets: 200,
    totalRevenue: 2800000,
    checkedInAttendees: 600,
    remainingAttendees: 200,
    checkInRate: 75,
    salesFillRate: 80,
    ticketTiers: [
      { name: 'VIP', price: 5000, capacity: 200, sold: 200, available: 0, revenue: 1000000 },
      { name: 'General', price: 3000, capacity: 800, sold: 600, available: 200, revenue: 1800000 },
    ],
  }

  const csv = generateClientCsv(mockData, 'sales')
  expect(csv).toContain('EXVO EVENT ANALYTICS & REPORTS')
  expect(csv).toContain('Neon Fest 2026')
  expect(csv).toContain('VIP')
  expect(csv).toContain('General')
  expect(csv).toContain('Total Tickets Sold,800')
})

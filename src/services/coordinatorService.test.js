import { beforeEach, expect, test, vi } from 'vitest'
import { getCoordinatorEvents, verifyCoordinatorAccess, validateTicketCheckIn } from './coordinatorService.js'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.setItem('token', 'test-coordinator-token')
})

test('loads assigned events for coordinator', async () => {
  const mockEvents = [
    {
      eventId: 1,
      title: 'Tech Fest 2026',
      eventDate: '2026-11-01T10:00:00Z',
      utcOffsetMinutes: 330,
      location: 'Colombo',
      venue: 'Exhibition Center',
    },
  ]
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => mockEvents,
  })

  const events = await getCoordinatorEvents()
  expect(events).toEqual(mockEvents)
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/coordinator/events'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-coordinator-token',
      }),
    }),
  )
})

test('verifies scanner access for an assigned event', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ eventId: 1, scannerAccess: true }),
  })

  const access = await verifyCoordinatorAccess(1)
  expect(access).toEqual({ eventId: 1, scannerAccess: true })
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/coordinator/events/1/access'),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-coordinator-token',
      }),
    }),
  )
})

test('validates ticket check-in for an event via API', async () => {
  const checkInResult = {
    ticketCode: 'EXVO-TICK-999',
    eventId: 1,
    isValid: true,
    status: 'VALID',
    attendeeName: 'Kasun Perera',
    ticketType: 'VIP',
    seatCode: 'A-12',
    checkedInAt: '2026-11-01T10:15:00Z',
  }
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => checkInResult,
  })

  const res = await validateTicketCheckIn(1, 'EXVO-TICK-999')
  expect(res).toEqual(checkInResult)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/coordinator/events/1/check-in'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ticketCode: 'EXVO-TICK-999' }),
    }),
  )
})

test('handles offline/unmounted endpoint fallback during ticket check-in', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ message: 'Not found 404' }),
  })

  const res = await validateTicketCheckIn(5, 'EXVO-VIP-001')
  expect(res.isValid).toBe(true)
  expect(res.ticketCode).toBe('EXVO-VIP-001')
  expect(res.eventId).toBe(5)
  expect(res.status).toBe('VALID')
})

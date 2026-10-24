import { beforeEach, expect, test, vi } from 'vitest'
import * as coordinatorService from './coordinatorService.js'
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
    json: async () => ({ message: 'Ticket not found' }),
  })

  await expect(validateTicketCheckIn(5, 'EXVO-VIP-001')).rejects.toThrow('Ticket not found')
})

test('validates ticket via CheckInService validate endpoint (SCRUM-31)', async () => {
  const validateResult = {
    ticketId: 'EXVO-GA-444',
    ticketCode: 'EXVO-GA-444',
    eventId: 2,
    eventName: 'Colombo Tech Expo',
    isValid: true,
    status: 'VALID',
    attendeeName: 'Sunil Dias',
    ticketType: 'General Admission',
    seatCode: 'GA-01',
    validatedAt: '2026-11-01T10:00:00Z',
    message: 'Ticket is valid. Ready for check-in.',
  }

  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => validateResult,
  })

  const res = await coordinatorService.validateTicket(2, 'EXVO-GA-444')
  expect(res).toEqual(validateResult)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/coordinator/events/2/validate'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ticketCode: 'EXVO-GA-444' }),
    }),
  )
})

test('confirms ticket check-in separately for valid ticket (SCRUM-31)', async () => {
  const confirmResult = {
    ticketId: 'EXVO-GA-444',
    ticketCode: 'EXVO-GA-444',
    eventId: 2,
    status: 'CHECKED_IN',
    checkedInAt: '2026-11-01T10:05:00Z',
    message: 'Check-in confirmed successfully.',
  }

  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => confirmResult,
  })

  const res = await coordinatorService.confirmTicketCheckIn(2, 'EXVO-GA-444')
  expect(res).toEqual(confirmResult)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/coordinator/events/2/check-in'),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ticketCode: 'EXVO-GA-444' }),
    }),
  )
})

test('validates ticket fallback statuses (ALREADY_USED, WRONG_EVENT, NOT_ELIGIBLE, INVALID)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ALREADY_USED', isValid: false, message: 'Already used' }),
  })
  const usedRes = await coordinatorService.validateTicket(1, 'EXVO-ALREADY-USED-001')
  expect(usedRes.status).toBe('ALREADY_USED')
  expect(usedRes.isValid).toBe(false)

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'WRONG_EVENT', isValid: false, message: 'Wrong event' }),
  })
  const wrongRes = await coordinatorService.validateTicket(1, 'EXVO-WRONG-EVENT-002')
  expect(wrongRes.status).toBe('WRONG_EVENT')
  expect(wrongRes.isValid).toBe(false)

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'NOT_ELIGIBLE', isValid: false, message: 'Not eligible' }),
  })
  const notEligibleRes = await coordinatorService.validateTicket(1, 'EXVO-NOT_ELIGIBLE-003')
  expect(notEligibleRes.status).toBe('NOT_ELIGIBLE')
  expect(notEligibleRes.isValid).toBe(false)

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'INVALID', isValid: false, message: 'Invalid ticket' }),
  })
  const invalidRes = await coordinatorService.validateTicket(1, 'BAD-INVALID-004')
  expect(invalidRes.status).toBe('INVALID')
  expect(invalidRes.isValid).toBe(false)
})

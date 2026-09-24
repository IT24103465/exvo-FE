import { beforeEach, expect, test, vi } from 'vitest'
import { confirmSeatHold, getAttendeeSeatingPlan, getEventAvailability, holdSeats, releaseSeatHold, saveSeatingPlan } from './bookingService.js'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.setItem('token', 'test-token')
})

test('saves normalized organizer seating configuration through BookingService', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 4 }),
  })
  await saveSeatingPlan(12, {
    name: 'Main hall',
    isVisibleToAttendees: true,
    sections: [{ name: 'Orchestra', rowCount: 20, seatsPerRow: 25 }],
  })
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/booking/events/12/seating-plan'),
    expect.objectContaining({ method: 'POST', body: expect.stringContaining('"rowCount":20') }),
  )
})

test('loads attendee seating plans from the database-backed endpoint', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ eventId: 12, sections: [{ name: 'Orchestra', seats: [{ seatCode: 'A-01', isEnabled: true }] }] }),
  })
  await expect(getAttendeeSeatingPlan(12)).resolves.toMatchObject({ eventId: 12 })
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/booking/events/12/seating-plan'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
  )
})

test('loads general-admission availability from BookingService', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ eventId: 12, availableSeatCount: 7, tiers: [] }),
  })
  await expect(getEventAvailability(12)).resolves.toMatchObject({ eventId: 12, availableSeatCount: 7 })
})

test('creates and releases an attendee seat hold', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ holdId: 3, expiresAtUtc: '2026-09-22T12:05:00Z' }),
  })
  await holdSeats(12, ['A-01', 'A-02'])
  await releaseSeatHold(12, 3)
  await confirmSeatHold(12, 3)
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('/api/booking/events/12/seat-holds'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ seatCodes: ['A-01', 'A-02'] }) }),
  )
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('/api/booking/events/12/seat-holds/3'),
    expect.objectContaining({ method: 'DELETE' }),
  )
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining('/api/booking/events/12/seat-holds/3/confirm'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
  )
})

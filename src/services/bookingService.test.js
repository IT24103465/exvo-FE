import { beforeEach, expect, test, vi } from 'vitest'
import { getAttendeeSeatingPlan, getEventAvailability, saveSeatingPlan } from './bookingService.js'

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

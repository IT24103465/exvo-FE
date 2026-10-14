import { describe, expect, test } from 'vitest'
import {
  localDate,
  minimumEventTime,
  validateEventSchedule,
  eventStartTimestamp,
  isEventExpired,
} from './eventDateTime'

describe('local event schedules', () => {
  const now = new Date(2026, 8, 20, 14, 35, 20)

  test('rejects past dates and earlier times today, but accepts future local times', () => {
    expect(validateEventSchedule('2026-09-19', '23:59', now)).toMatch(/future/)
    expect(validateEventSchedule('2026-09-20', '14:35', now)).toMatch(/future/)
    expect(validateEventSchedule('2026-09-20', '14:36', now)).toBe('')
    expect(validateEventSchedule('2026-09-21', '00:01', now)).toBe('')
  })

  test.each([
    ['', ''],
    ['2026-02-30', '19:00'],
    ['2026-09-21', '25:00'],
    ['2026-09-21', ''],
  ])('rejects invalid date/time %s %s', (date, time) => {
    expect(validateEventSchedule(date, time, now)).toMatch(/valid/)
  })

  test('input bounds use local calendar values, including midnight', () => {
    expect(localDate(new Date(2026, 8, 20, 0, 1))).toBe('2026-09-20')
    expect(minimumEventTime('2026-09-20', now)).toBe('14:36')
    expect(minimumEventTime('2026-09-21', now)).toBeUndefined()
    expect(validateEventSchedule('2026-09-20', '23:59', new Date(2026, 8, 20, 23, 59, 30))).toMatch(/future/)
    expect(validateEventSchedule('2026-09-21', '00:00', new Date(2026, 8, 20, 23, 59, 30))).toBe('')
  })
})

test('expiry uses the absolute API time and the Sri Lanka fallback for old events', () => {
  const cutoff = Date.parse('2026-09-20T18:30:00Z')
  const legacy = { eventDate: '2026-09-21T00:00:00' }
  const explicitOffset = { eventDate: '2026-09-20T11:30:00', utcOffsetMinutes: -420 }
  const api = { eventDate: '2026-09-21T00:00:00', startsAtUtc: '2026-09-20T18:30:00Z' }
  for (const event of [legacy, explicitOffset, api]) {
    expect(eventStartTimestamp(event)).toBe(cutoff)
    expect(isEventExpired(event, cutoff)).toBe(false)
    expect(isEventExpired(event, cutoff + 1)).toBe(true)
  }
})

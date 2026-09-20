import { afterEach, expect, test } from 'vitest'
import { getAllEvents, getEventById, getMyEvents, createEvent, updateEvent, deleteEvent } from './eventService.js'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
afterEach(() => {
  globalThis.fetch = originalFetch
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage })
})

function seedOldEvents() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (key === 'exvo_local_events_db' ? JSON.stringify([{ id: 1 }, { id: 2 }]) : null),
      setItem: () => {
        throw new Error('Events must not be persisted in browser storage')
      },
    },
  })
}

test('refresh removes deleted events, including when the catalog becomes empty', async () => {
  seedOldEvents()
  let events = [{ id: 1 }, { id: 2 }]
  globalThis.fetch = async (_url, options) => {
    expect(options.cache).toBe('no-store')
    return Response.json(events)
  }
  expect(await getAllEvents()).toEqual([
    { id: 1, ticketTiers: [] },
    { id: 2, ticketTiers: [] },
  ])
  events = [{ id: 1 }]
  expect(await getAllEvents()).toEqual([{ id: 1, ticketTiers: [] }])
  events = []
  expect(await getAllEvents()).toEqual([])
})

test('deleted event details do not come from storage or another service', async () => {
  seedOldEvents()
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(null, { status: 404 })
  }
  await expect(getEventById(2)).rejects.toThrow(/404/)
  expect(calls).toBe(1)
})

test('unavailable backend never returns cached lists or successful local writes', async () => {
  seedOldEvents()
  globalThis.fetch = async () => {
    throw new Error('offline')
  }
  for (const operation of [
    getAllEvents,
    getMyEvents,
    () => createEvent({ title: 'Test' }),
    () => updateEvent(1, { title: 'Changed' }),
    () => deleteEvent(1),
  ]) {
    await expect(operation()).rejects.toThrow('The service is currently unavailable. Please try again shortly.')
  }
})

test('rejected writes propagate errors and successful empty responses are accepted', async () => {
  seedOldEvents()
  globalThis.fetch = async () => new Response(null, { status: 403 })
  await expect(createEvent({ title: 'Test' })).rejects.toThrow(/403/)
  await expect(updateEvent(1, {})).rejects.toThrow(/403/)
  await expect(deleteEvent(1)).rejects.toThrow(/403/)
  globalThis.fetch = async () => new Response(null, { status: 204 })
  expect(await updateEvent(1, {})).toBeNull()
  expect(await deleteEvent(1)).toBeNull()
})

test('organizer lists send the token to the scoped endpoint without a caller-selected owner', async () => {
  localStorage.setItem('token', 'owner-token')
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return Response.json([])
  }
  await getMyEvents()
  await getAllEvents()
  expect(calls[0].url).toMatch(/\/api\/catalog\/events\/my-events$/)
  for (const { options } of calls) expect(options.headers.Authorization).toBe('Bearer owner-token')
  localStorage.removeItem('token')
})

test('create and edit preserve local wall time and send its explicit UTC offset', async () => {
  const payloads = []
  globalThis.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body))
    return Response.json({ id: 1 })
  }
  const data = { title: 'Concert', date: '2099-09-20', time: '00:15', organizerId: 999 }
  await createEvent(data)
  await updateEvent(1, data)
  for (const payload of payloads) {
    expect(payload.eventDate).toBe('2099-09-20T00:15:00')
    expect(payload.utcOffsetMinutes).toBe(-new Date('2099-09-20T00:15:00').getTimezoneOffset())
  }
  expect(payloads[0]).not.toHaveProperty('organizerId')
})

test('create and edit send artist and category fields the catalog can persist', async () => {
  const payloads = []
  globalThis.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body))
    return Response.json({ id: 1 })
  }
  const data = {
    title: 'Concert',
    artistOrOrganizer: 'The Signal',
    organizerName: 'EXVO',
    categoryId: 3,
    category: 'Festival',
    date: '2099-09-20',
    time: '19:00',
  }

  await createEvent(data)
  await updateEvent(1, data)

  for (const payload of payloads) {
    expect(payload.artistOrOrganizer).toBe('The Signal')
    expect(payload.organizerName).toBe('EXVO')
    expect(payload.categoryId).toBe(3)
    expect(payload.categoryName).toBe('Festival')
    expect(payload.category).toBe('Festival')
  }
})

test('category name resolves to the matching catalog id when no category id is present', async () => {
  const payloads = []
  globalThis.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body))
    return Response.json({ id: 1 })
  }

  await createEvent({ title: 'Festival', category: 'Festival', date: '2099-09-20', time: '19:00' })
  await updateEvent(1, { title: 'Festival', category: 'Festival', date: '2099-09-20', time: '19:00' })

  expect(payloads.map((payload) => payload.categoryId)).toEqual([3, 3])
  expect(payloads.map((payload) => payload.categoryName)).toEqual(['Festival', 'Festival'])
})

test('backend schedule validation is shown as a clear validation error', async () => {
  globalThis.fetch = async () =>
    Response.json({ message: 'Event date and time must be in the future (your local time).' }, { status: 400 })
  await expect(createEvent({ date: '2000-01-01', time: '19:00' })).rejects.toThrow(
    'Event date and time must be in the future',
  )
})

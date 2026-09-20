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
    await expect(operation()).rejects.toThrow('Backend service is not currently available')
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

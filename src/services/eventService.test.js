import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getAllEvents, getEventById, getMyEvents, createEvent, updateEvent, deleteEvent } from './eventService.js';

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
});

function seedOldEvents() {
  globalThis.localStorage = {
    getItem: (key) => key === 'exvo_local_events_db'
      ? JSON.stringify([{ id: 1 }, { id: 2 }]) : null,
    setItem: () => assert.fail('Events must not be persisted in browser storage'),
  };
}

test('refresh removes deleted events, including when the catalog becomes empty', async () => {
  seedOldEvents();
  let events = [{ id: 1 }, { id: 2 }];
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    return Response.json(events);
  };
  assert.deepEqual(await getAllEvents(), events);
  events = [{ id: 1 }];
  assert.deepEqual(await getAllEvents(), events);
  events = [];
  assert.deepEqual(await getAllEvents(), []);
});

test('deleted event details do not come from storage or another service', async () => {
  seedOldEvents();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 404 });
  };
  await assert.rejects(getEventById(2), /404/);
  assert.equal(calls, 1);
});

test('unavailable backend never returns cached lists or successful local writes', async () => {
  seedOldEvents();
  globalThis.fetch = async () => { throw new Error('offline'); };
  for (const operation of [getAllEvents, getMyEvents,
    () => createEvent({ title: 'Test' }),
    () => updateEvent(1, { title: 'Changed' }), () => deleteEvent(1)]) {
    await assert.rejects(operation(), /offline/);
  }
});

test('rejected writes propagate errors and successful empty responses are accepted', async () => {
  seedOldEvents();
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(createEvent({ title: 'Test' }), /403/);
  await assert.rejects(updateEvent(1, {}), /403/);
  await assert.rejects(deleteEvent(1), /403/);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await updateEvent(1, {}), null);
  assert.equal(await deleteEvent(1), null);
});

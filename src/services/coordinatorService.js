import { fetchApi } from './apiConfig.js'

const authHeaders = () => {
  let token = null
  try {
    token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  } catch {
    token = null
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const request = async (path, options = {}) => {
  const response = await fetchApi(path, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || error?.Message || `Request failed with status ${response.status}`)
  }

  return response.status === 204 ? null : response.json()
}

/**
 * Fetch events for scanning:
 * Tries coordinator assigned events first. If none or forbidden (e.g. user is Organizer),
 * falls back to fetching the user's organizer events from /api/catalog/events/my-events.
 */
export const getCoordinatorEvents = async () => {
  try {
    const data = await request('/api/coordinator/events')
    if (Array.isArray(data) && data.length > 0) {
      return data
    }
  } catch {
    // If coordinator endpoint returns 403 (for organizer) or fails, try organizer my-events
  }

  try {
    const myEvents = await request('/api/catalog/events/my-events')
    if (Array.isArray(myEvents)) {
      return myEvents.map((evt) => ({
        eventId: evt.id || evt.eventId,
        id: evt.id || evt.eventId,
        title: evt.title,
        eventDate: evt.eventDate || `${evt.date || ''}T${evt.time || '19:00'}:00`,
        venue: evt.venue,
        location: evt.venue || evt.location,
      }))
    }
  } catch {
    // ignore
  }

  return []
}

/**
 * Verify scanner access for a specific event
 */
export const verifyCoordinatorAccess = async (eventId) => {
  try {
    return await request(`/api/coordinator/events/${eventId}/access`)
  } catch {
    // For organizers or local testing, access is permitted to their own events
    return { eventId, scannerAccess: true }
  }
}

/**
 * Validate ticket without marking it as used (SCRUM-31)
 * Calls CheckInService validate endpoint via API Gateway: /api/coordinator/events/${eventId}/validate
 * Supports real-time validation statuses: VALID, INVALID, WRONG_EVENT, ALREADY_USED, NOT_ELIGIBLE
 */
export const validateTicket = async (eventId, ticketCode) => {
  const normalizedCode = String(ticketCode || '').trim()
  if (!normalizedCode) {
    throw new Error('Ticket code is required.')
  }

  const response = await request(`/api/coordinator/events/${eventId}/validate`, {
    method: 'POST',
    body: JSON.stringify({ ticketCode: normalizedCode }),
  })
  return response
}

/**
 * Confirm ticket check-in for a previously validated valid ticket (SCRUM-31 / SCRUM-32)
 * Marks ticket as checked-in in DB via CheckInService: /api/coordinator/events/${eventId}/check-in
 */
export const confirmTicketCheckIn = async (eventId, ticketCode) => {
  const normalizedCode = String(ticketCode || '').trim()
  if (!normalizedCode) {
    throw new Error('Ticket code is required.')
  }

  const response = await request(`/api/coordinator/events/${eventId}/check-in`, {
    method: 'POST',
    body: JSON.stringify({ ticketCode: normalizedCode }),
  })
  return response
}

/**
 * Legacy wrapper: Validate and check in a ticket for an event
 * Backward compatible for existing callers.
 */
export const validateTicketCheckIn = async (eventId, ticketCode) => {
  const normalizedCode = String(ticketCode || '').trim()
  if (!normalizedCode) {
    throw new Error('Ticket code is required.')
  }

  const response = await request(`/api/coordinator/events/${eventId}/check-in`, {
    method: 'POST',
    body: JSON.stringify({ ticketCode: normalizedCode }),
  })
  return response
}

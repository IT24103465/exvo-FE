import { localDate } from './eventDateTime.js'
import { fetchApi } from './apiConfig.js'

export const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Music & Concerts', description: 'Live music events and festivals' },
  { id: 2, name: 'Concert', description: 'Concerts and live performances' },
  { id: 3, name: 'Festival', description: 'Music and cultural festivals' },
  { id: 4, name: 'Live Session', description: 'Intimate live sessions' },
  { id: 5, name: 'DJ Night', description: 'EDM and DJ night events' },
  { id: 6, name: 'Acoustic', description: 'Unplugged acoustic sets' },
  { id: 7, name: 'Stand-Up', description: 'Comedy and stand-up shows' },
  { id: 8, name: 'EDM Arena', description: 'Electronic dance music festivals' },
]

export const getCategories = async () => {
  try {
    const response = await fetchApi('/api/catalog/categories', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (response.ok) {
      const categories = await response.json()
      if (Array.isArray(categories) && categories.length > 0) {
        return categories
      }
    }
  } catch (error) {
    console.warn('Could not fetch categories:', error.message)
  }
  return DEFAULT_CATEGORIES
}

const fetchWithFallback = async (endpoint = '', options = {}) => {
  return fetchApi(`/api/catalog/events${endpoint}`, options)
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

const normalizeEvent = (ev) => {
  if (!ev) return ev
  let tiers = []
  if (ev.ticketTiersJson) {
    try {
      tiers = typeof ev.ticketTiersJson === 'string' ? JSON.parse(ev.ticketTiersJson) : ev.ticketTiersJson
    } catch (err) {
      console.warn('Failed to parse ticketTiersJson from API:', err)
    }
  } else if (typeof ev.ticketTiers === 'string') {
    try {
      tiers = JSON.parse(ev.ticketTiers)
    } catch (err) {
      console.warn('Failed to parse ticketTiers string from API:', err)
    }
  } else if (Array.isArray(ev.ticketTiers)) {
    tiers = ev.ticketTiers
  }

  return {
    ...ev,
    ticketTiers: Array.isArray(tiers) ? tiers : [],
  }
}

const resolveCategoryId = (eventData) => {
  const explicitId = Number(eventData.categoryId)
  if (explicitId > 0) return explicitId

  const categoryName = eventData.categoryName || eventData.category
  const matchedCategory = DEFAULT_CATEGORIES.find((cat) => cat.name === categoryName)
  return matchedCategory?.id || 1
}

// The Catalog API is authoritative; never merge browser-stored events into it.
const requestEvent = async (endpoint, options) => {
  const response = await fetchWithFallback(endpoint, { cache: 'no-store', ...options })
  if (!response.ok) {
    if (response.status === 400) {
      const error = await response.json().catch(() => null)
      const message = error?.message || error?.Message
      if (message?.startsWith('Event date and time') || message?.startsWith('Please provide a valid local event')) {
        throw new Error(message)
      }
    }
    throw new Error(`Unable to complete the event request (${response.status}). Please try again.`)
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  const data = JSON.parse(text)
  return Array.isArray(data) ? data.map(normalizeEvent) : normalizeEvent(data)
}

const requestEventList = async (endpoint, headers) => {
  const events = await requestEvent(endpoint, { method: 'GET', headers })
  if (!Array.isArray(events)) throw new Error('Unable to load events. Please try again.')
  return events
}

// GET all published events (Public)
export const getAllEvents = () => requestEventList('', getAuthHeaders())

// GET event by ID
export const getEventById = (id) =>
  requestEvent(`/${id}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  })

// GET logged-in organizer's events
export const getMyEvents = () => requestEventList('/my-events', getAuthHeaders())

// POST create event
export const createEvent = async (eventData) => {
  const tiersList = eventData.ticketTiers || []
  const minPrice =
    tiersList.length > 0 ? Math.min(...tiersList.map((t) => Number(t.price) || 0)) : Number(eventData.price) || 0

  const totalCap =
    tiersList.length > 0
      ? tiersList.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
      : Number(eventData.availableTickets) || 500

  const catId = resolveCategoryId(eventData)

  const eventTimeVal = eventData.time || eventData.eventTime || '19:00'
  let cleanDateVal = eventData.date || eventData.eventDate || localDate()
  if (typeof cleanDateVal === 'string' && cleanDateVal.includes('T')) {
    cleanDateVal = cleanDateVal.split('T')[0]
  }

  const formattedEventDate = `${cleanDateVal}T${eventTimeVal}:00`

  const payload = {
    title: eventData.title,
    description: eventData.description || eventData.title,
    location: eventData.venue || eventData.location || 'Colombo',
    venue: eventData.venue || eventData.location || 'Colombo',
    price: minPrice,
    eventDate: formattedEventDate,
    utcOffsetMinutes: -new Date(formattedEventDate).getTimezoneOffset(),
    categoryId: catId,
    imageUrl: eventData.coverImage || null,
    availableTickets: totalCap,
    artistOrOrganizer: eventData.artistOrOrganizer || 'Organizer Event',
    organizerName: eventData.organizerName,
    category: eventData.categoryName || eventData.category || 'Music & Concerts',
    categoryName: eventData.categoryName || eventData.category || 'Music & Concerts',
    date: cleanDateVal,
    time: eventTimeVal,
    eventTime: eventTimeVal,
    ticketTiersJson: JSON.stringify(tiersList),
    ticketTiers: tiersList.map((t) => ({
      id: String(t.id),
      name: t.name,
      price: Number(t.price) || 0,
      quantity: Number(t.quantity) || 0,
    })),
    coverImage: eventData.coverImage || null,
  }

  return requestEvent('', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
}

// PUT update event
export const updateEvent = (id, eventData) => {
  const tiersList = eventData.ticketTiers || []
  const minPrice =
    tiersList.length > 0 ? Math.min(...tiersList.map((t) => Number(t.price) || 0)) : Number(eventData.price) || 0

  const totalCap =
    tiersList.length > 0
      ? tiersList.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
      : Number(eventData.availableTickets) || 500

  const catId = resolveCategoryId(eventData)

  const eventTimeVal = eventData.time || eventData.eventTime || '19:00'
  let cleanDateVal = eventData.date || eventData.eventDate || localDate()
  if (typeof cleanDateVal === 'string' && cleanDateVal.includes('T')) {
    cleanDateVal = cleanDateVal.split('T')[0]
  }

  const formattedEventDate = `${cleanDateVal}T${eventTimeVal}:00`

  const isHiddenState = Boolean(
    eventData.isHidden ||
    eventData.IsHidden ||
    eventData.is_hidden ||
    eventData.IsHidder === 1 ||
    eventData.IsHidder === true ||
    eventData.isHidder === 1 ||
    eventData.isHidder === true ||
    eventData.status === 'hidden',
  )

  const payload = {
    ...eventData,
    price: minPrice,
    availableTickets: totalCap,
    categoryId: catId,
    category: eventData.categoryName || eventData.category || 'Music & Concerts',
    categoryName: eventData.categoryName || eventData.category || 'Music & Concerts',
    organizerName: eventData.organizerName,
    eventDate: formattedEventDate,
    utcOffsetMinutes: -new Date(formattedEventDate).getTimezoneOffset(),
    date: cleanDateVal,
    time: eventTimeVal,
    eventTime: eventTimeVal,
    isHidden: isHiddenState,
    IsHidden: isHiddenState,
    IsHidder: isHiddenState,
    isHidder: isHiddenState,
    ticketTiersJson: JSON.stringify(tiersList),
    ticketTiers: tiersList.map((t) => ({
      id: String(t.id),
      name: t.name,
      price: Number(t.price) || 0,
      quantity: Number(t.quantity) || 0,
    })),
  }

  return requestEvent(`/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
}

// DELETE event
export const setEventVisibility = (id, isHidden) =>
  requestEvent(`/${id}/visibility`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ isHidden }),
  })

export const deleteEvent = (id) =>
  requestEvent(`/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

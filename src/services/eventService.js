// Catalog service and gateway URLs
const CANDIDATE_URLS = ['http://localhost:5255/api/catalog/events', 'http://localhost:5000/api/catalog/events']

const CATEGORY_CANDIDATE_URLS = [
  'http://localhost:5255/api/catalog/categories',
  'http://localhost:5000/api/catalog/categories',
]

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
  for (const url of CATEGORY_CANDIDATE_URLS) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        const categories = await response.json()
        if (Array.isArray(categories) && categories.length > 0) {
          return categories
        }
      }
    } catch (err) {
      console.warn(`Could not fetch categories from ${url}:`, err.message)
    }
  }
  return DEFAULT_CATEGORIES
}

const fetchWithFallback = async (endpoint = '', options = {}) => {
  let lastError = null

  for (const baseUrl of CANDIDATE_URLS) {
    try {
      const url = `${baseUrl}${endpoint}`
      const res = await fetch(url, options)

      if (res.ok) {
        return res
      }
      lastError = new Error(`HTTP ${res.status} from ${url}`)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Backend service endpoints unreachable')
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

// The Catalog API is authoritative; never merge browser-stored events into it.
const requestEvent = async (endpoint, options) => {
  const response = await fetchWithFallback(endpoint, { cache: 'no-store', ...options })
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status}). Please try again.`)
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  const data = JSON.parse(text)
  return Array.isArray(data) ? data.map(normalizeEvent) : normalizeEvent(data)
}

const requestEventList = async (endpoint, headers) => {
  const events = await requestEvent(endpoint, { method: 'GET', headers })
  if (!Array.isArray(events)) throw new Error('Invalid event list from Catalog API')
  return events
}

// GET all published events (Public)
export const getAllEvents = () => requestEventList('', { 'Content-Type': 'application/json' })

// GET event by ID
export const getEventById = (id) =>
  requestEvent(`/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
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

  const catId = Number(eventData.categoryId) || 1

  const eventTimeVal = eventData.time || eventData.eventTime || '19:00'
  let cleanDateVal = eventData.date || eventData.eventDate || new Date().toISOString().slice(0, 10)
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
    categoryId: catId,
    organizerId: Number(eventData.organizerId) || 1,
    imageUrl: eventData.coverImage || null,
    availableTickets: totalCap,
    artistOrOrganizer: eventData.artistOrOrganizer || 'Organizer Event',
    category: eventData.categoryName || eventData.category || 'Music & Concerts',
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

  const catId = Number(eventData.categoryId) || 1

  const eventTimeVal = eventData.time || eventData.eventTime || '19:00'
  let cleanDateVal = eventData.date || eventData.eventDate || new Date().toISOString().slice(0, 10)
  if (typeof cleanDateVal === 'string' && cleanDateVal.includes('T')) {
    cleanDateVal = cleanDateVal.split('T')[0]
  }

  const formattedEventDate = `${cleanDateVal}T${eventTimeVal}:00`

  const payload = {
    ...eventData,
    price: minPrice,
    availableTickets: totalCap,
    categoryId: catId,
    eventDate: formattedEventDate,
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
  }

  return requestEvent(`/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
}

// DELETE event
export const deleteEvent = (id) =>
  requestEvent(`/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })

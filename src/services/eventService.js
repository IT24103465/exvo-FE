// Catalog service and gateway URLs
const CANDIDATE_URLS = [
  'http://localhost:5000/api/catalog/events',
  'http://localhost:5255/api/catalog/events',
];

const CATEGORY_CANDIDATE_URLS = [
  'http://localhost:5000/api/catalog/categories',
  'http://localhost:5255/api/catalog/categories',
];

export const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Music & Concerts', description: 'Live music events and festivals' },
  { id: 2, name: 'Concert', description: 'Concerts and live performances' },
  { id: 3, name: 'Festival', description: 'Music and cultural festivals' },
  { id: 4, name: 'Live Session', description: 'Intimate live sessions' },
  { id: 5, name: 'DJ Night', description: 'EDM and DJ night events' },
  { id: 6, name: 'Acoustic', description: 'Unplugged acoustic sets' },
  { id: 7, name: 'Stand-Up', description: 'Comedy and stand-up shows' },
  { id: 8, name: 'EDM Arena', description: 'Electronic dance music festivals' }
];

export const getCategories = async () => {
  for (const url of CATEGORY_CANDIDATE_URLS) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const categories = await response.json();
        if (Array.isArray(categories) && categories.length > 0) {
          return categories;
        }
      }
    } catch (err) {
      console.warn(`Could not fetch categories from ${url}:`, err.message);
    }
  }
  return DEFAULT_CATEGORIES;
};

const fetchWithFallback = async (endpoint = '', options = {}) => {
  let lastError = null;

  for (const baseUrl of CANDIDATE_URLS) {
    try {
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, options);

      // If status is 404, 502, 503, try next candidate URL
      if ((!endpoint && res.status === 404) || res.status === 502 || res.status === 503) {
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Backend service endpoints unreachable');
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// The Catalog API is authoritative; never merge browser-stored events into it.
const requestEvent = async (endpoint, options) => {
  const response = await fetchWithFallback(endpoint, { cache: 'no-store', ...options });
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status}). Please try again.`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const requestEventList = async (endpoint, headers) => {
  const events = await requestEvent(endpoint, { method: 'GET', headers });
  if (!Array.isArray(events)) throw new Error('Invalid event list from Catalog API');
  return events;
};

// GET all published events (Public)
export const getAllEvents = () => requestEventList('', { 'Content-Type': 'application/json' });

// GET event by ID
export const getEventById = (id) => requestEvent(`/${id}`, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
});

// GET logged-in organizer's events
export const getMyEvents = () => requestEventList('/my-events', getAuthHeaders());

// POST create event
export const createEvent = async (eventData) => {
  const minPrice = eventData.ticketTiers && eventData.ticketTiers.length > 0
    ? Math.min(...eventData.ticketTiers.map((t) => Number(t.price) || 0))
    : (Number(eventData.price) || 0);

  const totalCap = eventData.ticketTiers && eventData.ticketTiers.length > 0
    ? eventData.ticketTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
    : (Number(eventData.availableTickets) || 500);

  const catId = Number(eventData.categoryId) || 1;

  const payload = {
    title: eventData.title,
    description: eventData.description || eventData.title,
    location: eventData.venue || eventData.location || 'Colombo',
    venue: eventData.venue || eventData.location || 'Colombo',
    price: minPrice,
    eventDate: eventData.date ? new Date(`${eventData.date}T${eventData.time || '19:00'}:00`).toISOString() : new Date().toISOString(),
    categoryId: catId,
    organizerId: Number(eventData.organizerId) || 1,
    imageUrl: eventData.coverImage || null,
    availableTickets: totalCap,
    artistOrOrganizer: eventData.artistOrOrganizer || 'Organizer Event',
    category: eventData.categoryName || eventData.category || 'Music & Concerts',
    date: eventData.date,
    time: eventData.time || '19:00',
    ticketTiers: (eventData.ticketTiers || []).map((t) => ({
      id: String(t.id),
      name: t.name,
      price: Number(t.price) || 0,
      quantity: Number(t.quantity) || 0,
    })),
    coverImage: eventData.coverImage || null,
  };

  return requestEvent('', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
};

// PUT update event
export const updateEvent = (id, eventData) => requestEvent(`/${id}`, {
  method: 'PUT',
  headers: getAuthHeaders(),
  body: JSON.stringify(eventData),
});

// DELETE event
export const deleteEvent = (id) => requestEvent(`/${id}`, {
  method: 'DELETE',
  headers: getAuthHeaders(),
});

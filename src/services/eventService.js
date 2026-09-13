const configuredApiBaseUrl = typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL = (configuredApiBaseUrl || 'http://localhost:5000').replace(/\/$/, '');
const EVENTS_API_URL = `${API_BASE_URL}/api/events`;
const CATEGORIES_API_URL = `${API_BASE_URL}/api/categories`;

export const getCategories = async () => {
  const response = await fetch(CATEGORIES_API_URL, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Categories request failed (${response.status})`);
  return response.json();
};

const fetchWithFallback = async (endpoint = '', options = {}) => {
  const url = `${EVENTS_API_URL}${endpoint}`;
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const normalizeEvent = (ev) => {
  if (!ev) return ev;
  const hasTierData = ev.ticketTiersJson !== undefined || ev.ticketTiers !== undefined;
  let tiers = [];
  if (ev.ticketTiersJson) {
    try {
      tiers = typeof ev.ticketTiersJson === 'string' ? JSON.parse(ev.ticketTiersJson) : ev.ticketTiersJson;
    } catch (err) {
      console.warn('Failed to parse ticketTiersJson from API:', err);
    }
  } else if (typeof ev.ticketTiers === 'string') {
    try {
      tiers = JSON.parse(ev.ticketTiers);
    } catch (err) {
      console.warn('Failed to parse ticketTiers string from API:', err);
    }
  } else if (Array.isArray(ev.ticketTiers)) {
    tiers = ev.ticketTiers;
  }

  return {
    ...ev,
    ...(hasTierData ? { ticketTiers: Array.isArray(tiers) ? tiers : [] } : {}),
  };
};

// The Catalog API is authoritative; never merge browser-stored events into it.
const requestEvent = async (endpoint, options) => {
  const response = await fetchWithFallback(endpoint, { cache: 'no-store', ...options });
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status}). Please try again.`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  const data = JSON.parse(text);
  return Array.isArray(data) ? data.map(normalizeEvent) : normalizeEvent(data);
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
  const tiersList = eventData.ticketTiers || [];
  const minPrice = tiersList.length > 0
    ? Math.min(...tiersList.map((t) => Number(t.price) || 0))
    : (Number(eventData.price) || 0);

  const totalCap = tiersList.length > 0
    ? tiersList.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
    : (Number(eventData.availableTickets) || 500);

  const catId = Number(eventData.categoryId) || 1;

  const formattedEventDate = eventData.date
    ? `${eventData.date}T${eventData.time || '19:00'}:00`
    : new Date().toISOString().slice(0, 19);

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
    date: eventData.date,
    time: eventData.time || '19:00',
    ticketTiersJson: JSON.stringify(tiersList),
    ticketTiers: tiersList.map((t) => ({
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
export const updateEvent = (id, eventData) => {
  const tiersList = eventData.ticketTiers || [];
  const minPrice = tiersList.length > 0
    ? Math.min(...tiersList.map((t) => Number(t.price) || 0))
    : (Number(eventData.price) || 0);

  const totalCap = tiersList.length > 0
    ? tiersList.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
    : (Number(eventData.availableTickets) || 500);

  const catId = Number(eventData.categoryId) || 1;

  const payload = {
    ...eventData,
    price: minPrice,
    availableTickets: totalCap,
    categoryId: catId,
    ticketTiersJson: JSON.stringify(tiersList),
    ticketTiers: tiersList.map((t) => ({
      id: String(t.id),
      name: t.name,
      price: Number(t.price) || 0,
      quantity: Number(t.quantity) || 0,
    })),
  };

  return requestEvent(`/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
};

// DELETE event
export const deleteEvent = (id) => requestEvent(`/${id}`, {
  method: 'DELETE',
  headers: getAuthHeaders(),
});

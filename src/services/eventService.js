// Primary direct service URL & Gateway URLs
const CANDIDATE_URLS = [
  'http://localhost:5284/api/events',
  'http://localhost:5284/api/auth/events',
  'http://localhost:5000/api/events',
  'http://localhost:5000/api/auth/events',
];

const fetchWithFallback = async (endpoint = '', options = {}) => {
  let lastError = null;

  for (const baseUrl of CANDIDATE_URLS) {
    try {
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, options);

      // If status is 404, 502, 503, try next candidate URL
      if (res.status === 404 || res.status === 502 || res.status === 503) {
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      // Network error (e.g. port closed), continue to next URL
    }
  }

  throw lastError || new Error('All backend service endpoints unreachable.');
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// GET all published events (Public)
export const getAllEvents = async () => {
  try {
    const response = await fetchWithFallback('', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (err) {
    console.warn('Could not fetch events from backend:', err.message);
    return [];
  }
};

// GET event by ID
export const getEventById = async (id) => {
  const response = await fetchWithFallback(`/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Event not found');
  }

  return await response.json();
};

// GET logged-in organizer's events
export const getMyEvents = async () => {
  const response = await fetchWithFallback('/my-events', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    return [];
  }

  return await response.json();
};

// POST create event
export const createEvent = async (eventData) => {
  const payload = {
    title: eventData.title,
    artistOrOrganizer: eventData.artistOrOrganizer,
    category: eventData.category || 'Concert',
    date: eventData.date,
    time: eventData.time || '19:00',
    venue: eventData.venue,
    ticketTiers: (eventData.ticketTiers || []).map((t) => ({
      id: String(t.id),
      name: t.name,
      price: Number(t.price) || 0,
      quantity: Number(t.quantity) || 0,
    })),
    coverImage: eventData.coverImage || null,
    description: eventData.description || null,
  };

  const response = await fetchWithFallback('', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  let data = {};
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.message || `Failed to create event with status ${response.status}`);
  }

  return data;
};

// PUT update event
export const updateEvent = async (id, eventData) => {
  const response = await fetchWithFallback(`/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    throw new Error('Failed to update event');
  }

  return await response.json();
};

// DELETE event
export const deleteEvent = async (id) => {
  const response = await fetchWithFallback(`/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete event');
  }

  return await response.json();
};

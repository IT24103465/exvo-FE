import { test as base, expect } from '@playwright/test'

export const attendee = {
  id: 'attendee-1',
  fullName: 'Asha Perera',
  name: 'Asha Perera',
  email: 'asha@example.test',
  role: 'Attendee',
}

export const organizer = {
  id: 'organizer-1',
  fullName: 'Nimal Events',
  name: 'Nimal Events',
  email: 'organizer@example.test',
  role: 'Organizer',
  companyName: 'Nimal Events',
}

export const demoEvent = {
  id: 101,
  title: 'Neon Horizon Live',
  artistOrOrganizer: 'Sarith & News',
  category: 'Concert',
  venue: 'Lotus Tower Arena, Colombo',
  eventDate: '2026-12-12T19:30:00',
  eventTime: '19:30',
  cover: '',
  availableTickets: 250,
  ticketTiers: [
    { id: 1, name: 'General Admission', price: 3500, quantity: 200 },
    { id: 2, name: 'VIP Pass', price: 7500, quantity: 50 },
  ],
}

export const demoOrganizerEvent = {
  ...demoEvent,
  eventId: demoEvent.id,
  eventDate: `${new Date().toISOString().slice(0, 10)}T19:30:00`,
}

export const tickets = [
  {
    id: 'ticket-1',
    ticketCode: 'EXVO-GA-1001',
    eventId: demoEvent.id,
    eventName: demoEvent.title,
    ticketType: 'General Admission',
    attendeeName: attendee.fullName,
    venue: demoEvent.venue,
    eventDate: demoEvent.eventDate,
    status: 'ACTIVE',
    qrCode: 'EXVO-GA-1001',
  },
]

export const bookingRecords = [{ eventId: demoEvent.id, tickets }]

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

export const mockApi = async (page, options = {}) => {
  const state = {
    user: options.user || null,
    events: options.events || [demoEvent],
    tickets: options.tickets || tickets,
    checkIns: new Map(),
    failEvents: Boolean(options.failEvents),
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/api/catalog/categories') {
      return json(route, [
        { id: 2, name: 'Concert', description: 'Live performances' },
        { id: 3, name: 'Festival', description: 'Festivals' },
      ])
    }

    if (path === '/api/catalog/events' && method === 'GET') {
      if (state.failEvents) return json(route, { message: 'Catalog unavailable' }, 503)
      return json(route, state.events)
    }

    if (path === '/api/catalog/events/my-events' && method === 'GET') {
      return json(route, state.user?.role === 'Organizer' ? [demoOrganizerEvent] : [])
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = request.postDataJSON()
      if (body.email === 'invalid@example.test') return json(route, { message: 'Invalid credentials' }, 401)
      const user = body.email?.includes('organizer') ? organizer : attendee
      state.user = user
      return json(route, { token: `mock-token-${user.role.toLowerCase()}`, user, ...user })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      return state.user ? json(route, { name: state.user.fullName, email: state.user.email }) : json(route, {}, 401)
    }

    if (path === '/api/auth/register' && method === 'POST') {
      const body = request.postDataJSON()
      if (body.email === 'duplicate@example.test') return json(route, { message: 'Email already registered' }, 409)
      return json(route, {
        token: 'mock-registration-token',
        user: { ...attendee, fullName: body.fullName, email: body.email },
      })
    }

    if (path === '/api/booking/my-tickets' && method === 'GET')
      return json(route, [{ eventId: demoEvent.id, tickets: state.tickets }])
    if (path.match(/^\/api\/booking\/events\/\d+\/availability$/)) {
      return json(route, { eventId: demoEvent.id, availableSeatCount: 250, availableTickets: 250 })
    }
    if (path.match(/^\/api\/booking\/events\/\d+\/seating-plan$/)) {
      return json(route, { eventId: demoEvent.id, sections: [] })
    }
    if (path.match(/^\/api\/booking\/events\/\d+\/general-bookings$/) && method === 'POST') {
      return json(
        route,
        {
          bookingReference: 'EXVO-BOOK-1001',
          tickets: [{ ...tickets[0], ticketCode: 'EXVO-GA-1002' }],
        },
        201,
      )
    }

    if (path === '/api/coordinator/events' && method === 'GET') {
      return json(
        route,
        state.user?.role === 'Organizer' ? [demoOrganizerEvent] : [],
        state.user?.role === 'Organizer' ? 200 : 403,
      )
    }
    if (path.match(/^\/api\/coordinator\/events\/\d+\/access$/)) return json(route, { scannerAccess: true })
    if (path.match(/^\/api\/coordinator\/events\/\d+\/validate$/) && method === 'POST') {
      const code = request.postDataJSON()?.ticketCode
      const status =
        code === 'VALID-1001'
          ? 'VALID'
          : code === 'WRONG-1001'
            ? 'WRONG_EVENT'
            : code === 'USED-1001'
              ? 'ALREADY_USED'
              : 'INVALID'
      return json(
        route,
        {
          status,
          ticketCode: code,
          ticketId: code,
          attendeeName: 'Asha Perera',
          ticketType: 'General Admission',
          eventName: demoEvent.title,
          seatCode: 'GA',
          message: status === 'VALID' ? 'Ticket is valid. Confirm check-in.' : `Ticket validation result: ${status}`,
          isCheckedIn: status === 'ALREADY_USED',
        },
        status === 'INVALID' ? 422 : 200,
      )
    }
    if (path.match(/^\/api\/coordinator\/events\/\d+\/check-in$/) && method === 'POST') {
      const code = request.postDataJSON()?.ticketCode
      state.checkIns.set(code, true)
      return json(route, {
        status: 'CHECKED_IN',
        ticketCode: code,
        attendeeName: 'Asha Perera',
        message: 'Check-in confirmed.',
      })
    }
    if (path.match(/^\/api\/(analytics|checkin\/analytics)\/.*$/)) {
      return json(route, {
        totalTickets: 250,
        soldTickets: 120,
        checkedInTickets: 45,
        remainingTickets: 130,
        totalRevenue: 420000,
        occupancyRate: 18,
        hourlyAttendance: [{ hour: '19:00', count: 45 }],
        eventName: demoEvent.title,
      })
    }

    return json(route, {})
  })

  return state
}

export const test = base.extend({
  mockApi: async ({ page }, use) => {
    await use(await mockApi(page))
  },
})

export { expect }

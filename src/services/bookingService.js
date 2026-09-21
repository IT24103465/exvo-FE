import { fetchApi } from './apiConfig.js'

const authHeaders = () => {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const request = async (path, options = {}) => {
  const response = await fetchApi(path, { ...options, headers: { ...authHeaders(), ...options.headers } })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || error?.Message || `Unable to complete the seating plan request (${response.status}).`)
  }
  return response.status === 204 ? null : response.json()
}

export const getAttendeeSeatingPlan = (eventId) => request(`/api/booking/events/${eventId}/seating-plan`)

export const getEventAvailability = (eventId) => request(`/api/booking/events/${eventId}/availability`)

export const getOrganizerSeatingPlan = (eventId) => request(`/api/booking/organizer/events/${eventId}/seating-plan`)

export const saveSeatingPlan = (eventId, plan) =>
  request(`/api/booking/events/${eventId}/seating-plan`, {
    method: plan.id ? 'PUT' : 'POST',
    body: JSON.stringify(plan),
  })

export const bookingPlanToSeatingConfig = (plan) => ({
  enabled: Boolean(plan?.isVisibleToAttendees),
  autoSyncCategories: false,
  stageLabel: 'SCREEN',
  zones: (plan?.sections || []).map((section) => ({
    id: String(section.id),
    name: section.name,
    price: Number(section.price) || 0,
    rows: Array.from({ length: section.rowCount }, (_, index) => {
      let value = String(section.startingRowLabel || 'A').toUpperCase()
      for (let step = 0; step < index; step += 1) {
        value = value.replace(/[A-Z]+$/, (label) => {
          let number = 0
          for (const character of label) number = number * 26 + character.charCodeAt(0) - 64
          number += 1
          let next = ''
          while (number > 0) {
            number -= 1
            next = String.fromCharCode(65 + (number % 26)) + next
            number = Math.floor(number / 26)
          }
          return next
        })
      }
      return value
    }),
    seatsPerRow: section.seatsPerRow,
    occupiedSeats: [],
    ticketTierId: section.ticketTierId,
  })),
})

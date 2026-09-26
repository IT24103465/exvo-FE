import { useState, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import './App.css'
import { EventSkeleton, EventLoadError } from './components/EventListState'
import { localDate, minimumEventTime, validateEventSchedule, isEventExpired, eventStartTimestamp } from './services/eventDateTime'
import { useEventExpiry } from './components/useEventExpiry'
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUserProfile,
  updateUserProfile,
  deleteUserAccount,
} from './services/authService'
import {
  getAllEvents,
  getMyEvents,
  createEvent,
  updateEvent,
  setEventVisibility,
  deleteEvent,
  getCategories,
  getEventTicketSnapshot,
} from './services/eventService'
import {
  bookingPlanToSeatingConfig,
  confirmGeneralBooking,
  confirmSeatHold,
  getAttendeeSeatingPlan,
  getEventAvailability,
  getMyTickets,
  getOrganizerSeatingPlan,
  holdSeats,
  releaseSeatHold,
  saveSeatingPlan,
  submitBookingTicketImages,
} from './services/bookingService'

import backgroundVideo from './assets/bg_video.mp4'
const ExvoLogo = () => (
  <svg className="w-10 h-10" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Right vertical bar */}
    <path d="M 80 11 L 90 5 L 90 115 L 80 109 Z" fill="#FF0000" />
    {/* Stripe A1 (short top-left) */}
    <path d="M 24 24.6 L 60 3 L 60 13 L 24 34.6 Z" fill="#FF0000" />
    {/* Stripe A2 (long top) */}
    <path d="M 24 44.6 L 80 11 L 80 21 L 24 54.6 Z" fill="#FF0000" />
    {/* Stripe A3 & B3 (inner chevron) */}
    <path d="M 31.7 60 L 70 37 L 70 47 L 48.3 60 L 70 73 L 70 83 Z" fill="#FF0000" />
    {/* Stripe B2 (long bottom) */}
    <path d="M 24 65.4 L 80 99 L 80 109 L 24 75.4 Z" fill="#FF0000" />
    {/* Stripe B1 (short bottom-left) */}
    <path d="M 24 85.4 L 60 107 L 60 117 L 24 95.4 Z" fill="#FF0000" />
  </svg>
)

const EventPoster = ({ src, title, className = '', loading }) =>
  src ? (
    <img src={src} alt={title} className={className} loading={loading} draggable="false" />
  ) : (
    <div className={`event-title-poster ${className}`} role="img" aria-label={`${title || 'Untitled Event'} poster`}>
      <span>{title || 'Untitled Event'}</span>
    </div>
  )

const readAuthState = () => {
  const token = localStorage.getItem('token')
  let user = null

  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    localStorage.removeItem('user')
  }

  return { isAuthenticated: Boolean(token), user }
}

const getUserDetails = (user) => {
  const details = user?.user || user || {}
  const id = details.id || details.userId || details.organizerId || details.sub || null
  const name = details.fullName || details.name || details.username || details.companyName || 'Exvo Member'
  const email = details.email || 'Email unavailable'
  const role = details.role || 'Attendee'
  const companyName = details.companyName || ''
  const companyRegNumber = details.companyRegNumber || ''
  const contactNumber = details.contactNumber || details.phoneNumber || ''
  const address = details.address || ''
  const profilePicture = details.profilePicture || ''
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'E'

  return { id, name, email, role, companyName, companyRegNumber, contactNumber, address, profilePicture, initials }
}

const HIDDEN_EVENTS_STORAGE_KEY = 'exvo_hidden_event_ids'

const getHiddenEventIds = () => {
  try {
    const raw = localStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const addHiddenEventId = (id) => {
  try {
    const ids = getHiddenEventIds()
    const strId = String(id)
    if (!ids.includes(strId)) {
      const updated = [...ids, strId]
      localStorage.setItem(HIDDEN_EVENTS_STORAGE_KEY, JSON.stringify(updated))
    }
  } catch (err) {
    console.error('Failed to save hidden event ID:', err)
  }
}

const removeHiddenEventId = (id) => {
  try {
    const ids = getHiddenEventIds()
    const strId = String(id)
    const updated = ids.filter((i) => i !== strId)
    localStorage.setItem(HIDDEN_EVENTS_STORAGE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to remove hidden event ID:', err)
  }
}

const formatDateForInput = (rawDate) => {
  if (!rawDate) return ''
  const str = String(rawDate).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (str.includes('T')) return str.split('T')[0]
  if (str.includes(' ')) {
    const part = str.split(' ')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part
  }
  const d = new Date(rawDate)
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return ''
}

const extractTimeFromEvent = (e) => {
  if (!e) return '19:00'

  const directTime = e.time || e.eventTime
  if (
    directTime &&
    typeof directTime === 'string' &&
    directTime.trim() !== '' &&
    directTime !== 'undefined' &&
    directTime !== 'null'
  ) {
    const cleanTime = directTime.trim()
    const match = cleanTime.match(/^(\d{1,2}):(\d{2})/)
    if (match) {
      const hh = match[1].padStart(2, '0')
      const mm = match[2]
      return `${hh}:${mm}`
    }
  }

  const dateVal = e.eventDate || e.date
  if (dateVal && typeof dateVal === 'string') {
    const cleanDate = dateVal.trim()
    let timePart = ''
    if (cleanDate.includes('T')) {
      timePart = cleanDate.split('T')[1]
    } else if (cleanDate.includes(' ')) {
      timePart = cleanDate.split(' ')[1]
    }

    if (timePart) {
      const match = timePart.match(/^(\d{1,2}):(\d{2})/)
      if (match) {
        const hh = match[1].padStart(2, '0')
        const mm = match[2]
        return `${hh}:${mm}`
      }
    }
  }

  return '19:00'
}

const syncSeatingZonesWithTicketTiers = (ticketTiers, existingZones = []) => {
  if (!ticketTiers || ticketTiers.length === 0) return existingZones
  const defaultRowSets = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F', 'G'],
    ['H', 'I', 'J'],
    ['K', 'L', 'M'],
    ['N', 'O', 'P'],
  ]
  return ticketTiers.map((tier, idx) => {
    const existing = existingZones[idx]
    const name = (tier.name || `Category ${idx + 1}`).toUpperCase()
    const price = Number(tier.price) || 0
    const rows = existing?.rows?.length ? existing.rows : defaultRowSets[idx % defaultRowSets.length] || ['A', 'B']
    const seatsPerRow = existing?.seatsPerRow || 12
    const occupiedSeats = existing?.occupiedSeats || []
    const id = existing?.id || `zone-tier-${idx + 1}`
    return {
      id,
      ticketTierId: tier.id ? String(tier.id) : null,
      name,
      price,
      rows,
      seatsPerRow,
      occupiedSeats,
    }
  })
}

const createDefaultSeatingConfig = (ticketTiers = []) => {
  const defaultZones = [
    {
      id: 'z-classic',
      name: 'GENERAL ADMISSION',
      price: 2500,
      rows: ['A', 'B', 'C'],
      seatsPerRow: 13,
      occupiedSeats: [],
    },
    {
      id: 'z-premium',
      name: 'VIP PASS',
      price: 5000,
      rows: ['D', 'E', 'F', 'G'],
      seatsPerRow: 13,
      occupiedSeats: ['E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'F5', 'F6', 'F7', 'F8', 'F9', 'G5', 'G6', 'G7', 'G8', 'G9'],
    },
  ]
  if (ticketTiers && ticketTiers.length > 0) {
    return {
      enabled: true,
      autoSyncCategories: true,
      stageLabel: 'SCREEN',
      zones: syncSeatingZonesWithTicketTiers(ticketTiers, defaultZones),
    }
  }
  return {
    enabled: true,
    autoSyncCategories: true,
    stageLabel: 'SCREEN',
    zones: defaultZones,
  }
}

const SeatingChartComponent = ({
  seatingConfig,
  isOrganizerEdit = false,
  selectedSeats = [],
  onSelectSeat = () => {},
  onToggleOccupied = () => {},
}) => {
  if (!seatingConfig || !seatingConfig.enabled || !seatingConfig.zones || seatingConfig.zones.length === 0) return null

  const stageLabel = seatingConfig.stageLabel || 'SCREEN'

  return (
    <div className="seating-chart-container bg-[#111114] text-neutral-100 rounded-xl p-4 sm:p-6 shadow-[0_16px_45px_rgba(0,0,0,0.35)] overflow-x-auto my-3 border border-white/10">
      {/* ── Screen Arc Header ── */}
      <div className="flex flex-col items-center justify-center mb-6">
        <div className="relative w-full max-w-md h-10 flex items-center justify-center overflow-hidden">
          <svg className="absolute inset-0 w-full h-full text-neutral-300" viewBox="0 0 400 40" fill="none">
            <path
              d="M 10 35 Q 200 5 390 35"
              stroke="currentColor"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span className="relative z-10 text-[11px] font-black font-sans tracking-[0.25em] uppercase text-white bg-[#111114] px-3">
            {stageLabel}
          </span>
        </div>

        {/* ── Status Legend ── */}
        <div className="flex items-center justify-center gap-6 mt-3 text-xs text-neutral-400 font-sans font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-neutral-500 bg-[#18181c]" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 border border-amber-500 shadow-sm" />
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-neutral-700 border border-neutral-600" />
            <span>Unavailable</span>
          </div>
        </div>
      </div>

      {/* ── Aisle Column Headers ── */}
      <div className="flex items-center justify-between text-[9px] font-bold text-neutral-400 font-mono tracking-wider mb-3 px-2">
        <span>CL-AIS</span>
        <span>CL-AIS</span>
      </div>

      {/* ── Seating Zones & Rows ── */}
      <div className="space-y-6 min-w-[500px]">
        {seatingConfig.zones.map((zone) => (
          <div key={zone.id || zone.name} className="space-y-2">
            {/* Section Title */}
            <div className="text-center font-bold text-xs text-neutral-200 uppercase font-sans tracking-wide">
              {zone.name} ({Number(zone.price || 0).toFixed(2)})
            </div>

            {/* Zone Rows */}
            <div className="space-y-1.5">
              {(zone.rows || ['A']).map((rowLetter) => (
                <div key={rowLetter} className="flex items-center justify-between gap-2 text-xs font-sans">
                  {/* Left Row Letter */}
                  <span className="w-6 text-right font-bold text-neutral-400 text-[11px] shrink-0">{rowLetter}</span>

                  {/* Seat Grid */}
                  <div className="flex items-center justify-center gap-1.5 flex-1 flex-wrap">
                    {(zone.seatsByRow?.[rowLetter] ||
                      Array.from({ length: zone.seatsPerRow || 10 }, (_, i) => ({
                        seatCode: `${rowLetter}-${i + 1}`,
                        seatNumber: i + 1,
                        status: zone.occupiedSeats?.includes(`${rowLetter}${i + 1}`) ? 'Booked' : 'Available',
                        isEnabled: true,
                        price: zone.price,
                      }))).map((seat) => {
                      const seatId = seat.seatCode
                      const seatNum = seat.seatNumber
                      const isUnavailable = !seat.isEnabled || seat.status !== 'Available'
                      const isSelected = selectedSeats.includes(seatId)

                      let seatClass =
                        'w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-md border text-[10px] md:text-xs font-semibold flex items-center justify-center transition-all duration-150 cursor-pointer shadow-sm select-none'

                      if (isSelected) {
                        seatClass +=
                          ' bg-amber-400 text-neutral-900 border-amber-500 font-bold scale-105 shadow-md shadow-amber-400/40'
                      } else if (isUnavailable) {
                        seatClass += ' bg-neutral-700/80 text-neutral-500 border-neutral-600 opacity-90'
                        if (!isOrganizerEdit) {
                          seatClass += ' cursor-not-allowed'
                        }
                      } else {
                        seatClass +=
                          ' bg-[#18181c] text-neutral-200 border-white/20 hover:border-amber-400 hover:bg-white/10'
                      }

                      return (
                        <button
                          key={seatId}
                          type="button"
                          title={`Row ${rowLetter}, Seat ${seatNum} (${zone.name} - LKR ${seat.price})`}
                          disabled={isUnavailable && !isOrganizerEdit}
                          onClick={() => {
                            if (isOrganizerEdit) {
                              onToggleOccupied(seatId)
                            } else {
                              if (!isUnavailable) {
                                onSelectSeat(seatId, zone)
                              }
                            }
                          }}
                          className={seatClass}
                        >
                          {seatNum}
                        </button>
                      )
                    })}
                  </div>

                  {/* Right Row Letter */}
                  <span className="w-6 text-left font-bold text-neutral-400 text-[11px] shrink-0">{rowLetter}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isOrganizerEdit && (
        <div className="mt-4 pt-3 border-t border-neutral-200 text-center text-[10px] text-neutral-500 font-sans">
          Click any seat above to toggle its reservation status (Occupied vs Available) for your event attendees.
        </div>
      )}
    </div>
  )
}

const seatingPlanToChartConfig = (plan) => ({
  enabled: true,
  stageLabel: 'SCREEN',
  zones: (plan?.sections || []).map((section) => {
    const seats = section.seats || []
    const rows = [...new Set(seats.map((seat) => seat.rowLabel))]
    return {
      id: section.id,
      name: section.name,
      price: section.price,
      rows,
      seatsPerRow: section.seatsPerRow,
      seatsByRow: seats.reduce((groups, seat) => {
        groups[seat.rowLabel] = [...(groups[seat.rowLabel] || []), seat]
        return groups
      }, {}),
      occupiedSeats: [],
    }
  }),
})

const seatingConfigToBookingPlan = (config, ticketTiers = []) => ({
  name: 'Event seating plan',
  isVisibleToAttendees: Boolean(config?.enabled),
  sections: (config?.zones || []).map((zone, index) => ({
    name: zone.name || `Section ${index + 1}`,
    rowCount: Array.isArray(zone.rows) && zone.rows.length > 0 ? zone.rows.length : 1,
    seatsPerRow: Math.max(1, Number(zone.seatsPerRow) || 1),
    startingRowLabel: zone.rows?.[0] || String.fromCharCode(65 + index),
    startingSeatNumber: 1,
    ticketTierId: zone.ticketTierId
      ? Number(zone.ticketTierId)
      : ticketTiers.find(
          (tier) => tier.name?.toUpperCase() === zone.name?.toUpperCase() || Number(tier.price) === Number(zone.price),
        )?.id || null,
    price: Number(zone.price) || Number(ticketTiers[index]?.price) || 0,
    displayOrder: index,
    disabledSeatCodes: (zone.occupiedSeats || []).map((code) => {
      const match = String(code).match(/^([A-Z]+)(\d+)$/i)
      return match ? `${match[1].toUpperCase()}-${Number(match[2]).toString().padStart(2, '0')}` : code
    }),
  })),
})

const availableSeatsInPlan = (plan) =>
  (plan?.sections || []).flatMap((section) =>
    (section.seats || []).filter((seat) => seat.isEnabled && seat.status === 'Available'),
  )

const ticketHasAssignedSeat = (ticket) =>
  ticket?.hasSeat === true || (ticket?.hasSeat !== false && ticket?.rowLabel && ticket.rowLabel !== 'GA')

const ticketIdentity = (ticket) =>
  ticket?.ticketCode || `${ticket?.booking?.bookingReference || 'ticket'}-${ticket?.bookingItemId || ticket?.seatCode || 'item'}`

const isTicketHistoryEvent = (event = {}, now = Date.now()) => {
  if (event.isDeleted) return false
  const status = String(event.status || event.eventStatus || event.state || '').toLowerCase()
  if (['cancelled', 'canceled', 'cancelled event', 'canceled event'].includes(status)) return true
  const startsAt = eventStartTimestamp(event)
  return Number.isFinite(startsAt) && startsAt + 12 * 60 * 60 * 1000 <= now
}

const normalizeTicketEventSnapshot = (eventId, event = {}) => {
  const category =
    typeof event.category === 'object' && event.category !== null
      ? event.category.name
      : event.category || event.categoryName || 'Music & Concerts'
  return {
    id: event.id || eventId,
    title: event.title || `Event #${eventId}`,
    subtitle: event.artistOrOrganizer || event.organizerName || 'Live Event',
    artistOrOrganizer: event.artistOrOrganizer || event.organizerName || 'Featured Artist',
    cover: event.coverImage || event.imageUrl || null,
    category,
    venue: event.venue || event.location || 'Venue unavailable',
    eventDate: event.eventDate || event.date,
    startsAtUtc: event.startsAtUtc,
    utcOffsetMinutes: event.utcOffsetMinutes,
    eventTime: extractTimeFromEvent(event),
    time: extractTimeFromEvent(event),
    status: event.status,
    isHidden: Boolean(event.isHidden || event.hidden || event.isHidder || event.IsHidder),
  }
}

// ── Sparkling particle canvas for footer ──
const createTicketQrMatrix = (value) => {
  const version = 4
  const size = 17 + version * 4
  const matrix = Array.from({ length: size }, () => Array(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array(size).fill(false))
  const setModule = (row, col, dark, isReserved = true) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return
    matrix[row][col] = Boolean(dark)
    if (isReserved) reserved[row][col] = true
  }
  const setReserved = (row, col) => {
    if (row >= 0 && col >= 0 && row < size && col < size) reserved[row][col] = true
  }
  const drawFinder = (row, col) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r
        const cc = col + c
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue
        const dark =
          r >= 0 &&
          r <= 6 &&
          c >= 0 &&
          c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
        setModule(rr, cc, dark)
      }
    }
  }
  const drawAlignment = (centerRow, centerCol) => {
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) {
        setModule(centerRow + r, centerCol + c, Math.max(Math.abs(r), Math.abs(c)) !== 1)
      }
    }
  }
  const reserveFormat = () => {
    for (let i = 0; i <= 8; i += 1) {
      if (i !== 6) {
        setReserved(8, i)
        setReserved(i, 8)
      }
    }
    for (let i = 0; i < 8; i += 1) setReserved(size - 1 - i, 8)
    for (let i = 0; i < 7; i += 1) setReserved(8, size - 1 - i)
  }

  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)
  drawAlignment(26, 26)
  for (let i = 8; i < size - 8; i += 1) {
    setModule(6, i, i % 2 === 0)
    setModule(i, 6, i % 2 === 0)
  }
  setModule(size - 8, 8, true)
  reserveFormat()

  const bytes = new TextEncoder().encode(String(value || ''))
  const bits = []
  const appendBits = (number, count) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((number >>> i) & 1)
  }
  appendBits(0b0100, 4)
  appendBits(Math.min(bytes.length, 78), 8)
  bytes.slice(0, 78).forEach((byte) => appendBits(byte, 8))
  const dataBitCapacity = 80 * 8
  appendBits(0, Math.min(4, dataBitCapacity - bits.length))
  while (bits.length % 8) bits.push(0)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0))
  for (let pad = 0; data.length < 80; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11)

  const gfExp = Array(512).fill(0)
  const gfLog = Array(256).fill(0)
  let gfValue = 1
  for (let i = 0; i < 255; i += 1) {
    gfExp[i] = gfValue
    gfLog[gfValue] = i
    gfValue <<= 1
    if (gfValue & 0x100) gfValue ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) gfExp[i] = gfExp[i - 255]
  const gfMul = (a, b) => (a && b ? gfExp[gfLog[a] + gfLog[b]] : 0)
  const generator = [1]
  for (let degree = 0; degree < 20; degree += 1) {
    generator.push(0)
    for (let i = generator.length - 1; i > 0; i -= 1) {
      generator[i] = generator[i - 1] ^ gfMul(generator[i], gfExp[degree])
    }
    generator[0] = gfMul(generator[0], gfExp[degree])
  }
  const ecc = Array(20).fill(0)
  data.forEach((byte) => {
    const factor = byte ^ ecc.shift()
    ecc.push(0)
    generator.forEach((coefficient, index) => {
      ecc[index] ^= gfMul(coefficient, factor)
    })
  })
  const codewordBits = data
    .concat(ecc)
    .flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1))

  let bitIndex = 0
  let upward = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (let offset = 0; offset < 2; offset += 1) {
        const c = col - offset
        if (reserved[row][c]) continue
        const rawBit = bitIndex < codewordBits.length ? codewordBits[bitIndex] : 0
        const mask = (row + c) % 2 === 0
        matrix[row][c] = Boolean(rawBit ^ (mask ? 1 : 0))
        bitIndex += 1
      }
    }
    upward = !upward
  }

  const formatData = 0b01000
  let format = formatData << 10
  for (let i = 14; i >= 10; i -= 1) {
    if ((format >>> i) & 1) format ^= 0x537 << (i - 10)
  }
  format = ((formatData << 10) | format) ^ 0x5412
  const formatBit = (index) => (format >>> index) & 1
  for (let i = 0; i <= 5; i += 1) setModule(8, i, formatBit(i))
  setModule(8, 7, formatBit(6))
  setModule(8, 8, formatBit(7))
  setModule(7, 8, formatBit(8))
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, formatBit(i))
  for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, formatBit(i))
  for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, formatBit(i))

  return matrix
}

const drawTicketQrCode = async (ctx, value, x, y, size) => {
  const dataUrl = await QRCode.toDataURL(String(value || ''), {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: size,
    color: {
      dark: '#111111',
      light: '#ffffff',
    },
  })
  await new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      ctx.drawImage(image, x, y, size, size)
      resolve()
    }
    image.onerror = resolve
    image.src = dataUrl
  })
}

const eventAccentColor = (event = {}) => {
  const seed = `${event.id || ''}${event.title || ''}`
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 360
  return `hsl(${hash}, 82%, 46%)`
}

const TicketBarcode = ({ value, className = '' }) => {
  const barcodeRef = useRef(null)

  useEffect(() => {
    if (!barcodeRef.current || !value) return
    JsBarcode(barcodeRef.current, value, {
      format: 'CODE128',
      displayValue: false,
      height: 42,
      margin: 0,
      width: 1.4,
      lineColor: '#111111',
      background: 'transparent',
    })
  }, [value])

  return <svg ref={barcodeRef} className={className} aria-label={`Barcode for ticket ${value}`} />
}

const TicketManagerPage = ({
  bookings,
  events,
  error,
  loading,
  onBack,
  onRefresh,
  onDownload,
  formatDate,
  user,
}) => {
  const userDetails = getUserDetails(user)
  const hiddenStorageKey = `exvo-hidden-tickets:${userDetails.id || userDetails.email || userDetails.name || 'guest'}`
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketTypeFilter, setTicketTypeFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [ticketTab, setTicketTab] = useState('active')
  const [ticketEventSnapshots, setTicketEventSnapshots] = useState({})
  const [hiddenTicketCodes, setHiddenTicketCodes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(hiddenStorageKey) || '[]')
    } catch {
      return []
    }
  })
  const eventById = new Map(events.map((event) => [Number(event.id), event]))
  Object.entries(ticketEventSnapshots).forEach(([eventId, event]) => {
    if (!eventById.has(Number(eventId))) eventById.set(Number(eventId), event)
  })
  const flattenedTickets = bookings.flatMap((booking) =>
    (booking.tickets || []).map((ticket) => ({
      ...ticket,
      booking,
      event: eventById.get(Number(booking.eventId)) || { id: booking.eventId, isLookupPending: true },
    })),
  )
  const hiddenSet = new Set(hiddenTicketCodes)
  const historyTickets = flattenedTickets.filter((ticket) => isTicketHistoryEvent(ticket.event))
  const activeTickets = flattenedTickets.filter(
    (ticket) => !ticket.event.isDeleted && !isTicketHistoryEvent(ticket.event) && !hiddenSet.has(ticketIdentity(ticket)),
  )
  const hiddenTickets = flattenedTickets.filter(
    (ticket) =>
      ticket.event.isDeleted || (!isTicketHistoryEvent(ticket.event) && hiddenSet.has(ticketIdentity(ticket))),
  )
  const eventOptions = [
    ...new Map(
      flattenedTickets.map((ticket) => {
        const eventId = Number(ticket.booking.eventId)
        return [eventId, { id: eventId, title: ticket.event.title || `Event #${ticket.booking.eventId}` }]
      }),
    ).values(),
  ].sort((a, b) => a.title.localeCompare(b.title))
  const tabTickets = ticketTab === 'history' ? historyTickets : ticketTab === 'hidden' ? hiddenTickets : activeTickets
  const visibleTickets = tabTickets.filter((ticket) => {
    const event = ticket.event
    const booking = ticket.booking
    const query = ticketSearch.trim().toLowerCase()
    const hasSeat = ticketHasAssignedSeat(ticket)
    const searchableValues = [
      event.title,
      event.venue,
      event.artistOrOrganizer,
      event.category,
      formatDate(event.eventDate, event.eventTime),
      booking.bookingReference,
      ticket.ticketCode,
      ticket.seatCode,
      ticket.sectionName,
      ticket.rowLabel,
      ticket.seatNumber,
    ]
    const matchesSearch =
      !query || searchableValues.filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    const matchesType =
      ticketTypeFilter === 'all' ||
      (ticketTypeFilter === 'seated' && hasSeat) ||
      (ticketTypeFilter === 'general' && !hasSeat)
    const matchesEvent = eventFilter === 'all' || String(booking.eventId) === eventFilter
    return matchesSearch && matchesType && matchesEvent
  })

  useEffect(() => {
    try {
      setHiddenTicketCodes(JSON.parse(localStorage.getItem(hiddenStorageKey) || '[]'))
    } catch {
      setHiddenTicketCodes([])
    }
  }, [hiddenStorageKey])

  useEffect(() => {
    const missingEventIds = [
      ...new Set(
        bookings
          .map((booking) => Number(booking.eventId))
          .filter((eventId) => eventId && !events.some((event) => Number(event.id) === eventId) && !ticketEventSnapshots[eventId]),
      ),
    ]
    if (missingEventIds.length === 0) return undefined
    let active = true
    missingEventIds.forEach((eventId) => {
      getEventTicketSnapshot(eventId)
        .then((event) => {
          if (!active) return
          setTicketEventSnapshots((current) => ({
            ...current,
            [eventId]: normalizeTicketEventSnapshot(eventId, event),
          }))
        })
        .catch(() => {
          if (!active) return
          setTicketEventSnapshots((current) => ({
            ...current,
            [eventId]: {
              id: eventId,
              title: 'Event deleted',
              venue: 'This event is no longer available',
              isDeleted: true,
              isHidden: true,
            },
          }))
        })
    })
    return () => {
      active = false
    }
  }, [bookings, events, ticketEventSnapshots])

  useEffect(() => {
    localStorage.setItem(hiddenStorageKey, JSON.stringify(hiddenTicketCodes))
  }, [hiddenStorageKey, hiddenTicketCodes])

  const toggleTicketHidden = (ticket) => {
    const code = ticketIdentity(ticket)
    setHiddenTicketCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    )
  }

  return (
    <main className="ticket-manager-page">
      <div className="ticket-manager-bg" />
      <header className="ticket-manager-header">
        <button type="button" className="ticket-manager-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>BACK</span>
        </button>
        <div className="ticket-manager-brand">
          <ExvoLogo />
          <span>
            <strong>EX</strong>VO
          </span>
        </div>
        <button type="button" className="ticket-manager-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? 'SYNCING' : 'REFRESH'}
        </button>
      </header>

      <section className="ticket-manager-shell">
        <div className="ticket-manager-title-row">
          <div>
            <p className="ticket-manager-kicker"> EXVO Box Office</p>
            <h1>My Tickets</h1>
          </div>
          <span className="ticket-manager-count">{flattenedTickets.length} PURCHASED</span>
        </div>

        {flattenedTickets.length > 0 && (
          <div className="ticket-manager-tools">
            <div className="ticket-manager-search">
              <label htmlFor="ticket-search">Search tickets</label>
              <input
                id="ticket-search"
                type="search"
                value={ticketSearch}
                onChange={(event) => setTicketSearch(event.target.value)}
                placeholder="Search event, venue, code, row..."
              />
            </div>
            <div className="ticket-manager-filters">
              <label>
                <span>Event</span>
                <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
                  <option value="all">All events</option>
                  {eventOptions.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Type</span>
                <select value={ticketTypeFilter} onChange={(event) => setTicketTypeFilter(event.target.value)}>
                  <option value="all">All tickets</option>
                  <option value="seated">Seated</option>
                  <option value="general">General entry</option>
                </select>
              </label>
            </div>
            <div className="ticket-manager-tabs" role="tablist" aria-label="Ticket visibility">
              <button
                type="button"
                className={ticketTab === 'active' ? 'is-active' : ''}
                onClick={() => setTicketTab('active')}
              >
                Active <span>{activeTickets.length}</span>
              </button>
              <button
                type="button"
                className={ticketTab === 'hidden' ? 'is-active' : ''}
                onClick={() => setTicketTab('hidden')}
              >
                Hidden <span>{hiddenTickets.length}</span>
              </button>
              <button
                type="button"
                className={ticketTab === 'history' ? 'is-active' : ''}
                onClick={() => setTicketTab('history')}
              >
                History <span>{historyTickets.length}</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="ticket-manager-alert" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="ticket-manager-empty">
            <strong>Loading your tickets...</strong>
          </div>
        )}

        {!loading && flattenedTickets.length === 0 && (
          <div className="ticket-manager-empty">
            <strong>No reserved tickets yet.</strong>
            <span>Your confirmed bookings will appear here.</span>
          </div>
        )}

        {!loading && flattenedTickets.length > 0 && visibleTickets.length === 0 && (
          <div className="ticket-manager-empty">
            <strong>No tickets match these filters.</strong>
            <span>Try another search term, event, type, or tab.</span>
          </div>
        )}

        {!loading && visibleTickets.length > 0 && (
          <div className="ticket-manager-grid">
            {visibleTickets.map((ticket) => {
              const event = ticket.event
              const booking = ticket.booking
              const accent = eventAccentColor(event)
              const hasSeat = ticketHasAssignedSeat(ticket)
              const isHidden = hiddenSet.has(ticketIdentity(ticket))
              const isHistory = isTicketHistoryEvent(event)
              const isArchived = isHistory || event.isDeleted
              return (
                <article
                  key={ticketIdentity(ticket)}
                  className="managed-ticket-card"
                  style={{
                    '--ticket-accent': accent,
                    '--ticket-poster': event.cover ? `url(${event.cover})` : 'none',
                  }}
                >
                  <div className="managed-ticket-main">
                    <div className="managed-ticket-poster">
                      <EventPoster src={event.cover} title={event.title || `Event ${booking.eventId}`} />
                    </div>
                    <div className="managed-ticket-copy">
                      <p className="managed-ticket-label">
                        {event.isDeleted ? 'EVENT DELETED' : isHistory ? 'EXVO PASS HISTORY' : 'EXVO RESERVED PASS'}
                      </p>
                      <h2>{event.title || `Event #${booking.eventId}`}</h2>
                      <div className="managed-ticket-meta">
                        <span>{formatDate(event.eventDate, event.eventTime) || 'Date unavailable'}</span>
                        <span>{event.venue || 'Venue unavailable'}</span>
                      </div>
                      {hasSeat ? (
                        <div className="managed-ticket-fields">
                          <span>
                            <small>SECTION</small>
                            {ticket.sectionName || 'GENERAL'}
                          </span>
                          <span>
                            <small>ROW</small>
                            {ticket.rowLabel || '-'}
                          </span>
                          <span>
                            <small>SEAT</small>
                            {ticket.seatNumber || ticket.seatCode}
                          </span>
                        </div>
                      ) : (
                        <div className="managed-ticket-fields managed-ticket-fields--general">
                          <span>
                            <small>PASS TYPE</small>
                            {ticket.sectionName || ticket.seatCode || 'General Admission'}
                          </span>
                          <span>
                            <small>ACCESS</small>
                            General Entry
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="managed-ticket-stub">
                    <TicketBarcode value={ticket.ticketCode} className="managed-ticket-barcode" />
                    <span>{ticket.ticketCode}</span>
                    {!event.isDeleted && (
                      <button type="button" onClick={() => onDownload(ticket, booking, event)}>
                        DOWNLOAD IMAGE
                      </button>
                    )}
                    {!isArchived && (
                      <button type="button" className="managed-ticket-hide" onClick={() => toggleTicketHidden(ticket)}>
                        {isHidden ? 'RESTORE TICKET' : 'HIDE TICKET'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

const SparkCanvas = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    let W, H

    const SPARK_COUNT = 90
    const rand = (a, b) => Math.random() * (b - a) + a

    const makeSpark = (fromBottom = false) => ({
      x: rand(0, W),
      y: fromBottom ? H + rand(0, 20) : rand(0, H),
      r: rand(0.4, 2.2),
      vx: rand(-0.15, 0.15),
      vy: rand(-0.4, -0.08),
      life: 0,
      maxLife: rand(120, 280),
      twinkleSpeed: rand(0.03, 0.07),
      twinklePhase: rand(0, Math.PI * 2),
    })

    let sparks = []

    const resize = () => {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      sparks = Array.from({ length: SPARK_COUNT }, () => {
        const s = makeSpark(false)
        s.life = rand(0, s.maxLife)
        return s
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      for (const s of sparks) {
        s.life++
        s.x += s.vx
        s.y += s.vy

        if (s.life > s.maxLife) {
          Object.assign(s, makeSpark(true))
          continue
        }

        const progress = s.life / s.maxLife
        let alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1

        const twinkle = 0.5 + 0.5 * Math.sin(s.life * s.twinkleSpeed + s.twinklePhase)
        alpha *= twinkle

        // glow halo
        ctx.save()
        ctx.globalAlpha = alpha * 0.3
        const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        grd.addColorStop(0, 'rgba(255,255,255,1)')
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
        ctx.restore()

        // core dot
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.restore()
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    draw()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

const AuthPage = ({ onBack, onSuccess, initialMode = 'login' }) => {
  const [authMode, setAuthMode] = useState(initialMode) // 'login' | 'register'
  const [accountType, setAccountType] = useState('booking') // 'booking' | 'company'
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Login form fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form fields
  const [fullName, setFullName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyRegNumber, setCompanyRegNumber] = useState('')
  const [contactNumber, setContactNumber] = useState('')

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage('Authenticating...')
    setIsSuccess(false)

    try {
      await loginUser(loginEmail, loginPassword)
      setIsSuccess(true)
      setMessage('Login successful! Welcome back.')
      setTimeout(onSuccess, 800)
    } catch (error) {
      setIsSuccess(false)
      setMessage(error.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setMessage(accountType === 'company' ? 'Registering your company...' : 'Creating your account...')
    setIsSuccess(false)

    try {
      if (accountType === 'company') {
        await registerUser({
          fullName: companyName,
          companyName,
          companyRegNumber,
          contactNumber,
          email: registerEmail,
          password: registerPassword,
          role: 'Organizer',
        })
      } else {
        await registerUser({
          fullName,
          email: registerEmail,
          password: registerPassword,
          role: 'Attendee',
        })
      }

      setIsSuccess(true)
      setMessage('Account created successfully! Welcome to Exvo.')
      setTimeout(onSuccess, 900)
    } catch (error) {
      setIsSuccess(false)
      setMessage(error.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="background-glow background-glow--red" />
      <div className="background-glow background-glow--blue" />
      <div className="grain" />
      <section className="auth-card" aria-labelledby="auth-title">
        {/* Top bar with back button & Exvo Brand */}
        <div className="auth-card-header">
          <button className="login-back" type="button" onClick={onBack}>
            ← Back to home
          </button>
          <div className="auth-brand-badge">
            <ExvoLogo />
            <span>
              <span className="text-[#FF0000]">EX</span>VO
            </span>
          </div>
        </div>

        {/* Primary Auth Mode Tabs: Sign In vs Create Account */}
        <div className="auth-mode-tabs" role="tablist">
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('login')
              setMessage('')
            }}
            role="tab"
            aria-selected={authMode === 'login'}
          >
            SIGN IN
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('register')
              setMessage('')
            }}
            role="tab"
            aria-selected={authMode === 'register'}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {/* Sub-Selector for Account Type when in Register Mode */}
        {authMode === 'register' && (
          <div className="account-type-toggle" role="radiogroup" aria-label="Account category selection">
            <button
              type="button"
              className={`account-type-btn ${accountType === 'booking' ? 'active' : ''}`}
              onClick={() => {
                setAccountType('booking')
                setMessage('')
              }}
              aria-checked={accountType === 'booking'}
              role="radio"
            >
              Booking Ticket
            </button>
            <button
              type="button"
              className={`account-type-btn ${accountType === 'company' ? 'active' : ''}`}
              onClick={() => {
                setAccountType('company')
                setMessage('')
              }}
              aria-checked={accountType === 'company'}
              role="radio"
            >
              Register Company
            </button>
          </div>
        )}

        {/* Login Form */}
        {authMode === 'login' && (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-field-group">
              <label className="login-field-label" htmlFor="login-email">
                EMAIL / USERNAME
              </label>
              <div className="login-input-shell">
                <span className="login-field-icon" aria-hidden="true">
                  @
                </span>
                <input
                  id="login-email"
                  type="email"
                  placeholder="name@domain.com"
                  autoComplete="email"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="auth-field-group">
              <div className="login-password-row">
                <label className="login-field-label" htmlFor="login-password">
                  PASSWORD
                </label>
              </div>
              <div className="login-input-shell">
                <span className="login-field-icon" aria-hidden="true">
                  ▣
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  minLength="6"
                  required
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
                <button
                  className="login-eye"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? '◉' : '◌'}
                </button>
              </div>
            </div>

            <button className="login-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'AUTHENTICATING...' : 'LOGIN TO EXVO'} <span aria-hidden="true">→</span>
            </button>

            <p className="auth-bottom-switch">
              New to Exvo?
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setMessage('')
                }}
              >
                Create an account
              </button>
            </p>
          </form>
        )}

        {/* Register Form */}
        {authMode === 'register' && (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            {accountType === 'booking' ? (
              <>
                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-full-name">
                    FULL NAME
                  </label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">
                      ID
                    </span>
                    <input
                      id="register-full-name"
                      type="text"
                      placeholder="Enter your full name"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-email">
                    EMAIL ADDRESS
                  </label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">
                      @
                    </span>
                    <input
                      id="register-email"
                      type="email"
                      placeholder="Enter your email"
                      autoComplete="email"
                      required
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="register-password">
                    PASSWORD
                  </label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">
                      ▣
                    </span>
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
                      minLength="6"
                      required
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                    />
                    <button
                      className="login-eye"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? '◉' : '◌'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="auth-grid-2">
                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-name">
                      COMPANY NAME
                    </label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">
                        CO
                      </span>
                      <input
                        id="company-name"
                        type="text"
                        placeholder="Company Name"
                        required
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-reg-no">
                      REGISTRATION NO
                    </label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">
                        #
                      </span>
                      <input
                        id="company-reg-no"
                        type="text"
                        placeholder="e.g. PV001234"
                        required
                        value={companyRegNumber}
                        onChange={(event) => setCompanyRegNumber(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-grid-2">
                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-email">
                      OFFICIAL EMAIL
                    </label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">
                        @
                      </span>
                      <input
                        id="company-email"
                        type="email"
                        placeholder="company@domain.com"
                        autoComplete="email"
                        required
                        value={registerEmail}
                        onChange={(event) => setRegisterEmail(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="login-field-label" htmlFor="company-contact">
                      CONTACT NO
                    </label>
                    <div className="login-input-shell">
                      <span className="login-field-icon" aria-hidden="true">
                        TEL
                      </span>
                      <input
                        id="company-contact"
                        type="tel"
                        placeholder="+94 7X XXX XXXX"
                        autoComplete="tel"
                        required
                        value={contactNumber}
                        onChange={(event) => setContactNumber(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="login-field-label" htmlFor="company-password">
                    PASSWORD
                  </label>
                  <div className="login-input-shell">
                    <span className="login-field-icon" aria-hidden="true">
                      ▣
                    </span>
                    <input
                      id="company-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Strong password (min. 6 characters)"
                      autoComplete="new-password"
                      minLength="6"
                      required
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                    />
                    <button
                      className="login-eye"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? '◉' : '◌'}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button className="login-submit" type="submit" disabled={isLoading}>
              {isLoading ? 'CREATING...' : accountType === 'company' ? 'REGISTER COMPANY' : 'CREATE ACCOUNT'}{' '}
              <span aria-hidden="true">→</span>
            </button>

            <p className="auth-bottom-switch">
              Already have an account?
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setMessage('')
                }}
              >
                Sign in
              </button>
            </p>
          </form>
        )}

        {message && (
          <p
            className="login-message"
            style={
              isSuccess
                ? { background: 'rgba(34, 197, 94, 0.12)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }
                : {}
            }
            role="status"
          >
            {message}
          </p>
        )}
      </section>
    </main>
  )
}

function App() {
  const [albumList, setAlbumList] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState(false)
  const [myEventsError, setMyEventsError] = useState(false)
  const profileMenuRef = useRef(null)
  const profilePanelRef = useRef(null)
  const liveRequestRef = useRef(0)
  const myRequestRef = useRef(0)
  const [scheduleNow, setScheduleNow] = useState(() => new Date())
  const [centerIndex, setCenterIndex] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState('login')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [authState, setAuthState] = useState(readAuthState)
  const userDetails = getUserDetails(authState.user)
  const isOrganizer = authState.isAuthenticated && (userDetails.role === 'Organizer' || userDetails.role === 'Company')
  const [activeCategory, setActiveCategory] = useState(null)
  const [showAllEventsInGrid, setShowAllEventsInGrid] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false)
  const categorySearchInputRef = useRef(null)
  const categorySearchContainerRef = useRef(null)
  const [bookingModalEvent, setBookingModalEvent] = useState(null)
  const [selectedDetailEvent, setSelectedDetailEvent] = useState(null)
  const [attendeeSeatingPlan, setAttendeeSeatingPlan] = useState(null)
  const [, setAttendeeSeatingLoading] = useState(false)
  const [, setAttendeeSeatingError] = useState(false)
  const [eventAvailability, setEventAvailability] = useState(null)
  const [eventInventoryById, setEventInventoryById] = useState({})
  const [selectedSeats, setSelectedSeats] = useState([])
  const [, setTicketQuantity] = useState(1)
  const [tierQuantities, setTierQuantities] = useState({})
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [seatHold, setSeatHold] = useState(null)
  const [holdSecondsRemaining, setHoldSecondsRemaining] = useState(0)
  const [holdError, setHoldError] = useState('')
  const [bookingConfirmation, setBookingConfirmation] = useState(null)
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState(null)
  const [confirmingBooking, setConfirmingBooking] = useState(false)
  const [selectionPrepared, setSelectionPrepared] = useState(false)
  const holdConfirmationRef = useRef(null)
  const [bookingStep, setBookingStep] = useState(1)
  const [ticketManagerOpen, setTicketManagerOpen] = useState(false)
  const [attendeeBookings, setAttendeeBookings] = useState([])
  const [attendeeTicketsLoading, setAttendeeTicketsLoading] = useState(false)
  const [attendeeTicketsError, setAttendeeTicketsError] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: 'General Query', message: '' })
  const [contactSubmitted, setContactSubmitted] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    profilePicture: '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState({ type: '', text: '' })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  // Add Event State
  const [dbCategories, setDbCategories] = useState([
    { id: 1, name: 'Music & Concerts' },
    { id: 2, name: 'Concert' },
    { id: 3, name: 'Festival' },
    { id: 4, name: 'Live Session' },
    { id: 5, name: 'DJ Night' },
    { id: 6, name: 'Acoustic' },
    { id: 7, name: 'Stand-Up' },
    { id: 8, name: 'EDM Arena' },
  ])
  const [newEventForm, setNewEventForm] = useState({
    title: '',
    artistOrOrganizer: '',
    categoryId: 1,
    category: 'Music & Concerts',
    date: '',
    time: '19:00',
    venue: '',
    ticketTiers: [
      { id: '1', name: 'General Admission', price: '2500', quantity: '500' },
      { id: '2', name: 'VIP Pass', price: '5000', quantity: '150' },
    ],
    seatingConfig: createDefaultSeatingConfig(),
    coverImage: '',
    description: '',
  })
  const [eventPublishing, setEventPublishing] = useState(false)
  const [eventFeedback, setEventFeedback] = useState({ type: '', text: '' })

  // Organizer Dashboard & Edit Event State
  const [organizerDashboardOpen, setOrganizerDashboardOpen] = useState(false)
  const [myEventsList, setMyEventsList] = useState([])
  const eventNow = useEventExpiry(albumList, myEventsList)
  const [loadingMyEvents, setLoadingMyEvents] = useState(true)
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [showEditEventModal, setShowEditEventModal] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [editEventForm, setEditEventForm] = useState({
    title: '',
    artistOrOrganizer: '',
    category: 'Concert',
    date: '',
    time: '19:00',
    venue: '',
    ticketTiers: [],
    seatingConfig: createDefaultSeatingConfig(),
    coverImage: '',
    description: '',
  })
  const [editEventPublishing, setEditEventPublishing] = useState(false)
  const [editEventFeedback, setEditEventFeedback] = useState({ type: '', text: '' })

  useEffect(() => {
    if (selectedDetailEvent && isEventExpired(selectedDetailEvent, eventNow)) setSelectedDetailEvent(null)
    if (bookingModalEvent && isEventExpired(bookingModalEvent, eventNow)) setBookingModalEvent(null)
  }, [eventNow, selectedDetailEvent, bookingModalEvent])

  useEffect(() => {
    const eventId = bookingModalEvent?.id
    if (!eventId) {
      setAttendeeSeatingPlan(null)
      setEventAvailability(null)
      return undefined
    }
    let active = true
    setAttendeeSeatingLoading(true)
    setAttendeeSeatingError(false)
    getAttendeeSeatingPlan(eventId)
      .then((plan) => {
        if (active) setAttendeeSeatingPlan(plan)
      })
      .catch(() => {
        if (active) {
          setAttendeeSeatingPlan(null)
          setAttendeeSeatingError(true)
        }
      })
      .finally(() => {
        if (active) setAttendeeSeatingLoading(false)
      })
    return () => {
      active = false
    }
  }, [bookingModalEvent?.id])

  useEffect(() => {
    if (!seatHold?.expiresAtUtc) return undefined
    const updateRemaining = () => setHoldSecondsRemaining(Math.max(0, Math.ceil((new Date(seatHold.expiresAtUtc).getTime() - Date.now()) / 1000)))
    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [seatHold])

  useEffect(() => {
    if (selectionPrepared && seatHold) {
      holdConfirmationRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
    }
  }, [selectionPrepared, seatHold])

  useEffect(() => {
    if (!seatHold?.expiresAtUtc) return
    const expiresAt = new Date(seatHold.expiresAtUtc).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return
    setSelectedSeats([])
    setSeatHold(null)
    setSelectionPrepared(false)
    setHoldError('Your five-minute seat hold expired. Please select the seats again.')
  }, [holdSecondsRemaining, seatHold])

  useEffect(() => {
    if (!bookingModalEvent || eventAvailability?.eventId !== bookingModalEvent.id) return
    setTierQuantities((previous) => {
      if (bookingModalEvent.ticketTiers?.length) {
        return Object.fromEntries(
          bookingModalEvent.ticketTiers.map((tier, index) => {
            const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
            const match = eventAvailability.tiers?.find(
              (item) => String(item.ticketTierId) === String(tier.id) || Number(item.price) === Number(tier.price),
            )
            return [key, Math.min(Number(previous[key]) || 0, match?.availableQuantity || 0)]
          }),
        )
      }
      return { standard: Math.min(Number(previous.standard) || 0, eventAvailability.availableSeatCount || 0) }
    })
  }, [bookingModalEvent, eventAvailability])

  useEffect(() => {
    const eventId = bookingModalEvent?.id
    if (!eventId) return undefined
    let active = true
    getEventAvailability(eventId)
      .then((availability) => {
        if (active) setEventAvailability(availability)
      })
      .catch(() => {
        if (active) setEventAvailability(null)
      })
    return () => {
      active = false
    }
  }, [bookingModalEvent?.id])

  useEffect(() => {
    const closeProfile = () => {
      setProfileMenuOpen(false)
      setProfilePanelOpen(false)
      setIsEditingProfile(false)
    }
    const outside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
      if (profilePanelRef.current && !profilePanelRef.current.contains(event.target)) {
        setProfilePanelOpen(false)
        setIsEditingProfile(false)
      }
      if (event.target.closest?.('a[href]')) closeProfile()
    }
    const escape = (event) => {
      if (event.key === 'Escape') closeProfile()
    }
    document.addEventListener('click', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('popstate', closeProfile)
    window.addEventListener('hashchange', closeProfile)
    return () => {
      document.removeEventListener('click', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('popstate', closeProfile)
      window.removeEventListener('hashchange', closeProfile)
    }
  }, [])

  useEffect(() => {
    setProfileMenuOpen(false)
    setProfilePanelOpen(false)
    setIsEditingProfile(false)
  }, [showAuth, organizerDashboardOpen, selectedDetailEvent, showAddEventModal, activeCategory])

  useEffect(() => {
    if (!showAddEventModal && !showEditEventModal) return
    setScheduleNow(new Date())
    const timer = setInterval(() => setScheduleNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [showAddEventModal, showEditEventModal])

  const handleAddTicketTier = () => {
    setNewEventForm((prev) => {
      const nextTiers = [...prev.ticketTiers, { id: String(Date.now()), name: '', price: '', quantity: '100' }]
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones = autoSync
        ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
        : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleRemoveTicketTier = (tierId) => {
    if (newEventForm.ticketTiers.length <= 1) return
    setNewEventForm((prev) => {
      const nextTiers = prev.ticketTiers.filter((t) => t.id !== tierId)
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones = autoSync
        ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
        : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleUpdateTicketTier = (tierId, field, value) => {
    setNewEventForm((prev) => {
      const nextTiers = prev.ticketTiers.map((t) => (t.id === tierId ? { ...t, [field]: value } : t))
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones =
        autoSync && (field === 'name' || field === 'price')
          ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
          : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleSetQuickDate = (daysFromNow) => {
    const d = new Date()
    d.setDate(d.getDate() + daysFromNow)
    const formatted = localDate(d)
    setNewEventForm((prev) => ({ ...prev, date: formatted }))
  }

  const formatSelectedDate = (dateStr, timeStr) => {
    if (!dateStr) return ''
    try {
      let cleanStr = String(dateStr).trim()
      let resolvedTime = timeStr && timeStr !== 'undefined' && timeStr !== 'null' ? String(timeStr).trim() : ''

      if (cleanStr.includes('T')) {
        const parts = cleanStr.split('T')
        cleanStr = parts[0]
        if (!resolvedTime && parts[1]) {
          const match = parts[1].match(/^(\d{1,2}):(\d{2})/)
          if (match) {
            resolvedTime = `${match[1].padStart(2, '0')}:${match[2]}`
          }
        }
      } else if (cleanStr.includes(' ')) {
        const parts = cleanStr.split(' ')
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(parts[0])) {
          cleanStr = parts[0]
          if (!resolvedTime && parts[1]) {
            const match = parts[1].match(/^(\d{1,2}):(\d{2})/)
            if (match) {
              resolvedTime = `${match[1].padStart(2, '0')}:${match[2]}`
            }
          }
        }
      }

      let d
      const ymdMatch = cleanStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)

      if (ymdMatch) {
        const year = Number(ymdMatch[1])
        const month = Number(ymdMatch[2])
        const day = Number(ymdMatch[3])
        d = new Date(year, month - 1, day)
      } else {
        d = new Date(cleanStr)
      }

      if (isNaN(d.getTime())) {
        return cleanStr !== 'undefined' && cleanStr !== 'null' ? cleanStr : ''
      }

      const formatted = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      if (!formatted || formatted === 'Invalid Date') {
        return cleanStr
      }

      return `${formatted}${resolvedTime ? ` @ ${resolvedTime}` : ''}`
    } catch {
      return String(dateStr)
    }
  }

  const loadAttendeeTickets = async () => {
    if (!authState.isAuthenticated) return
    setAttendeeTicketsLoading(true)
    setAttendeeTicketsError('')
    try {
      const bookings = await getMyTickets()
      setAttendeeBookings(Array.isArray(bookings) ? bookings : [])
    } catch (error) {
      setAttendeeTicketsError(error.message || 'Unable to load your tickets.')
    } finally {
      setAttendeeTicketsLoading(false)
    }
  }

  const openTicketManager = async () => {
    if (!authState.isAuthenticated) {
      setAuthInitialMode('login')
      setShowAuth(true)
      return
    }
    setTicketManagerOpen(true)
    setProfileMenuOpen(false)
    setProfilePanelOpen(false)
    await loadAttendeeTickets()
  }

  const downloadTicketImage = async (ticket, booking, event = {}, forEmail = false) => {
    const width = 900
    const height = 1400
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    const accent = eventAccentColor(event)
    const accentSoft = accent.replace('hsl', 'hsla').replace(')', ', 0.72)')
    const eventTitle = event.title || `Event #${booking.eventId}`
    const eventDate = formatSelectedDate(event.eventDate, event.eventTime) || 'Date unavailable'
    const venue = event.venue || 'Venue unavailable'
    const fontFamily = "'Orbitron', 'Arial Black', sans-serif"
    const hasSeat = ticketHasAssignedSeat(ticket)

    await document.fonts?.load?.(`900 40px ${fontFamily}`).catch(() => {})

    const drawText = (text, x, y, maxWidth, size, weight = 700, color = '#ffffff', align = 'left', maxLines = 2) => {
      ctx.fillStyle = color
      ctx.font = `${weight} ${size}px ${fontFamily}`
      ctx.textAlign = align
      ctx.textBaseline = 'top'
      const words = String(text || '').split(' ')
      let line = ''
      let lineY = y
      let lines = 0
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, lineY)
          lines += 1
          if (lines >= maxLines) return
          line = word
          lineY += size * 1.12
        } else {
          line = test
        }
      }
      if (line) ctx.fillText(line, x, lineY)
    }

    const drawFitText = (text, x, y, maxWidth, size, weight = 800, color = '#ffffff', align = 'left', minSize = 16) => {
      const value = String(text || '')
      let fittedSize = size
      ctx.font = `${weight} ${fittedSize}px ${fontFamily}`
      while (ctx.measureText(value).width > maxWidth && fittedSize > minSize) {
        fittedSize -= 2
        ctx.font = `${weight} ${fittedSize}px ${fontFamily}`
      }
      let output = value
      if (ctx.measureText(output).width > maxWidth) {
        while (output.length > 4 && ctx.measureText(`${output.slice(0, -1)}...`).width > maxWidth) {
          output = output.slice(0, -1)
        }
        output = `${output}...`
      }
      ctx.fillStyle = color
      ctx.textAlign = align
      ctx.textBaseline = 'top'
      ctx.fillText(output, x, y)
    }

    const roundedRect = (x, y, w, h, r) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    const loadImage = (src) =>
      new Promise((resolve) => {
        if (!src) {
          resolve(null)
          return
        }
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = () => resolve(image)
        image.onerror = () => resolve(null)
        image.src = src
      })

    const poster = await loadImage(event.cover)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)

    const ticketX = 190
    const ticketY = 70
    const ticketW = 520
    const topH = 920
    const stubY = ticketY + topH
    const stubH = 300
    const r = 24

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.22)'
    ctx.shadowBlur = 34
    ctx.shadowOffsetY = 20
    roundedRect(ticketX, ticketY, ticketW, topH + stubH, r)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()

    ctx.save()
    roundedRect(ticketX, ticketY, ticketW, topH, r)
    ctx.clip()
    const topGradient = ctx.createLinearGradient(ticketX, ticketY, ticketX + ticketW, ticketY + topH)
    topGradient.addColorStop(0, accentSoft)
    topGradient.addColorStop(0.48, '#6d20ff')
    topGradient.addColorStop(1, '#10134f')
    ctx.fillStyle = topGradient
    ctx.fillRect(ticketX, ticketY, ticketW, topH)
    if (poster) {
      ctx.globalAlpha = 0.22
      ctx.filter = 'saturate(1.12)'
      ctx.drawImage(poster, ticketX, ticketY, ticketW, topH)
      ctx.globalAlpha = 1
      ctx.filter = 'none'
    }
    ctx.fillStyle = 'rgba(18, 8, 82, 0.48)'
    ctx.fillRect(ticketX, ticketY, ticketW, topH)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.beginPath()
    ctx.moveTo(ticketX, ticketY + 260)
    ctx.bezierCurveTo(ticketX + 160, ticketY + 180, ticketX + 300, ticketY + 250, ticketX + ticketW, ticketY + 120)
    ctx.lineTo(ticketX + ticketW, ticketY + 250)
    ctx.bezierCurveTo(ticketX + 360, ticketY + 385, ticketX + 160, ticketY + 330, ticketX, ticketY + 430)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.beginPath()
    ctx.moveTo(ticketX, ticketY + 660)
    ctx.bezierCurveTo(ticketX + 160, ticketY + 560, ticketX + 330, ticketY + 720, ticketX + ticketW, ticketY + 580)
    ctx.lineTo(ticketX + ticketW, ticketY + 760)
    ctx.bezierCurveTo(ticketX + 350, ticketY + 860, ticketX + 140, ticketY + 750, ticketX, ticketY + 850)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(ticketX + ticketW / 2, ticketY, 44, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ticketX, stubY, 44, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ticketX + ticketW, stubY, 44, 0, Math.PI * 2)
    ctx.fill()

    await drawTicketQrCode(ctx, ticket.ticketCode, ticketX + 162, ticketY + 116, 196)
    drawFitText('SCAN HERE', ticketX + ticketW / 2, ticketY + 345, 180, 18, 700, 'rgba(255,255,255,0.82)', 'center', 14)

    ctx.strokeStyle = 'rgba(255,255,255,0.72)'
    ctx.setLineDash([3, 13])
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(ticketX + 52, ticketY + 408)
    ctx.lineTo(ticketX + ticketW - 52, ticketY + 408)
    ctx.stroke()
    ctx.setLineDash([])

    drawFitText(eventTitle.toUpperCase(), ticketX + 50, ticketY + 446, ticketW - 100, 43, 900, '#ffffff', 'left', 25)
    drawFitText((event.artistOrOrganizer || event.category || 'LIVE EVENT').toUpperCase(), ticketX + 50, ticketY + 504, ticketW - 100, 25, 500, 'rgba(255,255,255,0.88)', 'left', 16)

    ctx.strokeStyle = 'rgba(255,255,255,0.62)'
    ctx.setLineDash([3, 13])
    ctx.beginPath()
    ctx.moveTo(ticketX + 52, ticketY + 570)
    ctx.lineTo(ticketX + ticketW - 52, ticketY + 570)
    ctx.stroke()
    ctx.setLineDash([])

    drawFitText('DETAILS INFORMATION', ticketX + ticketW / 2, ticketY + 616, ticketW - 90, 20, 700, '#ffffff', 'center', 15)
    drawText(eventDate, ticketX + ticketW / 2, ticketY + 658, ticketW - 100, 17, 500, 'rgba(255,255,255,0.86)', 'center', 2)
    drawText(venue, ticketX + ticketW / 2, ticketY + 716, ticketW - 100, 17, 500, 'rgba(255,255,255,0.78)', 'center', 2)

    const detailY = ticketY + 812
    if (hasSeat) {
      drawFitText('SECTION', ticketX + 70, detailY, 125, 21, 900, '#ffffff', 'left', 15)
      drawFitText(ticket.sectionName || 'GENERAL', ticketX + 200, detailY, 250, 20, 500, '#ffffff', 'left', 13)
      drawFitText('ROW', ticketX + 70, detailY + 42, 125, 21, 900, '#ffffff', 'left', 15)
      drawFitText(ticket.rowLabel || '-', ticketX + 200, detailY + 42, 250, 20, 500, '#ffffff', 'left', 13)
      drawFitText('SEAT', ticketX + 70, detailY + 84, 125, 21, 900, '#ffffff', 'left', 15)
      drawFitText(ticket.seatNumber || ticket.seatCode, ticketX + 200, detailY + 84, 250, 20, 500, '#ffffff', 'left', 13)
    } else {
      drawFitText('PASS TYPE', ticketX + 70, detailY, 155, 21, 900, '#ffffff', 'left', 15)
      drawFitText(ticket.sectionName || ticket.seatCode || 'General Admission', ticketX + 240, detailY, 220, 20, 500, '#ffffff', 'left', 13)
      drawFitText('ACCESS', ticketX + 70, detailY + 48, 155, 21, 900, '#ffffff', 'left', 15)
      drawFitText('General Entry', ticketX + 240, detailY + 48, 220, 20, 500, '#ffffff', 'left', 13)
    }

    ctx.fillStyle = '#f7f3ee'
    ctx.fillRect(ticketX, stubY, ticketW, stubH)
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'
    ctx.beginPath()
    ctx.moveTo(ticketX + 34, stubY)
    ctx.lineTo(ticketX + ticketW - 34, stubY)
    ctx.stroke()

    drawFitText(eventTitle.toUpperCase(), ticketX + ticketW / 2, stubY + 54, ticketW - 90, 30, 900, '#2626d9', 'center', 18)
    drawFitText(event.artistOrOrganizer || event.category || 'EVENT PASS', ticketX + ticketW / 2, stubY + 96, ticketW - 100, 17, 500, '#333333', 'center', 13)
    drawFitText(userDetails.name || 'YOUR NAME HERE', ticketX + ticketW / 2, stubY + 145, ticketW - 90, 24, 500, '#7443c8', 'center', 15)

    const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(barcodeSvg, ticket.ticketCode, {
      format: 'CODE128',
      displayValue: false,
      height: 88,
      margin: 0,
      width: 2.1,
      lineColor: '#111111',
      background: 'transparent',
    })
    const barcodeUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(barcodeSvg))}`
    const barcode = await loadImage(barcodeUrl)
    if (barcode) ctx.drawImage(barcode, ticketX + 62, stubY + 200, ticketW - 124, 76)
    drawFitText(ticket.ticketCode.slice(-18), ticketX + ticketW / 2, stubY + 274, ticketW - 110, 15, 600, '#303030', 'center', 11)

    if (forEmail) return canvas.toDataURL('image/jpeg', 0.94)
    const link = document.createElement('a')
    link.download = `${ticket.ticketCode}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const queueRenderedTicketEmail = async (bookingConfirmation, event) => {
    try {
      const bookings = await getMyTickets()
      const booking = bookings.find((item) => Number(item.bookingId) === Number(bookingConfirmation.bookingId))
      if (!booking?.tickets?.length) throw new Error('The confirmed tickets could not be loaded.')
      const tickets = await Promise.all(booking.tickets.map(async (ticket) => ({
        bookingItemId: ticket.bookingItemId,
        ticketCode: ticket.ticketCode,
        image: await downloadTicketImage(ticket, booking, event, true),
      })))
      await submitBookingTicketImages(booking.bookingId, tickets)
    } catch (error) {
      console.error('Could not prepare the confirmation email ticket images.', error)
    }
  }

  const videoRef = useRef(null)
  const catScrollRef = useRef(null)
  const autoplayRef = useRef(null)

  const scrollToSection = (sectionId) => {
    setMobileMenuOpen(false)
    if (sectionId === 'home') {
      setIsCategorySearchOpen(false)
      setCategorySearchQuery('')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Collapse category search bar on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isCategorySearchOpen &&
        categorySearchContainerRef.current &&
        !categorySearchContainerRef.current.contains(event.target)
      ) {
        setIsCategorySearchOpen(false)
        setCategorySearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isCategorySearchOpen])

  const handleContactSubmit = (e) => {
    e.preventDefault()
    if (!contactForm.name || !contactForm.email || !contactForm.message) return
    setContactLoading(true)
    setTimeout(() => {
      setContactLoading(false)
      setContactSubmitted(true)
      setContactForm({ name: '', email: '', subject: 'General Query', message: '' })
      setTimeout(() => setContactSubmitted(false), 5000)
    }, 800)
  }

  useEffect(() => {
    const syncAuthState = () => setAuthState(readAuthState())
    window.addEventListener('storage', syncAuthState)
    return () => window.removeEventListener('storage', syncAuthState)
  }, [])

  // Sync latest user profile on authentication
  useEffect(() => {
    if (authState.isAuthenticated) {
      getCurrentUserProfile().then((profile) => {
        if (profile) {
          setAuthState(readAuthState())
        }
      })
    }
  }, [authState.isAuthenticated, profilePanelOpen])

  const fetchLiveEvents = async () => {
    const request = ++liveRequestRef.current
    setEventsLoading(true)
    setEventsError(false)
    try {
      const dbEvents = await getAllEvents()
      if (request !== liveRequestRef.current) return
      if (Array.isArray(dbEvents) && dbEvents.length > 0) {
        const formattedEvents = dbEvents.map((e) => {
          let parsedTiers = []
          try {
            if (e.ticketTiersJson) {
              parsedTiers =
                typeof e.ticketTiersJson === 'string' ? JSON.parse(e.ticketTiersJson) : e.ticketTiersJson || []
            } else {
              parsedTiers = typeof e.ticketTiers === 'string' ? JSON.parse(e.ticketTiers) : e.ticketTiers || []
            }
          } catch {
            parsedTiers = []
          }
          const minTiersPrice = parsedTiers.length > 0 ? Math.min(...parsedTiers.map((t) => Number(t.price) || 0)) : 0
          const catName =
            typeof e.category === 'object' && e.category !== null
              ? e.category.name
              : typeof e.category === 'string'
                ? e.category
                : e.categoryName || 'Music & Concerts'
          const eventDateVal = e.date || e.eventDate
          return {
            id: e.id,
            title: e.title,
            subtitle: e.artistOrOrganizer || e.organizerName || 'Live Event',
            artistOrOrganizer: e.artistOrOrganizer || e.organizerName || 'Featured Artist',
            organizerId: e.organizerId || e.OrganizerId,
            organizerName: e.organizerName || e.OrganizerName,
            cover: e.coverImage || e.imageUrl || null,
            year:
              eventDateVal && !isNaN(new Date(eventDateVal).getTime())
                ? new Date(eventDateVal).getFullYear().toString()
                : '2026',
            category: catName,
            venue: e.venue || e.location || 'Sri Lanka',
            minPrice: Number(e.minPrice || e.price) || minTiersPrice || 0,
            trackCount: `${catName} • From LKR ${Number(e.minPrice || e.price || minTiersPrice || 0).toLocaleString()} • ${e.venue || e.location || 'Sri Lanka'}`,
            ticketTiers: parsedTiers,
            totalCapacity: e.totalCapacity || e.availableTickets || 500,
            eventDate: eventDateVal,
            startsAtUtc: e.startsAtUtc,
            utcOffsetMinutes: e.utcOffsetMinutes,
            eventTime: extractTimeFromEvent(e),
            time: extractTimeFromEvent(e),
            description: e.description,
            seatingConfig:
              e.seatingConfig ||
              (e.seatingConfigJson
                ? typeof e.seatingConfigJson === 'string'
                  ? (() => {
                      try {
                        return JSON.parse(e.seatingConfigJson)
                      } catch {
                        return null
                      }
                    })()
                  : e.seatingConfigJson
                : null),
            seatingConfigJson: e.seatingConfigJson,
            isHidden: Boolean(
              e.isHidden || e.hidden || e.status === 'hidden' || getHiddenEventIds().includes(String(e.id)),
            ),
            isDbEvent: true,
          }
        })
        setAlbumList(formattedEvents)
        setCenterIndex(0)
      } else {
        setAlbumList([])
      }
    } catch {
      if (request !== liveRequestRef.current) return
      setEventsError(true)
      setAlbumList([])
    } finally {
      if (request === liveRequestRef.current) setEventsLoading(false)
    }
  }

  // Fetch published events from database on mount & categories from Catalog API
  useEffect(() => {
    setAlbumList([])
    fetchLiveEvents()
    getCategories().then((cats) => {
      if (Array.isArray(cats) && cats.length > 0) {
        setDbCategories(cats)
        setNewEventForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || cats[0].id,
          category: prev.category || cats[0].name,
        }))
      }
    })
    const requests = liveRequestRef
    return () => {
      requests.current++
    }
    // Refresh scoped results whenever the signed-in identity changes.
  }, [authState.isAuthenticated, userDetails.id, userDetails.role])

  const handleLogout = () => {
    logoutUser()
    setAuthState({ isAuthenticated: false, user: null })
    setMobileMenuOpen(false)
    setProfileMenuOpen(false)
    setProfilePanelOpen(false)
    setShowAddEventModal(false)
    setIsEditingProfile(false)
    setOrganizerDashboardOpen(false)
    setMyEventsList([])
    setTicketManagerOpen(false)
    setAttendeeBookings([])
    setAttendeeTicketsError('')
  }

  const fetchMyEvents = async () => {
    if (!authState.isAuthenticated || !isOrganizer) return
    const request = ++myRequestRef.current
    setLoadingMyEvents(true)
    setMyEventsError(false)
    setMyEventsList([])
    try {
      const dbMyEvents = await getMyEvents()
      if (request !== myRequestRef.current) return
      if (Array.isArray(dbMyEvents)) {
        const formatted = dbMyEvents.map((e) => {
          let parsedTiers = []
          try {
            if (e.ticketTiersJson) {
              parsedTiers =
                typeof e.ticketTiersJson === 'string' ? JSON.parse(e.ticketTiersJson) : e.ticketTiersJson || []
            } else {
              parsedTiers = typeof e.ticketTiers === 'string' ? JSON.parse(e.ticketTiers) : e.ticketTiers || []
            }
          } catch {
            parsedTiers = []
          }
          const minTiersPrice = parsedTiers.length > 0 ? Math.min(...parsedTiers.map((t) => Number(t.price) || 0)) : 0
          const catName =
            typeof e.category === 'object' && e.category !== null
              ? e.category.name
              : typeof e.category === 'string'
                ? e.category
                : e.categoryName || 'Music & Concerts'
          const eventDateVal = e.date || e.eventDate
          return {
            id: e.id,
            title: e.title,
            subtitle: e.artistOrOrganizer || e.organizerName || userDetails.name || 'Live Event',
            artistOrOrganizer: e.artistOrOrganizer || e.organizerName || userDetails.name || 'Featured Artist',
            organizerId: e.organizerId || e.OrganizerId || userDetails.id,
            organizerName: e.organizerName || e.OrganizerName || userDetails.name,
            createdByEmail: userDetails.email,
            cover: e.coverImage || e.imageUrl || null,
            year:
              eventDateVal && !isNaN(new Date(eventDateVal).getTime())
                ? new Date(eventDateVal).getFullYear().toString()
                : '2026',
            category: catName,
            venue: e.venue || e.location || 'Sri Lanka',
            minPrice: Number(e.minPrice || e.price) || minTiersPrice || 0,
            trackCount: `${catName} • From LKR ${Number(e.minPrice || e.price || minTiersPrice || 0).toLocaleString()} • ${e.venue || e.location || 'Sri Lanka'}`,
            ticketTiers: parsedTiers,
            totalCapacity: e.totalCapacity || e.availableTickets || 500,
            eventDate: eventDateVal,
            startsAtUtc: e.startsAtUtc,
            utcOffsetMinutes: e.utcOffsetMinutes,
            eventTime: extractTimeFromEvent(e),
            time: extractTimeFromEvent(e),
            description: e.description,
            seatingConfig:
              e.seatingConfig ||
              (e.seatingConfigJson
                ? typeof e.seatingConfigJson === 'string'
                  ? (() => {
                      try {
                        return JSON.parse(e.seatingConfigJson)
                      } catch {
                        return null
                      }
                    })()
                  : e.seatingConfigJson
                : null),
            seatingConfigJson: e.seatingConfigJson,
            isHidden: Boolean(
              e.isHidden || e.hidden || e.status === 'hidden' || getHiddenEventIds().includes(String(e.id)),
            ),
            isDbEvent: true,
          }
        })
        setMyEventsList(formatted)
      }
    } catch {
      if (request !== myRequestRef.current) return
      setMyEventsList([])
      setMyEventsError(true)
    } finally {
      if (request === myRequestRef.current) setLoadingMyEvents(false)
    }
  }

  useEffect(() => {
    if (isOrganizer && organizerDashboardOpen) {
      fetchMyEvents()
    }
    const requests = myRequestRef
    return () => {
      requests.current++
    }
    // fetchMyEvents closes over the current authenticated user details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizerDashboardOpen, isOrganizer, userDetails.id])

  const myOrganizerEvents = myEventsList.map((event) => ({
    ...event,
    isHidden: event.isHidden || isEventExpired(event, eventNow),
  }))

  const openOrganizerDashboard = () => {
    setLoadingMyEvents(true)
    setMyEventsError(false)
    setMyEventsList([])
    setOrganizerDashboardOpen(true)
  }

  const handleEventCoverUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setEventFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_W = 800
        const scale = Math.min(1, MAX_W / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setNewEventForm((prev) => ({ ...prev, coverImage: canvas.toDataURL('image/jpeg', 0.88) }))
        setEventFeedback({ type: '', text: '' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    const scheduleError = validateEventSchedule(newEventForm.date, newEventForm.time)
    if (scheduleError) {
      setEventFeedback({ type: 'error', text: scheduleError })
      return
    }
    if (!newEventForm.title.trim() || !newEventForm.venue.trim() || !newEventForm.date) {
      setEventFeedback({ type: 'error', text: 'Please enter Event Title, Date, and Venue.' })
      return
    }

    const validTiers = newEventForm.ticketTiers.filter((t) => t.name.trim() && Number(t.price) > 0)
    if (validTiers.length === 0) {
      setEventFeedback({ type: 'error', text: 'Please add at least one valid ticket category with a price.' })
      return
    }

    setEventPublishing(true)
    setEventFeedback({ type: '', text: '' })

    try {
      const selectedCategoryObj = dbCategories.find(
        (c) => String(c.id) === String(newEventForm.categoryId) || c.name === newEventForm.category,
      )
      const categoryIdVal = selectedCategoryObj ? selectedCategoryObj.id : Number(newEventForm.categoryId) || 1
      const categoryNameVal = selectedCategoryObj
        ? selectedCategoryObj.name
        : newEventForm.category || 'Music & Concerts'

      // 1. Persist event to backend database (events table via Gateway)
      const res = await createEvent({
        title: newEventForm.title.trim(),
        artistOrOrganizer: newEventForm.artistOrOrganizer.trim() || userDetails.name || 'Organizer Event',
        organizerId: userDetails.id || 1,
        organizerName: userDetails.name,
        createdByEmail: userDetails.email,
        categoryId: categoryIdVal,
        category: categoryNameVal,
        categoryName: categoryNameVal,
        date: newEventForm.date,
        time: newEventForm.time || '19:00',
        venue: newEventForm.venue.trim(),
        location: newEventForm.venue.trim(),
        ticketTiers: validTiers,
        seatingConfig: newEventForm.seatingConfig,
        coverImage: newEventForm.coverImage || null,
        description: newEventForm.description?.trim() || null,
      })
      await saveSeatingPlan(res.id, seatingConfigToBookingPlan(newEventForm.seatingConfig, validTiers))

      const minPrice = Math.min(...validTiers.map((t) => Number(t.price) || 0))
      const totalCap = validTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)

      const createdItem = {
        id: res?.id || Date.now(),
        title: res?.title || newEventForm.title.trim(),
        subtitle: res?.artistOrOrganizer || userDetails.name || 'Organizer Event',
        artistOrOrganizer: res?.artistOrOrganizer || userDetails.name || 'Organizer Event',
        organizerId: res?.organizerId || userDetails.id,
        organizerName: res?.organizerName || userDetails.name,
        createdByEmail: userDetails.email,
        createdBy: userDetails.email,
        createdById: userDetails.id,
        category: categoryNameVal,
        categoryId: categoryIdVal,
        venue: newEventForm.venue.trim() || 'Colombo',
        minPrice: minPrice,
        cover: res?.coverImage || newEventForm.coverImage || null,
        year: newEventForm.date ? new Date(newEventForm.date).getFullYear().toString() : '2026',
        trackCount: `${categoryNameVal} • From LKR ${minPrice.toLocaleString()} • ${newEventForm.venue}`,
        ticketTiers: validTiers,
        seatingConfig: newEventForm.seatingConfig,
        totalCapacity: totalCap,
        eventDate: newEventForm.date ? `${newEventForm.date}T${newEventForm.time || '19:00'}:00` : '',
        utcOffsetMinutes: -new Date(`${newEventForm.date}T${newEventForm.time}:00`).getTimezoneOffset(),
        date: newEventForm.date,
        eventTime: newEventForm.time || '19:00',
        time: newEventForm.time || '19:00',
        isDbEvent: true,
      }

      setAlbumList((prev) => [createdItem, ...prev])
      setMyEventsList((prev) => [createdItem, ...prev])
      setCenterIndex(0)
      fetchLiveEvents()
      setEventFeedback({ type: 'success', text: 'Event successfully created and live on EXVO!' })

      setTimeout(() => {
        setShowAddEventModal(false)
        setEventFeedback({ type: '', text: '' })
        setNewEventForm({
          title: '',
          artistOrOrganizer: '',
          categoryId: dbCategories[0]?.id || 1,
          category: dbCategories[0]?.name || 'Music & Concerts',
          date: '',
          time: '19:00',
          venue: '',
          ticketTiers: [
            { id: '1', name: 'General Admission', price: '2500', quantity: '500' },
            { id: '2', name: 'VIP Pass', price: '5000', quantity: '150' },
          ],
          seatingConfig: createDefaultSeatingConfig(),
          coverImage: '',
          description: '',
        })
        scrollToSection('home')
      }, 1000)
    } catch (err) {
      setEventFeedback({ type: 'error', text: err.message || 'Failed to publish event. Please try again.' })
    } finally {
      setEventPublishing(false)
    }
  }

  // Edit Event Handlers
  const handleStartEditEvent = (event) => {
    const seatingConfig = event.seatingConfig || createDefaultSeatingConfig(event.ticketTiers)
    setEditingEventId(event.id)
    setEditEventForm({
      title: event.title || '',
      artistOrOrganizer: event.artistOrOrganizer || event.subtitle || '',
      categoryId: event.categoryId || event.CategoryId || '',
      category: event.category || 'Concert',
      date: formatDateForInput(event.eventDate || event.date || ''),
      time: extractTimeFromEvent(event),
      venue: event.venue || '',
      ticketTiers:
        event.ticketTiers && event.ticketTiers.length > 0
          ? event.ticketTiers.map((t) => ({
              id: String(t.id || Date.now()),
              name: t.name || 'Pass',
              price: String(t.price || 0),
              quantity: String(t.quantity || 100),
            }))
          : [{ id: '1', name: 'General Admission', price: String(event.minPrice || 2500), quantity: '500' }],
      seatingConfig,
      coverImage: event.cover || '',
      description: event.description || '',
    })
    setEditEventFeedback({ type: '', text: '' })
    setShowEditEventModal(true)
    Promise.resolve(getOrganizerSeatingPlan(event.id))
      .then((savedPlan) => {
        if (!savedPlan?.sections?.length) return
        setEditEventForm((previous) => ({ ...previous, seatingConfig: bookingPlanToSeatingConfig(savedPlan) }))
      })
      .catch(() => {})
  }

  const handleAddTicketTierInEdit = () => {
    setEditEventForm((prev) => {
      const nextTiers = [...prev.ticketTiers, { id: String(Date.now()), name: '', price: '', quantity: '100' }]
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones = autoSync
        ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
        : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleRemoveTicketTierInEdit = (tierId) => {
    if (editEventForm.ticketTiers.length <= 1) return
    setEditEventForm((prev) => {
      const nextTiers = prev.ticketTiers.filter((t) => t.id !== tierId)
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones = autoSync
        ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
        : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleUpdateTicketTierInEdit = (tierId, field, value) => {
    setEditEventForm((prev) => {
      const nextTiers = prev.ticketTiers.map((t) => (t.id === tierId ? { ...t, [field]: value } : t))
      const autoSync = prev.seatingConfig?.autoSyncCategories ?? true
      const updatedZones =
        autoSync && (field === 'name' || field === 'price')
          ? syncSeatingZonesWithTicketTiers(nextTiers, prev.seatingConfig?.zones || [])
          : prev.seatingConfig?.zones
      return {
        ...prev,
        ticketTiers: nextTiers,
        seatingConfig: { ...prev.seatingConfig, zones: updatedZones },
      }
    })
  }

  const handleEditEventCoverUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setEditEventFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_W = 800
        const scale = Math.min(1, MAX_W / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setEditEventForm((prev) => ({ ...prev, coverImage: canvas.toDataURL('image/jpeg', 0.88) }))
        setEditEventFeedback({ type: '', text: '' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleUpdateEventSubmit = async (e) => {
    e.preventDefault()
    const scheduleError = validateEventSchedule(editEventForm.date, editEventForm.time)
    if (scheduleError) {
      setEditEventFeedback({ type: 'error', text: scheduleError })
      return
    }
    if (!editEventForm.title.trim() || !editEventForm.venue.trim() || !editEventForm.date) {
      setEditEventFeedback({ type: 'error', text: 'Please enter Event Title, Date, and Venue.' })
      return
    }

    const validTiers = editEventForm.ticketTiers.filter((t) => t.name.trim() && Number(t.price) > 0)
    if (validTiers.length === 0) {
      setEditEventFeedback({ type: 'error', text: 'Please add at least one valid ticket category with a price.' })
      return
    }

    setEditEventPublishing(true)
    setEditEventFeedback({ type: '', text: '' })

    try {
      const minPrice = Math.min(...validTiers.map((t) => Number(t.price) || 0))
      const totalCap = validTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)
      const selectedCategoryObj = dbCategories.find(
        (c) => String(c.id) === String(editEventForm.categoryId) || c.name === editEventForm.category,
      )
      const categoryIdVal = selectedCategoryObj ? selectedCategoryObj.id : Number(editEventForm.categoryId) || 1
      const categoryNameVal = selectedCategoryObj ? selectedCategoryObj.name : editEventForm.category || 'Music & Concerts'

      const payload = {
        id: editingEventId,
        title: editEventForm.title.trim(),
        artistOrOrganizer: editEventForm.artistOrOrganizer.trim() || userDetails.name || 'Organizer Event',
        organizerName: userDetails.name,
        categoryId: categoryIdVal,
        category: categoryNameVal,
        categoryName: categoryNameVal,
        date: editEventForm.date,
        time: editEventForm.time || '19:00',
        venue: editEventForm.venue.trim(),
        ticketTiers: validTiers,
        seatingConfig: editEventForm.seatingConfig,
        coverImage: editEventForm.coverImage || null,
        description: editEventForm.description?.trim() || null,
      }

      await updateEvent(editingEventId, payload)
      await saveSeatingPlan(editingEventId, seatingConfigToBookingPlan(editEventForm.seatingConfig, validTiers))

      setAlbumList((prev) =>
        prev.map((e) =>
          e.id === editingEventId
            ? {
                ...e,
                title: payload.title,
                subtitle: payload.artistOrOrganizer,
                artistOrOrganizer: payload.artistOrOrganizer,
                category: payload.category,
                categoryId: payload.categoryId,
                venue: payload.venue,
                minPrice: minPrice,
                cover: payload.coverImage || e.cover,
                eventDate: `${payload.date}T${payload.time}:00`,
                startsAtUtc: undefined,
                utcOffsetMinutes: -new Date(`${payload.date}T${payload.time}:00`).getTimezoneOffset(),
                date: payload.date,
                eventTime: payload.time,
                time: payload.time,
                description: payload.description,
                ticketTiers: validTiers,
                seatingConfig: payload.seatingConfig,
                totalCapacity: totalCap,
              }
            : e,
        ),
      )
      setMyEventsList((prev) =>
        prev.map((e) =>
          e.id === editingEventId
            ? {
                ...e,
                title: payload.title,
                subtitle: payload.artistOrOrganizer,
                artistOrOrganizer: payload.artistOrOrganizer,
                category: payload.category,
                categoryId: payload.categoryId,
                venue: payload.venue,
                minPrice: minPrice,
                cover: payload.coverImage || e.cover,
                eventDate: `${payload.date}T${payload.time}:00`,
                startsAtUtc: undefined,
                utcOffsetMinutes: -new Date(`${payload.date}T${payload.time}:00`).getTimezoneOffset(),
                date: payload.date,
                eventTime: payload.time,
                time: payload.time,
                description: payload.description,
                ticketTiers: validTiers,
                seatingConfig: payload.seatingConfig,
                totalCapacity: totalCap,
              }
            : e,
        ),
      )

      await fetchLiveEvents()
      setEditEventFeedback({ type: 'success', text: 'Event updated successfully!' })

      setTimeout(() => {
        setShowEditEventModal(false)
        setEditEventFeedback({ type: '', text: '' })
      }, 900)
    } catch (err) {
      setEditEventFeedback({ type: 'error', text: err.message || 'Failed to update event.' })
    } finally {
      setEditEventPublishing(false)
    }
  }

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${eventTitle || 'this event'}"?`)) {
      return
    }

    try {
      await deleteEvent(eventId)
      setAlbumList((prev) => prev.filter((e) => e.id !== eventId))
      setMyEventsList((prev) => prev.filter((e) => e.id !== eventId))
      await fetchLiveEvents()
    } catch (err) {
      alert(`Could not delete event: ${err.message || 'Error occurred'}`)
    }
  }

  const handleToggleHideEvent = async (eventToToggle) => {
    const isCurrentlyHidden = Boolean(
      eventToToggle.isHidden ||
      eventToToggle.IsHidder === 1 ||
      eventToToggle.IsHidder === true ||
      getHiddenEventIds().includes(String(eventToToggle.id)),
    )
    const newHiddenState = !isCurrentlyHidden

    try {
      await setEventVisibility(eventToToggle.id, newHiddenState)
    } catch {
      alert('Could not update event visibility. Please try again.')
      return
    }

    if (newHiddenState) {
      addHiddenEventId(eventToToggle.id)
    } else {
      removeHiddenEventId(eventToToggle.id)
    }

    setAlbumList((prev) =>
      prev.map((e) => (String(e.id) === String(eventToToggle.id) ? { ...e, isHidden: newHiddenState } : e)),
    )
    setMyEventsList((prev) =>
      prev.map((e) => (String(e.id) === String(eventToToggle.id) ? { ...e, isHidden: newHiddenState } : e)),
    )

    await fetchLiveEvents()
  }

  const handleStartEditProfile = () => {
    setProfileForm({
      name: userDetails.name,
      email: userDetails.email,
      phoneNumber: userDetails.contactNumber,
      address: userDetails.address,
      profilePicture: userDetails.profilePicture,
    })
    setProfileFeedback({ type: '', text: '' })
    setIsEditingProfile(true)
  }

  const handleProfileImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileFeedback({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WEBP).' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileFeedback({ type: 'error', text: 'Image file size must be under 5MB.' })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const S_SIZE = 400
        canvas.width = S_SIZE
        canvas.height = S_SIZE
        const ctx = canvas.getContext('2d')

        // Smart 1:1 square crop (center horizontally, top-biased for portraits to capture head/face)
        const minDim = Math.min(img.width, img.height)
        const sx = (img.width - minDim) / 2
        // For portrait images, bias towards the top (face area) rather than dead center (belt/legs)
        const sy = img.height > img.width ? (img.height - minDim) * 0.2 : (img.height - minDim) / 2

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, S_SIZE, S_SIZE)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.9)
        setProfileForm((prev) => ({ ...prev, profilePicture: compressedBase64 }))
        setProfileFeedback({ type: 'success', text: 'Photo auto-cropped to circle! Click Save Changes.' })
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveProfileImage = () => {
    setProfileForm((prev) => ({ ...prev, profilePicture: '' }))
    setProfileFeedback({ type: 'success', text: 'Photo cleared. Click Save to apply.' })
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setProfileFeedback({ type: 'error', text: 'Name and Email are required.' })
      return
    }
    setProfileSaving(true)
    setProfileFeedback({ type: '', text: '' })

    try {
      await updateUserProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
        phoneNumber: profileForm.phoneNumber.trim(),
        address: profileForm.address.trim(),
        profilePicture: profileForm.profilePicture,
      })
      setAuthState(readAuthState())
      setProfileFeedback({ type: 'success', text: 'Profile updated successfully!' })
      setTimeout(() => {
        setIsEditingProfile(false)
        setProfileFeedback({ type: '', text: '' })
      }, 1000)
    } catch (err) {
      setProfileFeedback({ type: 'error', text: err.message || 'Failed to update profile.' })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    try {
      await deleteUserAccount()
      setAuthState(readAuthState())
      setProfilePanelOpen(false)
      setShowDeleteConfirm(false)
      alert('Your account has been deleted successfully.')
    } catch (err) {
      alert(err.message || 'Could not delete account.')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const handleOpenEventDetails = (event) => {
    if (isEventExpired(event)) return
    let tiers = event?.ticketTiers
    if (typeof tiers === 'string') {
      try {
        tiers = JSON.parse(tiers)
      } catch {}
    }
    if ((!tiers || !Array.isArray(tiers) || tiers.length === 0) && event?.ticketTiersJson) {
      try {
        tiers = typeof event.ticketTiersJson === 'string' ? JSON.parse(event.ticketTiersJson) : event.ticketTiersJson
      } catch {}
    }
    setSelectedDetailEvent({
      ...event,
      ticketTiers: Array.isArray(tiers) ? tiers : [],
    })
  }

  const handleCloseEventDetails = () => {
    setSelectedDetailEvent(null)
  }

  const handleOpenBooking = async (event) => {
    if (isEventExpired(event)) return
    const inventoryMeta = getEventInventoryMeta(event)
    if (inventoryMeta.disabled) {
      setHoldError(inventoryMeta.detail)
      return
    }
    if (!authState.isAuthenticated) {
      setAuthInitialMode('login')
      setShowAuth(true)
      return
    }
    setBookingModalEvent(event)
    const initialQtys = {}
    if (event.ticketTiers && event.ticketTiers.length > 0) {
      const eventAvailabilitySnapshot = eventInventoryById[String(event.id)]
      const firstAvailableTierIndex = event.ticketTiers.findIndex((tier, idx) =>
        getTierInventoryMeta(eventAvailabilitySnapshot, tier, idx).availableQuantity > 0,
      )
      event.ticketTiers.forEach((tier, idx) => {
        const key = tier.id ? String(tier.id) : tier.name || `tier-${idx}`
        initialQtys[key] = idx === Math.max(0, firstAvailableTierIndex) ? 1 : 0
      })
    } else {
      const available = eventInventoryById[String(event.id)]?.availableSeatCount ?? event.availableTickets ?? 1
      initialQtys['standard'] = Number(available) > 0 ? 1 : 0
    }
    setTierQuantities(initialQtys)
    setTicketQuantity(1)
    setSelectedSeats([])
    setBookingSuccess(false)
    setSeatHold(null)
    setHoldSecondsRemaining(0)
    setHoldError('')
    setBookingConfirmation(null)
    setConfirmedBookingDetails(null)
    setConfirmingBooking(false)
    setSelectionPrepared(false)
    setBookingStep(1)
    if (!attendeeSeatingPlan || attendeeSeatingPlan.eventId !== event.id) {
      setAttendeeSeatingLoading(true)
      setAttendeeSeatingError(false)
      try {
        const plan = await getAttendeeSeatingPlan(event.id)
        setAttendeeSeatingPlan(plan)
      } catch {
        setAttendeeSeatingPlan(null)
        setAttendeeSeatingError(true)
      } finally {
        setAttendeeSeatingLoading(false)
      }
    }
  }

  // Public events visible to attendees (excludes hidden events)
  const publicEvents = albumList.filter(
    (e) => !e.isHidden && !isEventExpired(e, eventNow) && !getHiddenEventIds().includes(String(e.id)),
  )

  const getEventInventoryMeta = (event) => {
    const inventory = eventInventoryById[String(event?.id)]
    const status = inventory?.inventoryStatus
    if (status === 'SoldOut') {
      return {
        status,
        label: 'SOLD OUT',
        detail: 'All tickets are sold out for this event.',
        disabled: true,
        className: 'is-sold-out',
      }
    }
    if (status === 'TemporarilyHeld') {
      return {
        status,
        label: 'TRY AGAIN SOON',
        detail: 'All remaining tickets are currently held. You may have a chance in a few minutes.',
        disabled: true,
        className: 'is-temporarily-held',
      }
    }
    return {
      status: status || 'Available',
      label: 'AVAILABLE',
      detail: 'Tickets are available.',
      disabled: false,
      className: '',
    }
  }

  const getTierInventoryMeta = (availability, tier, index = 0) => {
    const match = availability?.tiers?.find(
      (item) =>
        String(item.ticketTierId) === String(tier?.id) ||
        Number(item.price) === Number(tier?.price),
    )
    const availableQuantity = match?.availableQuantity ?? Number(tier?.quantity || 0)
    const heldQuantity = match?.heldQuantity ?? 0
    if (availableQuantity > 0) {
      return {
        availableQuantity,
        disabled: false,
        label: `${availableQuantity} LEFT`,
        detail: `${availableQuantity} tickets available`,
        className: '',
      }
    }
    if (heldQuantity > 0) {
      return {
        availableQuantity: 0,
        disabled: true,
        label: 'TRY AGAIN SOON',
        detail: 'This tier is currently fully held. You may have a chance in a few minutes.',
        className: 'is-temporarily-held',
      }
    }
    return {
      availableQuantity: 0,
      disabled: true,
      label: 'SOLD OUT',
      detail: 'This tier is sold out.',
      className: 'is-sold-out',
    }
  }

  const refreshEventInventory = async (eventId) => {
    if (!eventId) return
    try {
      const availability = await getEventAvailability(eventId)
      setEventAvailability((previous) => (previous?.eventId === eventId ? availability : previous))
      setEventInventoryById((previous) => ({ ...previous, [String(eventId)]: availability }))
    } catch {}
  }

  useEffect(() => {
    const visibleEvents = albumList.filter(
      (event) => !event.isHidden && !isEventExpired(event, eventNow) && !getHiddenEventIds().includes(String(event.id)),
    )
    if (visibleEvents.length === 0) {
      setEventInventoryById({})
      return undefined
    }
    let active = true
    Promise.allSettled(
      visibleEvents.map((event) =>
        getEventAvailability(event.id).then((availability) => ({ eventId: event.id, availability })),
      ),
    ).then((results) => {
      if (!active) return
      setEventInventoryById((previous) => {
        const next = { ...previous }
        const liveIds = new Set(visibleEvents.map((event) => String(event.id)))
        Object.keys(next).forEach((id) => {
          if (!liveIds.has(id)) delete next[id]
        })
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.availability) {
            next[String(result.value.eventId)] = result.value.availability
          }
        })
        return next
      })
    })
    return () => {
      active = false
    }
  }, [albumList, eventNow])

  // Show ONLY latest public database events (up to 7 max). If database has fewer than 7 (e.g. 1, 2, 3), show only that exact count!
  const carouselEvents = publicEvents.slice(0, 7)

  // Ensure centerIndex stays within bounds when carouselEvents changes
  useEffect(() => {
    if (carouselEvents.length > 0 && centerIndex >= carouselEvents.length) {
      setCenterIndex(0)
    }
  }, [carouselEvents.length, centerIndex])

  // Auto-advance carousel every 3.5 s continuously; pauses on hover
  useEffect(() => {
    if (isPaused || carouselEvents.length <= 1) return
    autoplayRef.current = setInterval(() => {
      setCenterIndex((prev) => (prev < carouselEvents.length - 1 ? prev + 1 : 0))
    }, 3500)
    return () => clearInterval(autoplayRef.current)
  }, [isPaused, carouselEvents.length])

  // Reset autoplay timer on manual navigation
  const resetAutoplay = () => {
    clearInterval(autoplayRef.current)
    if (!isPaused && carouselEvents.length > 1) {
      autoplayRef.current = setInterval(() => {
        setCenterIndex((prev) => (prev < carouselEvents.length - 1 ? prev + 1 : 0))
      }, 3500)
    }
  }

  const scrollCatLeft = () => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({ left: -220, behavior: 'smooth' })
    }
  }
  const scrollCatRight = () => {
    if (catScrollRef.current) {
      catScrollRef.current.scrollBy({ left: 220, behavior: 'smooth' })
    }
  }

  // Custom loop logic for background video (0:06 to 0:21)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const startTime = 6
    const endTime = 21

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.currentTime = startTime
      }
    }

    const handleCanPlay = () => {
      if (video.currentTime < startTime) {
        video.currentTime = startTime
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('canplay', handleCanPlay)

    if (video.currentTime < startTime) {
      video.currentTime = startTime
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [])

  const getCardClass = (index) => {
    const len = carouselEvents.length
    if (len <= 1) return 'card-center'
    let offset = (index - centerIndex) % len
    if (offset > len / 2) offset -= len
    if (offset < -len / 2) offset += len

    if (offset === 0) return 'card-center'
    if (offset === -1) return 'card-left-1'
    if (offset === -2) return 'card-left-2'
    if (offset <= -3) return 'card-left-3'
    if (offset === 1) return 'card-right-1'
    if (offset === 2) return 'card-right-2'
    if (offset >= 3) return 'card-right-3'
    return ''
  }

  const handlePrev = () => {
    if (carouselEvents.length <= 1) return
    setCenterIndex((prev) => (prev > 0 ? prev - 1 : carouselEvents.length - 1))
    resetAutoplay()
  }

  const handleNext = () => {
    if (carouselEvents.length <= 1) return
    setCenterIndex((prev) => (prev < carouselEvents.length - 1 ? prev + 1 : 0))
    resetAutoplay()
  }

  const categoryDefinitions = [
    { id: 'all', label: 'All Events', glow: 'rgba(255,0,0,0.4)' },
    { id: 'Concert', label: 'Concerts', glow: 'rgba(255,0,0,0.35)' },
    { id: 'Festival', label: 'Festivals', glow: 'rgba(168,85,247,0.35)' },
    { id: 'Live Session', label: 'Live Sessions', glow: 'rgba(59,130,246,0.35)' },
    { id: 'DJ Night', label: 'DJ Nights', glow: 'rgba(236,72,153,0.35)' },
    { id: 'Acoustic', label: 'Acoustic', glow: 'rgba(247,151,30,0.35)' },
    { id: 'Stand-Up', label: 'Stand-Up', glow: 'rgba(56,239,125,0.35)' },
    { id: 'EDM Arena', label: 'EDM Arena', glow: 'rgba(255,102,0,0.35)' },
  ]

  const eventCategories = categoryDefinitions.map((cat) => {
    if (cat.id === 'all') {
      return {
        ...cat,
        count: `${publicEvents.length} ${publicEvents.length === 1 ? 'Event' : 'Events'}`,
        image: publicEvents[0]?.cover || null,
        realCount: publicEvents.length,
      }
    }
    const matching = publicEvents.filter((e) => {
      const eCat = (e.category || (e.trackCount ? e.trackCount.split('•')[0].trim() : '') || '').toLowerCase()
      return eCat.includes(cat.id.toLowerCase())
    })
    return {
      ...cat,
      count: `${matching.length} ${matching.length === 1 ? 'Event' : 'Events'}`,
      image: matching[0]?.cover || null,
      realCount: matching.length,
    }
  })

  const filteredEvents = publicEvents.filter((event) => {
    const matchesCategory =
      !activeCategory ||
      activeCategory === 'all' ||
      (event.category || (event.trackCount ? event.trackCount.split('•')[0].trim() : '') || '')
        .toLowerCase()
        .includes(activeCategory.toLowerCase())

    const query = categorySearchQuery.trim().toLowerCase()
    const matchesSearch =
      !query ||
      (event.title || '').toLowerCase().includes(query) ||
      (event.artistOrOrganizer || event.subtitle || '').toLowerCase().includes(query) ||
      (event.venue || '').toLowerCase().includes(query) ||
      (event.category || '').toLowerCase().includes(query) ||
      (event.description || '').toLowerCase().includes(query)

    return matchesCategory && matchesSearch
  })
  const selectedDetailInventory = selectedDetailEvent ? getEventInventoryMeta(selectedDetailEvent) : null

  if (showAuth) {
    return (
      <AuthPage
        initialMode={authInitialMode}
        onBack={() => setShowAuth(false)}
        onSuccess={() => {
          setAuthState(readAuthState())
          setShowAuth(false)
        }}
      />
    )
  }

  if (ticketManagerOpen) {
    return (
      <TicketManagerPage
        bookings={attendeeBookings}
        events={albumList}
        error={attendeeTicketsError}
        loading={attendeeTicketsLoading}
        onBack={() => setTicketManagerOpen(false)}
        onRefresh={loadAttendeeTickets}
        onDownload={downloadTicketImage}
        formatDate={formatSelectedDate}
        user={authState.user}
      />
    )
  }

  return (
    <div
      id="home"
      className="min-h-screen bg-neutral-950 text-white relative overflow-hidden flex flex-col justify-between font-sans"
    >
      {/* Background video - black & white, auto-play, loops from 0:06 to 0:21 */}
      <video
        ref={videoRef}
        src={backgroundVideo}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover filter grayscale opacity-20 pointer-events-none"
      />

      {/* Dark gradient overlay to blend the background video */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/45 to-neutral-950 pointer-events-none" />

      {/* Header / Navbar */}
      <header className="relative z-50 flex items-center justify-between px-6 md:px-12 py-6">
        {/* Left Side: EXVO Logo */}
        <div onClick={() => scrollToSection('home')} className="flex items-center gap-3 cursor-pointer select-none">
          <ExvoLogo />
          <span className="font-['Orbitron'] font-black text-2xl md:text-3xl tracking-widest flex">
            <span className="text-[#FF0000]">EX</span>
            <span className="text-white">VO</span>
          </span>
        </div>

        <div className="home-actions">
          {isOrganizer && (
            <button
              type="button"
              className="nav-dash-btn"
              onClick={openOrganizerDashboard}
              title="Open Organizer Dashboard"
            >
              <svg
                className="w-4 h-4 text-red-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>DASHBOARD</span>
            </button>
          )}

          {isOrganizer && (
            <button
              type="button"
              className="nav-add-event-btn"
              onClick={() => setShowAddEventModal(true)}
              title="Create / Add New Event"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>ADD EVENT</span>
            </button>
          )}

          {authState.isAuthenticated && (
            <button type="button" className="nav-tickets-btn" onClick={openTicketManager} title="Manage tickets">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                <path d="M13 5v14" />
                <path d="M7 9h3" />
                <path d="M7 15h3" />
              </svg>
              <span>TICKETS</span>
            </button>
          )}

          {authState.isAuthenticated && (
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                className="profile-avatar"
                type="button"
                aria-label="Open profile options"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                {userDetails.profilePicture ? (
                  <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar__img" />
                ) : (
                  userDetails.initials
                )}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-compact-card" onClick={(event) => {
                    event.stopPropagation()
                    setProfilePanelOpen(true)
                    setProfileMenuOpen(false)
                  }}>
                    {/* Left Avatar (Click to view full profile) */}
                    <button
                      type="button"
                      className="profile-compact-avatar"
                      title="View full profile"
                      aria-label="View full profile"
                      onClick={() => {
                        setProfilePanelOpen(true)
                        setProfileMenuOpen(false)
                      }}
                    >
                      {userDetails.profilePicture ? (
                        <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar__img" />
                      ) : (
                        userDetails.initials
                      )}
                    </button>

                    {/* Center Info (Click to view full profile) */}
                    <div
                      className="profile-compact-info"
                      role="button"
                      tabIndex={0}
                      title="Click to view full profile"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.stopPropagation()
                          setProfilePanelOpen(true)
                          setProfileMenuOpen(false)
                        }
                      }}
                      onClick={() => {
                        setProfilePanelOpen(true)
                        setProfileMenuOpen(false)
                      }}
                    >
                      <strong className="profile-compact-name">{userDetails.name}</strong>
                      <span className="profile-compact-email">{userDetails.email}</span>
                      <div className="profile-compact-badge-wrap">
                        <span
                          className={`role-pill ${userDetails.role === 'Organizer' || userDetails.role === 'Company' ? 'role-pill--organizer' : 'role-pill--attendee'}`}
                        >
                          <span className="role-pill__dot" />
                          {userDetails.role === 'Organizer' || userDetails.role === 'Company'
                            ? 'ORGANIZER'
                            : 'TICKET BOOKING'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Logout Icon Button */}
                    <button
                      type="button"
                      className="profile-compact-logout-btn"
                      title="Logout"
                      aria-label="Logout"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleLogout()
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-white hover:text-red-500 transition-colors focus:outline-none"
            aria-label="Toggle Navigation Menu"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8h16M4 16h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Redesigned Navigation Overlay Menu */}
      {mobileMenuOpen && (
        <div className="nav-overlay-fullscreen">
          <div className="nav-overlay-spotlight" />

          {/* Overlay Header Bar */}
          <div className="nav-overlay-header">
            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => scrollToSection('home')}>
              <ExvoLogo />
              <span className="font-['Orbitron'] font-black text-2xl tracking-widest flex">
                <span className="text-[#FF0000]">EX</span>
                <span className="text-white">VO</span>
              </span>
            </div>

            <button
              className="nav-overlay-close-btn"
              type="button"
              aria-label="Close navigation overlay"
              onClick={() => setMobileMenuOpen(false)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Overlay Menu Items */}
          <div className="nav-overlay-body">
            {(authState.isAuthenticated
              ? isOrganizer
                ? ['HOME', 'EVENTS', 'DASHBOARD', 'ADD EVENT', 'ABOUT US', 'CONTACT', 'PROFILE', 'LOGOUT']
                : ['HOME', 'EVENTS', 'MY TICKETS', 'ABOUT US', 'CONTACT', 'PROFILE', 'LOGOUT']
              : ['HOME', 'EVENTS', 'ABOUT US', 'CONTACT', 'LOGIN']
            ).map((link) => (
              <button
                key={link}
                onClick={(event) => {
                  if (link === 'HOME') scrollToSection('home')
                  else if (link === 'EVENTS') scrollToSection('events')
                  else if (link === 'DASHBOARD') {
                    setMobileMenuOpen(false)
                    openOrganizerDashboard()
                  } else if (link === 'ADD EVENT') {
                    setMobileMenuOpen(false)
                    setShowAddEventModal(true)
                  } else if (link === 'MY TICKETS') {
                    setMobileMenuOpen(false)
                    openTicketManager()
                  } else if (link === 'ABOUT US') scrollToSection('about-us')
                  else if (link === 'CONTACT') scrollToSection('contact-us')
                  else if (link === 'LOGIN') {
                    setMobileMenuOpen(false)
                    setShowAuth(true)
                    setAuthInitialMode('login')
                  } else if (link === 'PROFILE') {
                    event.stopPropagation()
                    setMobileMenuOpen(false)
                    setProfilePanelOpen(true)
                  } else if (link === 'LOGOUT') {
                    setMobileMenuOpen(false)
                    handleLogout()
                  }
                }}
                className="nav-overlay-item group"
              >
                <span className="nav-overlay-label">{link}</span>
              </button>
            ))}
          </div>

          {/* Overlay Footer Ribbon */}
          <div className="nav-overlay-footer font-['Orbitron']">
            <span>EXVO EVENT ECOSYSTEM // 2026</span>
            <span className="text-red-500 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              SYSTEM ONLINE
            </span>
          </div>
        </div>
      )}

      {profilePanelOpen && (
        <div
          className="profile-panel-backdrop"
          role="presentation"
          onClick={() => {
            setProfilePanelOpen(false)
            setIsEditingProfile(false)
          }}
        >
          <section
            className="profile-panel"
            ref={profilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Ambient Sci-Fi Corner Brackets */}
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close profile"
              onClick={() => {
                setProfilePanelOpen(false)
                setIsEditingProfile(false)
              }}
            >
              ×
            </button>

            {!isEditingProfile ? (
              /* ── VIEW MODE ── */
              <div className="profile-view-mode">
                {/* Top Pass Ribbon */}
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                    EXVO ID // 2026
                  </span>
                  <span
                    className={`role-pill ${userDetails.role === 'Organizer' || userDetails.role === 'Company' ? 'role-pill--organizer' : 'role-pill--attendee'}`}
                  >
                    <span className="role-pill__dot" />
                    {userDetails.role === 'Organizer' || userDetails.role === 'Company'
                      ? 'ORGANIZER'
                      : 'TICKET BOOKING'}
                  </span>
                </div>

                {/* Avatar with Futuristic Neon Energy Ring */}
                <div className="profile-avatar-wrap">
                  <div className="profile-avatar-ring">
                    <div className="profile-avatar-core">
                      {userDetails.profilePicture ? (
                        <img src={userDetails.profilePicture} alt={userDetails.name} className="profile-avatar-img" />
                      ) : (
                        <span className="profile-avatar-initials">{userDetails.initials}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="profile-avatar-edit-badge"
                    title="Change Profile Photo"
                    aria-label="Change Profile Photo"
                    onClick={handleStartEditProfile}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </button>
                </div>

                {/* Name & Email */}
                <div className="profile-header-info">
                  <h2 id="profile-title" className="profile-user-name">
                    {userDetails.name}
                  </h2>
                  <div className="profile-email-chip">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3.5 h-3.5 text-red-500"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>{userDetails.email}</span>
                  </div>
                </div>

                {/* Modern Futuristic Tile Grid */}
                <div className="profile-tiles-grid">
                  <div className="profile-tile">
                    <div className="profile-tile-header">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-tile-icon"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="profile-tile-label">FULL NAME</span>
                    </div>
                    <div className="profile-tile-val">{userDetails.name}</div>
                  </div>

                  <div className="profile-tile">
                    <div className="profile-tile-header">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-tile-icon"
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span className="profile-tile-label">PHONE</span>
                    </div>
                    <div className={`profile-tile-val ${!userDetails.contactNumber ? 'profile-tile-empty' : ''}`}>
                      {userDetails.contactNumber || (
                        <button type="button" onClick={handleStartEditProfile} className="profile-tile-add-btn">
                          + Add Phone
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="profile-tile profile-tile--full">
                    <div className="profile-tile-header">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-tile-icon"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="profile-tile-label">ADDRESS / LOCATION</span>
                    </div>
                    <div className={`profile-tile-val ${!userDetails.address ? 'profile-tile-empty' : ''}`}>
                      {userDetails.address || (
                        <button type="button" onClick={handleStartEditProfile} className="profile-tile-add-btn">
                          + Add Address
                        </button>
                      )}
                    </div>
                  </div>

                  {userDetails.companyName && userDetails.companyName !== userDetails.name && (
                    <div className="profile-tile">
                      <div className="profile-tile-header">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="profile-tile-icon"
                        >
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                        <span className="profile-tile-label">COMPANY</span>
                      </div>
                      <div className="profile-tile-val">{userDetails.companyName}</div>
                    </div>
                  )}

                  {userDetails.companyRegNumber && (
                    <div className="profile-tile">
                      <div className="profile-tile-header">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="profile-tile-icon"
                        >
                          <line x1="4" y1="9" x2="20" y2="9" />
                          <line x1="4" y1="15" x2="20" y2="15" />
                          <line x1="10" y1="3" x2="8" y2="21" />
                          <line x1="16" y1="3" x2="14" y2="21" />
                        </svg>
                        <span className="profile-tile-label">REG NO</span>
                      </div>
                      <div className="profile-tile-val">{userDetails.companyRegNumber}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="profile-action-row">
                  <button className="profile-btn-primary" type="button" onClick={openTicketManager}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                      <path d="M13 5v14" />
                    </svg>
                    <span>MY TICKETS</span>
                  </button>
                  <button className="profile-btn-primary" type="button" onClick={handleStartEditProfile}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>EDIT PROFILE</span>
                  </button>
                  <button className="profile-btn-logout" type="button" onClick={handleLogout}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>LOGOUT</span>
                  </button>
                </div>

                {/* Delete Account */}
                <div className="profile-delete-zone">
                  {!showDeleteConfirm ? (
                    <button className="profile-btn-delete-acc" type="button" onClick={() => setShowDeleteConfirm(true)}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      <span>DELETE ACCOUNT</span>
                    </button>
                  ) : (
                    <div className="profile-delete-confirm-box">
                      <p className="text-xs text-red-400 font-semibold mb-2 text-center">
                        Are you sure you want to permanently delete your account?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="profile-btn-confirm-delete"
                          disabled={isDeletingAccount}
                          onClick={handleDeleteAccount}
                        >
                          {isDeletingAccount ? 'DELETING...' : 'YES, DELETE'}
                        </button>
                        <button
                          type="button"
                          className="profile-btn-cancel-delete"
                          disabled={isDeletingAccount}
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── EDIT MODE ── */
              <form className="profile-edit-mode" onSubmit={handleSaveProfile}>
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block mr-1.5" />
                    SYSTEM // EDIT MODE
                  </span>
                </div>

                <div className="profile-edit-header">
                  <h2 id="profile-title" className="profile-user-name">Update Profile</h2>
                  <p className="text-xs text-gray-400">Modify your photo and contact credentials</p>
                </div>

                {/* Avatar Preview and Upload Area */}
                <div className="profile-edit-avatar-box">
                  <div className="profile-avatar-wrap">
                    <div className="profile-avatar-ring">
                      <div className="profile-avatar-core">
                        {profileForm.profilePicture ? (
                          <img src={profileForm.profilePicture} alt="Preview" className="profile-avatar-img" />
                        ) : (
                          <span className="profile-avatar-initials">{userDetails.initials}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="profile-upload-actions">
                    <label htmlFor="profile-pic-upload" className="profile-upload-trigger">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Choose Photo
                    </label>
                    <input
                      id="profile-pic-upload"
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                      onChange={handleProfileImageChange}
                    />
                    {profileForm.profilePicture && (
                      <button type="button" className="profile-btn-clear-photo" onClick={handleRemoveProfileImage}>
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                {/* Form Fields */}
                <div className="profile-form-grid">
                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-name">
                      FULL NAME
                    </label>
                    <div className="profile-field-input-shell">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-field-icon"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <input
                        id="edit-name"
                        type="text"
                        required
                        placeholder="Your full name"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-email">
                      EMAIL ADDRESS
                    </label>
                    <div className="profile-field-input-shell">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-field-icon"
                      >
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <input
                        id="edit-email"
                        type="email"
                        required
                        placeholder="your.email@domain.com"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-phone">
                      PHONE NUMBER
                    </label>
                    <div className="profile-field-input-shell">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-field-icon"
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <input
                        id="edit-phone"
                        type="tel"
                        placeholder="+94 7X XXX XXXX"
                        value={profileForm.phoneNumber}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-field-label" htmlFor="edit-address">
                      ADDRESS
                    </label>
                    <div className="profile-field-input-shell">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="profile-field-icon"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <input
                        id="edit-address"
                        type="text"
                        placeholder="City, Country or Street"
                        value={profileForm.address}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {profileFeedback.text && (
                  <div
                    className={`profile-feedback-badge ${profileFeedback.type === 'success' ? 'profile-feedback--success' : 'profile-feedback--error'}`}
                  >
                    {profileFeedback.text}
                  </div>
                )}

                <div className="profile-action-row">
                  <button className="profile-btn-primary" type="submit" disabled={profileSaving}>
                    {profileSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        SAVING...
                      </span>
                    ) : (
                      'SAVE CHANGES'
                    )}
                  </button>
                  <button
                    className="profile-btn-discard"
                    type="button"
                    disabled={profileSaving}
                    onClick={() => {
                      setIsEditingProfile(false)
                      setProfileFeedback({ type: '', text: '' })
                    }}
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* ══════════════ ORGANIZER ADD EVENT MODAL ══════════════ */}
      {showAddEventModal && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => setShowAddEventModal(false)}>
          <section
            className="profile-panel add-event-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-event-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close add event dialog"
              onClick={() => setShowAddEventModal(false)}
            >
              ×
            </button>

            <div className="profile-pass-ribbon font-['Orbitron']">
              <span className="profile-pass-badge text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                ORGANIZER PORTAL // EVENT CREATOR
              </span>
              <span className="role-pill role-pill--organizer">
                <span className="role-pill__dot" />
                ORGANIZER
              </span>
            </div>

            <div className="add-event-header">
              <h2 id="add-event-title" className="profile-user-name">
                Create Live Event
              </h2>
              <p className="text-xs text-neutral-400">
                Publish your concert or festival directly to the EXVO ecosystem
              </p>
            </div>

            <form onSubmit={handleCreateEvent} className="add-event-form space-y-3 mt-4 text-left">
              {/* Event Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                  EVENT TITLE *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Neon Horizon Live 2026"
                  value={newEventForm.title}
                  onChange={(e) => setNewEventForm({ ...newEventForm, title: e.target.value })}
                  className="contact-input"
                />
              </div>

              {/* Artist / Band / Subtitle & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                    PERFORMER / ARTIST
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sarith Surith & News"
                    value={newEventForm.artistOrOrganizer}
                    onChange={(e) => setNewEventForm({ ...newEventForm, artistOrOrganizer: e.target.value })}
                    className="contact-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                    CATEGORY
                  </label>
                  <select
                    value={newEventForm.categoryId || newEventForm.category}
                    onChange={(e) => {
                      const selectedVal = e.target.value
                      const found = dbCategories.find(
                        (c) => String(c.id) === String(selectedVal) || c.name === selectedVal,
                      )
                      if (found) {
                        setNewEventForm({ ...newEventForm, categoryId: found.id, category: found.name })
                      } else {
                        setNewEventForm({ ...newEventForm, category: selectedVal })
                      }
                    }}
                    className="contact-input"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Schedule & Interactive Calendar Picker ── */}
              <div className="add-event-section-box">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 text-red-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    EVENT SCHEDULE & CALENDAR *
                  </label>
                  {newEventForm.date && (
                    <span className="add-event-date-preview font-['Orbitron']">
                      {formatSelectedDate(newEventForm.date, newEventForm.time)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type="date"
                      required
                      min={localDate(scheduleNow)}
                      aria-label="Event date"
                      value={newEventForm.date}
                      onChange={(e) => {
                        const next = { ...newEventForm, date: e.target.value }
                        setNewEventForm(next)
                        const text = validateEventSchedule(next.date, next.time)
                        setEventFeedback({ type: text ? 'error' : '', text })
                      }}
                      className="contact-input add-event-calendar-input"
                    />
                  </div>
                  <div>
                    <input
                      type="time"
                      required
                      aria-label="Event time"
                      min={minimumEventTime(newEventForm.date, scheduleNow)}
                      value={newEventForm.time}
                      onChange={(e) => {
                        const next = { ...newEventForm, time: e.target.value }
                        setNewEventForm(next)
                        const text = validateEventSchedule(next.date, next.time)
                        setEventFeedback({ type: text ? 'error' : '', text })
                      }}
                      className="contact-input add-event-time-input"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider">Quick:</span>
                  <button type="button" onClick={() => handleSetQuickDate(1)} className="add-event-quick-chip">
                    Tomorrow
                  </button>
                  <button type="button" onClick={() => handleSetQuickDate(7)} className="add-event-quick-chip">
                    +1 Week
                  </button>
                  <button type="button" onClick={() => handleSetQuickDate(14)} className="add-event-quick-chip">
                    +2 Weeks
                  </button>
                  <button type="button" onClick={() => handleSetQuickDate(30)} className="add-event-quick-chip">
                    +1 Month
                  </button>
                </div>
              </div>

              {/* Venue / Location */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                  VENUE / LOCATION *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CR&FC Grounds, Colombo 07"
                  value={newEventForm.venue}
                  onChange={(e) => setNewEventForm({ ...newEventForm, venue: e.target.value })}
                  className="contact-input"
                />
              </div>

              {/* ── Multiple Ticket Price Categories ── */}
              <div className="add-event-section-box">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5 text-red-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 012 2 2 2 0 01-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 012-2V7a2 2 0 00-2-2H5z" />
                      </svg>
                      TICKET PRICING & CATEGORIES *
                    </label>
                    <p className="text-[10px] text-neutral-400">
                      Add multiple price tiers (VIP, General, Early Bird, etc.)
                    </p>
                  </div>
                  <button type="button" onClick={handleAddTicketTier} className="add-event-add-tier-btn">
                    + Add Category
                  </button>
                </div>

                <div className="space-y-2">
                  {newEventForm.ticketTiers.map((tier) => (
                    <div key={tier.id} className="add-event-tier-card">
                      <div className="add-event-tier-grid">
                        {/* Tier Name */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">CATEGORY / PASS</span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. VIP Pass"
                            value={tier.name}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'name', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Price */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">PRICE (LKR)</span>
                          <input
                            type="number"
                            required
                            min="0"
                            placeholder="e.g. 3500"
                            value={tier.price}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'price', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Quantity */}
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">QTY</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="100"
                            value={tier.quantity}
                            onChange={(e) => handleUpdateTicketTier(tier.id, 'quantity', e.target.value)}
                            className="contact-input !py-1.5 text-xs"
                          />
                        </div>
                        {/* Remove Button */}
                        {newEventForm.ticketTiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTicketTier(tier.id)}
                            className="add-event-tier-remove-btn"
                            title="Remove category"
                          >
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Quick Suggestion Chips */}
                      {!tier.name && (
                        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5 flex-wrap">
                          <span className="text-[8.5px] text-neutral-500 uppercase">Suggestions:</span>
                          {['VIP Pass', 'General Admission', 'Early Bird', 'Balcony', 'VVIP Table'].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleUpdateTicketTier(tier.id, 'name', tag)}
                              className="add-event-tag-chip"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Tier Summary Footer */}
                <div className="add-event-tiers-summary">
                  <span>
                    Total Capacity:{' '}
                    <strong>
                      {newEventForm.ticketTiers.reduce((acc, t) => acc + (Number(t.quantity) || 0), 0)} Tickets
                    </strong>
                  </span>
                  <span>
                    Price:{' '}
                    <strong>
                      {newEventForm.ticketTiers.filter((t) => Number(t.price) > 0).length > 0
                        ? `LKR ${Math.min(...newEventForm.ticketTiers.map((t) => Number(t.price) || 0)).toLocaleString()} - ${Math.max(...newEventForm.ticketTiers.map((t) => Number(t.price) || 0)).toLocaleString()}`
                        : 'Set prices above'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* ── Visual Reserved Seating Layout Builder ── */}
              <div className="add-event-section-box">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                      RESERVED SEATING LAYOUT & PLAN
                    </label>
                    <p className="text-[10px] text-neutral-400">
                      Configure interactive seat arrangement, zones & blocked seats
                    </p>
                  </div>

                  {/* Toggle Enable/Disable */}
                  <button
                    type="button"
                    onClick={() => {
                      const curr = newEventForm.seatingConfig || createDefaultSeatingConfig()
                      setNewEventForm((prev) => ({
                        ...prev,
                        seatingConfig: { ...curr, enabled: !curr.enabled },
                      }))
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-['Orbitron'] font-bold transition-all cursor-pointer flex items-center gap-2 ${
                      newEventForm.seatingConfig?.enabled
                        ? 'bg-emerald-600/30 border border-emerald-500/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                        : 'bg-white/5 border border-white/10 text-neutral-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${newEventForm.seatingConfig?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`}
                    />
                    {newEventForm.seatingConfig?.enabled
                      ? '● DISPLAY SEATING TO ATTENDEES (ENABLED)'
                      : '○ HIDE SEATING FROM ATTENDEES (DISABLED)'}
                  </button>
                </div>

                <div
                  className={`p-2.5 rounded-xl text-[10px] flex items-center justify-between border mb-3 ${
                    newEventForm.seatingConfig?.enabled
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-neutral-900/50 border-neutral-800 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {newEventForm.seatingConfig?.enabled
                        ? 'Seating plan will be displayed to attendees during checkout, allowing them to choose specific seats.'
                        : 'Seating chart is hidden from attendees. Attendees will purchase standard ticket categories.'}
                    </span>
                  </div>
                </div>

                {newEventForm.seatingConfig?.enabled && (
                  <div className="space-y-4 pt-2 border-t border-white/10">
                    {/* Configuration Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-neutral-400 uppercase">STAGE / SCREEN LABEL</label>
                        <input
                          type="text"
                          value={newEventForm.seatingConfig.stageLabel || 'SCREEN'}
                          onChange={(e) => {
                            const val = e.target.value
                            setNewEventForm((prev) => ({
                              ...prev,
                              seatingConfig: { ...prev.seatingConfig, stageLabel: val },
                            }))
                          }}
                          placeholder="e.g. SCREEN or MAIN STAGE"
                          className="contact-input !py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-neutral-400 uppercase">LAYOUT PRESETS</label>
                        <select
                          onChange={(e) => {
                            const preset = e.target.value
                            let newZones = newEventForm.seatingConfig.zones
                            if (preset === 'standard') {
                              newZones = createDefaultSeatingConfig().zones
                            } else if (preset === 'vip_general') {
                              newZones = [
                                {
                                  id: 'z1',
                                  name: 'VIP FRONT ROW',
                                  price: 5000,
                                  rows: ['A', 'B'],
                                  seatsPerRow: 10,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z2',
                                  name: 'GENERAL ARENA',
                                  price: 2500,
                                  rows: ['C', 'D', 'E', 'F'],
                                  seatsPerRow: 12,
                                  occupiedSeats: [],
                                },
                              ]
                            } else if (preset === 'theater') {
                              newZones = [
                                {
                                  id: 'z1',
                                  name: 'ORCHESTRA',
                                  price: 4000,
                                  rows: ['A', 'B', 'C', 'D'],
                                  seatsPerRow: 14,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z2',
                                  name: 'MEZZANINE',
                                  price: 2500,
                                  rows: ['E', 'F', 'G'],
                                  seatsPerRow: 14,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z3',
                                  name: 'BALCONY',
                                  price: 1500,
                                  rows: ['H', 'I', 'J'],
                                  seatsPerRow: 12,
                                  occupiedSeats: [],
                                },
                              ]
                            }
                            setNewEventForm((prev) => ({
                              ...prev,
                              seatingConfig: { ...prev.seatingConfig, zones: newZones },
                            }))
                          }}
                          className="contact-input !py-1.5 text-xs"
                        >
                          <option value="standard">Standard Cinema (Classic / Premium / Superior)</option>
                          <option value="vip_general">Concert Arena (VIP Front Row / General Arena)</option>
                          <option value="theater">Theater Hall (Orchestra / Mezzanine / Balcony)</option>
                        </select>
                      </div>
                    </div>

                    {/* Zone Editor List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[9px] font-bold text-neutral-400 uppercase flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>SEATING ZONES & PRICE TIERS</span>
                          <button
                            type="button"
                            onClick={() => {
                              const synced = syncSeatingZonesWithTicketTiers(
                                newEventForm.ticketTiers,
                                newEventForm.seatingConfig?.zones || [],
                              )
                              setNewEventForm((prev) => ({
                                ...prev,
                                seatingConfig: { ...prev.seatingConfig, zones: synced },
                              }))
                            }}
                            className="px-2 py-0.5 rounded bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 hover:text-white transition-all text-[9.5px] cursor-pointer flex items-center gap-1 font-bold tracking-wider uppercase font-['Orbitron']"
                            title="Click to sync zone names and prices with Ticket Categories above"
                          >
                            SYNC WITH TICKET CATEGORIES
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextId = `zone-${Date.now()}`
                            const nextLetter = String.fromCharCode(65 + newEventForm.seatingConfig.zones.length * 3)
                            const newZone = {
                              id: nextId,
                              name: 'NEW ZONE',
                              price: 2000,
                              rows: [nextLetter],
                              seatsPerRow: 10,
                              occupiedSeats: [],
                            }
                            setNewEventForm((prev) => ({
                              ...prev,
                              seatingConfig: {
                                ...prev.seatingConfig,
                                zones: [...prev.seatingConfig.zones, newZone],
                              },
                            }))
                          }}
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          + Add Zone
                        </button>
                      </div>

                      {newEventForm.seatingConfig.zones.map((zone, zIdx) => (
                        <div
                          key={zone.id || zIdx}
                          className="bg-black/30 p-2.5 rounded-xl border border-white/10 text-left space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">ZONE NAME</span>
                              <input
                                type="text"
                                value={zone.name}
                                onChange={(e) => {
                                  const name = e.target.value
                                  setNewEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, name } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">PRICE (LKR)</span>
                              <input
                                type="number"
                                value={zone.price}
                                onChange={(e) => {
                                  const price = Number(e.target.value) || 0
                                  setNewEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, price } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">ROWS (comma separated)</span>
                              <input
                                type="text"
                                value={(zone.rows || []).join(', ')}
                                onChange={(e) => {
                                  const rows = e.target.value
                                    .split(',')
                                    .map((r) => r.trim().toUpperCase())
                                    .filter(Boolean)
                                  setNewEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, rows } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <span className="text-[8px] text-neutral-500 uppercase">SEATS PER ROW</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="25"
                                  value={zone.seatsPerRow}
                                  onChange={(e) => {
                                    const seatsPerRow = Math.min(25, Math.max(1, Number(e.target.value) || 10))
                                    setNewEventForm((prev) => ({
                                      ...prev,
                                      seatingConfig: {
                                        ...prev.seatingConfig,
                                        zones: prev.seatingConfig.zones.map((z, i) =>
                                          i === zIdx ? { ...z, seatsPerRow } : z,
                                        ),
                                      },
                                    }))
                                  }}
                                  className="contact-input !py-1 text-xs"
                                />
                              </div>
                              {newEventForm.seatingConfig.zones.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewEventForm((prev) => ({
                                      ...prev,
                                      seatingConfig: {
                                        ...prev.seatingConfig,
                                        zones: prev.seatingConfig.zones.filter((_, i) => i !== zIdx),
                                      },
                                    }))
                                  }}
                                  className="text-red-500 hover:text-red-400 p-1 mt-3 cursor-pointer"
                                  title="Remove Zone"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Interactive Seating Layout Visual Live Preview Component! */}
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <span className="text-[10px] font-bold text-neutral-300 font-['Orbitron'] uppercase block mb-1">
                        LIVE INTERACTIVE SEATING CHART PREVIEW (CLICK SEATS TO TOGGLE OCCUPIED / RESERVED)
                      </span>
                      <SeatingChartComponent
                        seatingConfig={newEventForm.seatingConfig}
                        isOrganizerEdit={true}
                        onToggleOccupied={(seatId) => {
                          setNewEventForm((prev) => {
                            const currentConfig = prev.seatingConfig
                            const updatedZones = currentConfig.zones.map((z) => {
                              const isOccupied = z.occupiedSeats?.includes(seatId)
                              let newOccupied
                              if (isOccupied) {
                                newOccupied = z.occupiedSeats.filter((s) => s !== seatId)
                              } else {
                                newOccupied = [...(z.occupiedSeats || []), seatId]
                              }
                              return { ...z, occupiedSeats: newOccupied }
                            })
                            return {
                              ...prev,
                              seatingConfig: { ...currentConfig, zones: updatedZones },
                            }
                          })
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Event Cover Image Upload */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                  EVENT BANNER / COVER POSTER
                </label>
                <div className="add-event-banner-wrap">
                  {newEventForm.coverImage ? (
                    <div className="add-event-banner-preview">
                      <img
                        src={newEventForm.coverImage}
                        alt="Cover preview"
                        className="w-full h-32 object-cover rounded-xl border border-red-500/50 shadow-lg shadow-red-950/50"
                      />
                      <button
                        type="button"
                        onClick={() => setNewEventForm({ ...newEventForm, coverImage: '' })}
                        className="add-event-banner-remove"
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <label className="add-event-banner-dropzone">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-6 h-6 text-red-500 mb-1.5"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="text-xs text-neutral-200 font-semibold font-['Orbitron']">
                        Upload Event Poster
                      </span>
                      <span className="text-[10px] text-neutral-400">PNG, JPG or WEBP (Optimized auto-fit)</span>
                      <input type="file" accept="image/*" onChange={handleEventCoverUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron']">
                  EVENT DESCRIPTION
                </label>
                <textarea
                  rows={2}
                  placeholder="Gate opening times, special rules, VIP benefits..."
                  value={newEventForm.description}
                  onChange={(e) => setNewEventForm({ ...newEventForm, description: e.target.value })}
                  className="contact-input resize-none"
                />
              </div>

              {eventFeedback.text && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-semibold ${eventFeedback.type === 'error' ? 'bg-red-950/70 border border-red-500/50 text-red-300' : 'bg-green-950/70 border border-green-500/50 text-green-300'}`}
                >
                  {eventFeedback.text}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={eventPublishing} className="profile-btn-primary flex-1 !py-3">
                  {eventPublishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      PUBLISHING EVENT...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      PUBLISH EVENT LIVE
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => setShowAddEventModal(false)} className="profile-btn-logout !px-4">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════ TICKET BOOKING MODAL ══════════════ */}
      {bookingModalEvent && (
        <div className="profile-panel-backdrop" role="presentation" onClick={() => setBookingModalEvent(null)}>
          <section
            className="profile-panel booking-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            <button
              className="profile-panel__close"
              type="button"
              aria-label="Close ticket booking"
              onClick={() => setBookingModalEvent(null)}
            >
              ×
            </button>

            {!bookingSuccess ? (
              <>
                <div className="profile-pass-ribbon font-['Orbitron']">
                  <span className="profile-pass-badge text-red-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block mr-1.5" />
                    EXVO SECURE TICKET GATEWAY
                  </span>
                  <span className="role-pill role-pill--client">
                    <span className="role-pill__dot" />
                    INSTANT PASS
                  </span>
                </div>

                <div className="booking-modal-hero">
                  <EventPoster
                    src={bookingModalEvent.cover}
                    title={bookingModalEvent.title}
                    className="booking-modal-cover"
                  />
                  <div className="text-left">
                    <span className="event-category-pill mb-2 inline-block">
                      {bookingModalEvent.category || 'CONCERT'}
                    </span>
                    <h2 id="booking-modal-title" className="text-lg md:text-xl font-black text-white font-['Orbitron']">
                      {bookingModalEvent.title}
                    </h2>
                    <p className="text-xs text-red-400 font-['Orbitron'] mt-1">
                      {bookingModalEvent.artistOrOrganizer || bookingModalEvent.subtitle}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1.5">
                      Venue: {bookingModalEvent.venue || 'Sri Lanka'}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      Date:{' '}
                      {formatSelectedDate(bookingModalEvent.eventDate, bookingModalEvent.eventTime) ||
                        bookingModalEvent.year}
                    </p>
                  </div>
                </div>

                {/* ── MULTI-TIER TICKET BOOKING & SEATING FLOW ── */}
                {(() => {
                  const totalTicketsCount =
                    bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0
                      ? Object.values(tierQuantities).reduce((sum, q) => sum + (Number(q) || 0), 0)
                      : tierQuantities['standard'] || 1

                  const totalBookingPrice =
                    bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0
                      ? bookingModalEvent.ticketTiers.reduce((sum, tier, idx) => {
                          const key = tier.id ? String(tier.id) : tier.name || `tier-${idx}`
                          const qty = tierQuantities[key] || 0
                          return sum + Number(tier.price || 0) * qty
                        }, 0)
                      : Number(bookingModalEvent.minPrice || 0) * (tierQuantities['standard'] || 1)

                  const selectedTiersSummary =
                    bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0
                      ? bookingModalEvent.ticketTiers
                          .map((tier, idx) => {
                            const key = tier.id ? String(tier.id) : tier.name || `tier-${idx}`
                            const qty = tierQuantities[key] || 0
                            return qty > 0 ? `${qty}x ${tier.name || `Tier ${idx + 1}`}` : null
                          })
                          .filter(Boolean)
                          .join(', ')
                      : `${tierQuantities['standard'] || 1}x Standard Pass`
                  const selectedTiers = (bookingModalEvent.ticketTiers || []).filter((tier, index) => {
                    const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                    return Number(tierQuantities[key]) > 0
                  })
                  const tierHasSeats = (tier) =>
                    attendeeSeatingPlan?.sections?.some((section) =>
                      section.seats?.some(
                        (seat) =>
                          String(seat.ticketTierId) === String(tier.id) || Number(seat.price) === Number(tier.price),
                      ),
                    )
                  const seatedSelectedTiers = selectedTiers.filter(tierHasSeats)
                  const normalSelectedTiers = selectedTiers.filter((tier) => !tierHasSeats(tier))
                  const selectedTierHasSeat = (seat) =>
                    seatedSelectedTiers.some((tier) =>
                      String(tier.id) === String(seat.ticketTierId) || Number(tier.price) === Number(seat.price),
                    )
                  const selectedPlan =
                    attendeeSeatingPlan?.eventId === bookingModalEvent.id
                      ? {
                          ...attendeeSeatingPlan,
                          sections: (attendeeSeatingPlan.sections || [])
                            .map((section) => ({
                              ...section,
                              seats: (section.seats || []).filter(selectedTierHasSeat),
                            }))
                            .filter((section) => section.seats.length > 0),
                        }
                      : null
                  const hasAssignedSeating = Boolean(selectedPlan?.sections?.length)
                  const availableSeats = hasAssignedSeating ? availableSeatsInPlan(selectedPlan) : []
                  const assignedTicketCount = (bookingModalEvent.ticketTiers || []).reduce((total, tier, index) => {
                    const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                    return tierHasSeats(tier) ? total + (Number(tierQuantities[key]) || 0) : total
                  }, 0)
                  const selectedSeatRecords = availableSeats.filter((seat) => selectedSeats.includes(seat.seatCode))
                  const selectedSeatTotal = selectedSeatRecords.reduce((sum, seat) => sum + Number(seat.price || 0), 0)
                  const bookingSeatingConfig = hasAssignedSeating ? seatingPlanToChartConfig(selectedPlan) : null
                  const availabilityForTier = (tier, index) => {
                    const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                    const availability = eventAvailability?.eventId === bookingModalEvent.id ? eventAvailability : null
                    const meta = getTierInventoryMeta(availability, tier, index)
                    return { key, quantity: meta.availableQuantity, meta }
                  }
                  const standardAvailability =
                    eventAvailability?.eventId === bookingModalEvent.id
                      ? eventAvailability.availableSeatCount || 0
                      : Number(bookingModalEvent.availableTickets) || 0
                  const generalTicketSelections =
                    bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0
                      ? selectedTiers.map((tier, index) => {
                          const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                          return {
                            ticketTierId: tier.id ? Number(tier.id) : null,
                            name: tier.name || `Tier ${index + 1}`,
                            unitPrice: Number(tier.price || 0),
                            quantity: Number(tierQuantities[key]) || 0,
                          }
                        })
                      : [
                          {
                            ticketTierId: null,
                            name: 'Standard Pass',
                            unitPrice: Number(bookingModalEvent.minPrice || 0),
                            quantity: Number(tierQuantities.standard || 1),
                          },
                        ]
                  const mixedGeneralTicketSelections = normalSelectedTiers.map((tier, index) => {
                    const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                    return {
                      ticketTierId: tier.id ? Number(tier.id) : null,
                      name: tier.name || `Tier ${index + 1}`,
                      unitPrice: Number(tier.price || 0),
                      quantity: Number(tierQuantities[key]) || 0,
                    }
                  }).filter((ticket) => ticket.quantity > 0)

                  return (
                    <>
                      {/* ── STEP INDICATOR (only if seating enabled) ── */}
                      {hasAssignedSeating && (
                        <div className="flex items-center gap-2 mt-4 mb-1">
                          <div
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-['Orbitron'] font-bold transition-all ${bookingStep === 1 ? 'bg-red-600 text-white' : 'bg-white/10 text-neutral-400'}`}
                          >
                            <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px]">
                              1
                            </span>
                            SELECT TIERS & QTY
                          </div>
                          <div className="flex-1 h-px bg-white/10" />
                          <div
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-['Orbitron'] font-bold transition-all ${bookingStep === 2 ? 'bg-amber-500 text-black' : 'bg-white/10 text-neutral-400'}`}
                          >
                            <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[9px]">
                              2
                            </span>
                            PICK SEATS
                          </div>
                        </div>
                      )}

                      {/* ── STEP 1: Ticket Tiers + Per-Tier Quantity ── */}
                      {bookingStep === 1 && (
                        <>
                          <div className="mt-4 text-left">
                            <label className="text-xs font-bold text-neutral-300 font-['Orbitron'] uppercase tracking-wider block mb-2">
                              Select Ticket Tiers & Quantities
                            </label>
                            {bookingModalEvent.ticketTiers && bookingModalEvent.ticketTiers.length > 0 ? (
                              <div className="space-y-2.5">
                                {bookingModalEvent.ticketTiers.map((tier, idx) => {
                                  const key = tier.id ? String(tier.id) : tier.name || `tier-${idx}`
                                  const qty = tierQuantities[key] || 0
                                  const isSelected = qty > 0
                                  const tierInventory = availabilityForTier(tier, idx)
                                  const tierUnavailable = tierInventory.meta.disabled

                                  const handleDecrease = (e) => {
                                    e.stopPropagation()
                                    setTierQuantities((prev) => ({
                                      ...prev,
                                      [key]: Math.max(0, (prev[key] || 0) - 1),
                                    }))
                                  }

                                  const handleIncrease = (e) => {
                                    e.stopPropagation()
                                    const availability = tierInventory.quantity
                                    if (tierUnavailable || qty >= availability || totalTicketsCount >= 10) return
                                    setTierQuantities((prev) => ({
                                      ...prev,
                                      [key]: (prev[key] || 0) + 1,
                                    }))
                                  }

                                  return (
                                    <div
                                      key={key}
                                      onClick={() => {}}
                                      className={`booking-tier-card p-3 rounded-xl border transition-all ${
                                        tierUnavailable
                                          ? 'booking-tier-card--unavailable border-neutral-700 bg-neutral-950/50'
                                          : isSelected
                                          ? 'border-red-500/80 bg-red-950/30'
                                          : 'border-white/10 bg-black/40 hover:border-white/20'
                                      }`}
                                      style={{ cursor: tierUnavailable ? 'not-allowed' : 'pointer' }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div
                                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                              tierUnavailable
                                                ? 'border-neutral-700 bg-neutral-800'
                                                : isSelected
                                                  ? 'border-red-500 bg-red-500'
                                                  : 'border-neutral-600'
                                            }`}
                                          >
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                          </div>
                                          <div>
                                            <div className="font-bold text-sm text-white font-['Orbitron']">
                                              {tier.name || `Tier ${idx + 1}`}
                                            </div>
                                            <div
                                              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                                                tierInventory.meta.disabled
                                                  ? tierInventory.meta.className === 'is-temporarily-held'
                                                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
                                                    : 'border-neutral-500/40 bg-neutral-700/30 text-neutral-300'
                                                  : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                                              }`}
                                            >
                                              {tierInventory.meta.label}
                                            </div>
                                            {tier.description && (
                                              <div className="text-[10px] text-neutral-400 mt-0.5">
                                                {tier.description}
                                              </div>
                                            )}
                                            <div className="font-bold text-xs text-red-400 font-['Orbitron'] mt-1">
                                              LKR {Number(tier.price || 0).toLocaleString()}{' '}
                                              <span className="text-[9px] text-neutral-500 font-normal">per pass</span>
                                            </div>
                                            {tierInventory.meta.disabled && (
                                              <div className="mt-1 text-[10px] text-neutral-400">
                                                {tierInventory.meta.detail}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Per-Tier Stepper */}
                                        <div
                                          className="flex items-center gap-2 bg-black/70 p-1.5 rounded-xl border border-white/10"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={handleDecrease}
                                            disabled={qty <= 0}
                                            className={`w-7 h-7 rounded-lg font-bold text-base flex items-center justify-center transition-all cursor-pointer ${
                                              qty > 0
                                                ? 'bg-white/10 hover:bg-red-600 text-white'
                                                : 'bg-white/5 text-neutral-600 cursor-not-allowed'
                                            }`}
                                          >
                                            -
                                          </button>
                                          <span className="font-bold text-sm text-white font-['Orbitron'] w-5 text-center">
                                            {qty}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={handleIncrease}
                                            disabled={tierUnavailable || qty >= tierInventory.quantity || totalTicketsCount >= 10}
                                            className={`w-7 h-7 rounded-lg font-bold text-base flex items-center justify-center transition-all cursor-pointer ${
                                              !tierUnavailable && qty < tierInventory.quantity && totalTicketsCount < 10
                                                ? 'bg-white/10 hover:bg-red-600 text-white'
                                                : 'bg-white/5 text-neutral-600 cursor-not-allowed'
                                            }`}
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="booking-tier-card p-3 rounded-xl border border-red-500/80 bg-red-950/30">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-sm text-white font-['Orbitron']">Standard Pass</div>
                                    <div className="text-[10px] text-neutral-400">General admission pass</div>
                                    <div className="font-bold text-xs text-red-400 font-['Orbitron'] mt-1">
                                      LKR {Number(bookingModalEvent.minPrice || 0).toLocaleString()}{' '}
                                      <span className="text-[9px] text-neutral-500 font-normal">per pass</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 bg-black/70 p-1.5 rounded-xl border border-white/10">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTierQuantities((prev) => ({
                                          ...prev,
                                          standard: Math.max(1, (prev.standard || 1) - 1),
                                        }))
                                      }
                                      className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-600 text-white font-bold text-base flex items-center justify-center cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="font-bold text-sm text-white font-['Orbitron'] w-5 text-center">
                                      {tierQuantities['standard'] || 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTierQuantities((prev) => ({
                                          ...prev,
                                          standard: Math.min(10, standardAvailability, (prev.standard || 0) + 1),
                                        }))
                                      }
                                      disabled={(tierQuantities.standard || 0) >= Math.min(10, standardAvailability)}
                                      className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-600 text-white font-bold text-base flex items-center justify-center cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Selection breakdown summary */}
                          {totalTicketsCount > 0 && selectedTiersSummary && (
                            <div className="mt-3 text-left px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-neutral-300 font-['Orbitron'] flex items-center justify-between">
                              <span className="text-neutral-400">Selected Passes:</span>
                              <span className="text-red-400 font-bold">{selectedTiersSummary}</span>
                            </div>
                          )}

                          {/* Total Summary + Action */}
                          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                            <div className="text-left">
                              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-['Orbitron']">
                                Total Payable
                              </span>
                              <div className="text-xl font-black text-white font-['Orbitron']">
                                LKR {totalBookingPrice.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                {totalTicketsCount} pass{totalTicketsCount !== 1 ? 'es' : ''}
                              </div>
                            </div>

                            {hasAssignedSeating ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSeats([])
                                  setBookingStep(2)
                                }}
                                disabled={totalTicketsCount === 0}
                                className={`px-6 py-3 rounded-xl font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                  totalTicketsCount > 0
                                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                CHOOSE SEATS
                                <span>→</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  setConfirmingBooking(true)
                                  setHoldError('')
                                  const confirmationSnapshot = {
                                    tickets: generalTicketSelections
                                      .filter((ticket) => Number(ticket.quantity) > 0)
                                      .map((ticket) => ({
                                        ticketTierId: ticket.ticketTierId,
                                        name: ticket.name,
                                        unitPrice: Number(ticket.unitPrice) || 0,
                                        quantity: Number(ticket.quantity) || 0,
                                      })),
                                    totalQuantity: totalTicketsCount,
                                    totalAmount: totalBookingPrice,
                                  }
                                  try {
                                    const confirmation = await confirmGeneralBooking(
                                      bookingModalEvent.id,
                                      generalTicketSelections,
                                    )
                                    setBookingConfirmation(confirmation)
                                    setConfirmedBookingDetails({
                                      ...confirmationSnapshot,
                                      tickets: confirmation?.tickets?.length ? confirmation.tickets : confirmationSnapshot.tickets,
                                      totalAmount: Number(confirmation?.totalAmount ?? confirmationSnapshot.totalAmount) || 0,
                                      totalQuantity:
                                        confirmation?.tickets?.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0) ||
                                        confirmationSnapshot.totalQuantity,
                                    })
                                    setBookingSuccess(true)
                                    void queueRenderedTicketEmail(confirmation, bookingModalEvent)
                                    await refreshEventInventory(bookingModalEvent.id)
                                  } catch (error) {
                                    setHoldError(error.message)
                                  } finally {
                                    setConfirmingBooking(false)
                                  }
                                }}
                                disabled={totalTicketsCount === 0 || confirmingBooking}
                                className={`px-6 py-3 rounded-xl font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                  totalTicketsCount > 0 && !confirmingBooking
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(255,0,0,0.6)]'
                                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                {confirmingBooking ? 'CONFIRMING...' : 'CONFIRM RESERVATION'}
                                <span>→</span>
                              </button>
                            )}
                          </div>
                          {holdError && !hasAssignedSeating && (
                            <div role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                              {holdError}
                            </div>
                          )}
                        </>
                      )}

                      {/* ── STEP 2: Interactive Seat Selection ── */}
                      {bookingStep === 2 && hasAssignedSeating && (
                        <>
                          <div className="mt-4 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setBookingStep(1)}
                              className="flex items-center gap-1.5 text-[10px] text-neutral-400 hover:text-white font-['Orbitron'] uppercase tracking-wider transition-colors cursor-pointer"
                            >
                              ← BACK
                            </button>
                            <div className="text-[10px] font-['Orbitron'] text-amber-400 font-bold">
                              {assignedTicketCount} seat{assignedTicketCount > 1 ? 's' : ''} needed ({selectedTiersSummary})
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <label className="text-xs font-bold text-neutral-300 font-['Orbitron'] uppercase tracking-wider flex items-center gap-1.5">
                              SELECT YOUR SEATS
                            </label>
                            {selectedSeats.length > 0 && (
                              <span className="text-[10px] text-amber-400 font-mono font-bold animate-pulse">
                                {selectedSeats.length} selected · {selectedSeats.join(', ')}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Available: {availableSeats.length}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedSeats([])}
                              disabled={selectedSeats.length === 0}
                              className="text-amber-400 hover:text-amber-300 disabled:text-neutral-600 disabled:cursor-not-allowed uppercase tracking-wider"
                            >
                              Clear Selection
                            </button>
                          </div>

                          <SeatingChartComponent
                            seatingConfig={bookingSeatingConfig}
                            isOrganizerEdit={false}
                            selectedSeats={selectedSeats}
                            onSelectSeat={(seatId) => {
                              let next
                              if (selectedSeats.includes(seatId)) {
                                next = selectedSeats.filter((s) => s !== seatId)
                              } else if (selectedSeats.length >= assignedTicketCount) {
                                return
                              } else {
                                next = [...selectedSeats, seatId]
                              }
                              setSelectedSeats(next)
                              setTicketQuantity(Math.max(1, next.length))
                            }}
                          />

                          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                            <div className="text-left">
                              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-['Orbitron']">
                                Total Payable
                              </span>
                              <div className="text-xl font-black text-white font-['Orbitron']">
                                LKR{' '}
                                {selectedSeats.length > 0
                                  ? selectedSeatTotal.toLocaleString()
                                  : totalBookingPrice.toLocaleString()}
                              </div>
                              {selectedSeats.length > 0 && (
                                <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                                  {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''} selected
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                setHoldError('')
                                try {
                                  const createdHold = await holdSeats(bookingModalEvent.id, selectedSeats)
                                  setSeatHold(createdHold)
                                  setSelectionPrepared(true)
                                } catch (error) {
                                  setHoldError(error.message)
                                  setSelectedSeats([])
                                  const refreshedPlan = await getAttendeeSeatingPlan(bookingModalEvent.id).catch(() => null)
                                  if (refreshedPlan) setAttendeeSeatingPlan(refreshedPlan)
                                }
                              }}
                              disabled={selectedSeats.length === 0}
                              className={`px-6 py-3 rounded-xl font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all flex items-center gap-2 cursor-pointer ${
                                selectedSeats.length > 0
                                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(255,0,0,0.6)]'
                                  : 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                              }`}
                            >
                              CONTINUE
                              <span>→</span>
                            </button>
                          </div>
                          {holdError && (
                            <div role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                              {holdError}
                            </div>
                          )}
                          {selectionPrepared && seatHold && (
                            <div ref={holdConfirmationRef} className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                              <strong>Seats held for you.</strong> Confirm within{' '}
                              <strong>{Math.floor(holdSecondsRemaining / 60)}:{String(holdSecondsRemaining % 60).padStart(2, '0')}</strong>.
                              <button
                                type="button"
                                disabled={confirmingBooking || holdSecondsRemaining <= 0}
                                className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={async () => {
                                  setConfirmingBooking(true)
                                  setHoldError('')
                                  const confirmationSnapshot = {
                                    tickets: selectedTiers.length
                                      ? selectedTiers.map((tier, index) => {
                                          const key = tier.id ? String(tier.id) : tier.name || `tier-${index}`
                                          return {
                                            ticketTierId: tier.id ? Number(tier.id) : null,
                                            name: tier.name || `Tier ${index + 1}`,
                                            unitPrice: Number(tier.price || 0),
                                            quantity: Number(tierQuantities[key]) || 0,
                                          }
                                        }).filter((ticket) => ticket.quantity > 0)
                                      : [{
                                          ticketTierId: null,
                                          name: 'Reserved Seat',
                                          unitPrice: selectedSeatRecords[0]?.price || bookingModalEvent.minPrice || 0,
                                            quantity: selectedSeats.length,
                                        }],
                                    totalQuantity: selectedSeats.length + mixedGeneralTicketSelections.reduce((sum, ticket) => sum + ticket.quantity, 0),
                                    totalAmount: selectedSeatTotal + mixedGeneralTicketSelections.reduce((sum, ticket) => sum + ticket.unitPrice * ticket.quantity, 0),
                                  }
                                  try {
                                    const confirmation = await confirmSeatHold(bookingModalEvent.id, seatHold.holdId, mixedGeneralTicketSelections)
                                    setBookingConfirmation(confirmation)
                                    setConfirmedBookingDetails({
                                      ...confirmationSnapshot,
                                      tickets: confirmation?.tickets?.length ? confirmation.tickets : confirmationSnapshot.tickets,
                                      totalAmount: Number(confirmation?.totalAmount ?? confirmationSnapshot.totalAmount) || 0,
                                      totalQuantity:
                                        confirmation?.tickets?.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0) ||
                                        confirmationSnapshot.totalQuantity,
                                    })
                                    setBookingSuccess(true)
                                    setSeatHold(null)
                                    void queueRenderedTicketEmail(confirmation, bookingModalEvent)
                                    await refreshEventInventory(bookingModalEvent.id)
                                  } catch (error) {
                                    setHoldError(error.message)
                                  } finally {
                                    setConfirmingBooking(false)
                                  }
                                }}
                              >
                                {confirmingBooking ? 'CONFIRMING...' : 'CONFIRM RESERVATION'}
                              </button>
                              <button
                                type="button"
                                className="block mt-2 text-emerald-300 underline"
                                onClick={async () => {
                                  await releaseSeatHold(bookingModalEvent.id, seatHold.holdId).catch(() => {})
                                  setSeatHold(null)
                                  setSelectionPrepared(false)
                                  setSelectedSeats([])
                                  await refreshEventInventory(bookingModalEvent.id)
                                }}
                              >
                                Release held seats
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-2xl flex items-center justify-center mx-auto mb-3 animate-bounce">
                  <svg aria-label="Booking completed" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <h3 className="text-xl font-black text-white font-['Orbitron'] uppercase">RESERVATION CONFIRMED!</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  Your passes for <strong className="text-white">{bookingModalEvent.title}</strong> have been reserved
                  in the EXVO network.
                </p>
                {bookingConfirmation && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                    Booking reference: <strong>{bookingConfirmation.bookingReference}</strong>
                  </div>
                )}

                {/* Digital Ticket Pass Card */}
                {(() => {
                  const confirmedTickets =
                    bookingConfirmation?.tickets?.length
                      ? bookingConfirmation.tickets
                      : confirmedBookingDetails?.tickets || []
                  const totalTicketsCount =
                    confirmedBookingDetails?.totalQuantity ||
                    confirmedTickets.reduce((sum, ticket) => sum + (Number(ticket.quantity) || 0), 0) ||
                    bookingConfirmation?.seatCodes?.length ||
                    0
                  const totalBookingPrice = Number(
                    bookingConfirmation?.totalAmount ?? confirmedBookingDetails?.totalAmount ?? 0,
                  )
                  const selectedTiersSummary = confirmedTickets
                    .filter((ticket) => Number(ticket.quantity) > 0)
                    .map((ticket) => `${Number(ticket.quantity)}x ${ticket.name || 'Ticket'}`)
                    .join(', ')

                  return (
                    <div className="mt-5 p-4 rounded-xl bg-gradient-to-b from-neutral-900/90 to-black border border-red-500/30 text-left relative overflow-hidden">
                      <div className="cyber-bracket cyber-bracket--tl" />
                      <div className="cyber-bracket cyber-bracket--br" />

                      <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
                        <div>
                          <div className="text-[9px] text-red-500 font-bold font-['Orbitron'] tracking-widest">
                            EXVO DIGITAL PASS
                          </div>
                          <div className="text-sm font-bold text-white font-['Orbitron'] truncate max-w-[200px]">
                            {bookingModalEvent.title}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-['Orbitron']">
                            VALID PASS
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
                        <div>
                          <span className="text-[9px] text-neutral-500 block font-['Orbitron']">TIER(S)</span>
                          <strong className="text-white font-['Orbitron'] text-[11px] block">
                            {selectedTiersSummary || 'Confirmed Pass'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-neutral-500 block font-['Orbitron']">TOTAL PASSES</span>
                          <strong className="text-white font-['Orbitron']">
                            {totalTicketsCount} {totalTicketsCount === 1 ? 'Pass' : 'Passes'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-neutral-500 block font-['Orbitron']">DATE & TIME</span>
                          <strong className="text-white text-[11px]">
                            {formatSelectedDate(bookingModalEvent.eventDate, bookingModalEvent.eventTime) ||
                              bookingModalEvent.year}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-neutral-500 block font-['Orbitron']">VENUE</span>
                          <strong className="text-white text-[11px] truncate block">
                            {bookingModalEvent.venue || 'Colombo'}
                          </strong>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-dashed border-white/20 flex items-center justify-between">
                        <div className="text-[10px] text-neutral-400 font-mono">
                          REF: {bookingConfirmation?.bookingReference || 'EXVO-TICKET'}
                        </div>
                        <div className="text-xs font-black text-red-400 font-['Orbitron']">
                          LKR {totalBookingPrice.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setBookingModalEvent(null)
                      await openTicketManager()
                    }}
                    className="px-6 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    VIEW TICKETS
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingModalEvent(null)}
                    className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold font-['Orbitron'] text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    DONE & CLOSE
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Main Hero View */}
      <main className="relative z-10 flex-grow flex flex-col items-center justify-center px-4 pt-4 pb-8 max-w-7xl mx-auto w-full">
        {/* Central Band Title: SARITH x NEWS */}
        <div className="text-center space-y-4 mb-6 md:mb-10 select-none">
          <h1 className="flex items-center justify-center gap-4 flex-wrap">
            <span className="font-extrabold text-5xl md:text-8xl tracking-tight leading-none text-white scale-y-105">
              UPCOMING
            </span>
            <span className="text-2xl md:text-4xl text-[#FF0000] font-light self-center"></span>
            <span className="font-['Orbitron'] font-black text-5xl md:text-8xl tracking-[0.1em] leading-none text-white">
              EVENTS
            </span>
          </h1>

          <p className="text-[10px] md:text-xs tracking-[0.25em] text-neutral-400 font-medium uppercase max-w-2xl mx-auto leading-loose">
            EXPLORE WHAT'S HAPPENING ISLANDWIDE{' '}
          </p>

          <div className="explore-events-btn-wrapper">
            <button
              type="button"
              onClick={() => scrollToSection('events')}
              className="explore-events-hero-btn"
              title="Explore all upcoming events"
            >
              <span>EXPLORE EVENTS</span>
            </button>
          </div>
        </div>

        {/* 3D Cover Flow Carousel */}
        {eventsLoading ? (
          <EventSkeleton />
        ) : eventsError ? (
          <EventLoadError onRetry={fetchLiveEvents} />
        ) : carouselEvents.length > 0 ? (
          <div
            className="w-full relative py-6 flex items-center justify-center perspective-container overflow-hidden"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="carousel-track">
              {carouselEvents.map((album, index) => {
                const cardClass = getCardClass(index)
                const isCenter = index === centerIndex
                return (
                  <div
                    key={album.id || index}
                    onClick={() => {
                      if (isCenter) {
                        handleOpenEventDetails(album)
                      } else {
                        setCenterIndex(index)
                        resetAutoplay()
                      }
                    }}
                    className={`carousel-card ${cardClass} group cursor-pointer`}
                    title={isCenter ? `Click to view details: ${album.title}` : album.title}
                  >
                    <EventPoster
                      src={album.cover}
                      title={album.title}
                      className="w-full h-full object-cover select-none"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80" />

                    {/* Center Card Title and Tag Overlay */}
                    {isCenter && (
                      <div className="absolute bottom-3 left-3 right-3 text-center pointer-events-none">
                        <span className="text-[9px] font-bold text-red-500 font-['Orbitron'] tracking-widest uppercase px-2 py-0.5 rounded bg-black/80 border border-red-500/40 inline-block mb-1 backdrop-blur-sm">
                          {album.category || 'FEATURED'}
                        </span>
                        <h3 className="text-sm md:text-base font-black text-white font-['Orbitron'] truncate drop-shadow-md">
                          {album.title}
                        </h3>
                        <p className="text-[10px] text-neutral-300 truncate">
                          {album.artistOrOrganizer || album.subtitle}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Previous/Next Navigation Arrows (only if more than 1 event) */}
            {carouselEvents.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-4 md:left-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300 cursor-pointer"
                  aria-label="Previous Album"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-4 md:right-12 z-30 p-4 rounded-full bg-black/40 border border-white/10 hover:bg-white hover:text-black transition-all duration-300 cursor-pointer"
                  aria-label="Next Album"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-10 px-4 my-6 rounded-2xl bg-black/40 border border-white/10 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-[9px] font-bold tracking-wider flex items-center justify-center mx-auto mb-3">
              EVENTS
            </div>
            <h3 className="text-sm font-bold font-['Orbitron'] text-white uppercase tracking-wider mb-1">
              No Events Yet
            </h3>
            <p className="text-[11px] text-neutral-400">
              Organizers can add live events using the "Add Event" button above.
            </p>
          </div>
        )}

        {/* Event Category Explore Section */}
        <div id="events" className="w-full mt-10 md:mt-14 px-2 scroll-mt-24">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <p className="text-[10px] tracking-[0.3em] text-[#FF0000] uppercase font-bold mb-1">Browse</p>
              <h2 className="text-xl md:text-2xl font-black tracking-wider uppercase text-white font-['Orbitron']">
                Explore by Category
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Expanding Animated Search Bar */}
              <div
                ref={categorySearchContainerRef}
                className={`category-search-bar-wrap ${isCategorySearchOpen ? 'is-open' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsCategorySearchOpen((prev) => {
                      const next = !prev
                      if (next) {
                        setTimeout(() => categorySearchInputRef.current?.focus(), 150)
                      } else {
                        setCategorySearchQuery('')
                      }
                      return next
                    })
                  }}
                  className="category-search-btn"
                  title="Search Events"
                  aria-label="Search Events"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8" />
                    <path strokeLinecap="round" d="m21 21-4.3-4.3" />
                  </svg>
                </button>

                <div className="category-search-input-shell">
                  <input
                    ref={categorySearchInputRef}
                    type="text"
                    value={categorySearchQuery}
                    onChange={(e) => {
                      setCategorySearchQuery(e.target.value)
                      const el = document.getElementById('all-events-grid')
                      if (el && e.target.value.trim().length === 1) {
                        el.scrollIntoView({ behavior: 'smooth' })
                      }
                    }}
                    placeholder="Search events, artists..."
                    className="category-search-input"
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCategorySearchQuery('')}
                      className="category-search-clear-btn"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveCategory('all')
                  setCategorySearchQuery('')
                  const el = document.getElementById('all-events-grid')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 hover:text-white border border-neutral-700 hover:border-white px-4 py-2 rounded-full transition-all duration-300 font-semibold cursor-pointer active:scale-95 hover:bg-white/5 whitespace-nowrap"
              >
                View All ({albumList.length})
              </button>
            </div>
          </div>

          <div className="category-scroll-wrapper">
            {/* Left Arrow */}
            <button
              onClick={scrollCatLeft}
              className="cat-nav-btn cat-nav-btn--left"
              aria-label="Scroll categories left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Scrollable strip */}
            <div ref={catScrollRef} className="category-grid">
              {eventCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)
                    const el = document.getElementById('all-events-grid')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className={`category-card ${activeCategory === cat.id ? 'category-card--active' : ''}`}
                  style={{ '--cat-glow': cat.glow }}
                  aria-label={`Explore ${cat.label} events`}
                >
                  {/* Photo or Cyber Gradient Icon background */}
                  {cat.image ? (
                    <img src={cat.image} alt={cat.label} className="category-card__photo" draggable="false" />
                  ) : (
                    <div className="category-card__photo flex items-center justify-center bg-gradient-to-b from-[#1c0808] via-[#100505] to-[#080202]">
                      <span className="text-sm font-black tracking-widest filter drop-shadow-[0_0_8px_rgba(255,0,0,0.5)] opacity-60">
                        {cat.label.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Dark gradient overlay */}
                  <div className="category-card__overlay" />
                  <span className="category-card__label">{cat.label}</span>
                  <span className="category-card__count">{cat.count}</span>
                  <div className="category-card__shine" />
                </button>
              ))}
            </div>

            {/* Right Arrow */}
            <button
              onClick={scrollCatRight}
              className="cat-nav-btn cat-nav-btn--right"
              aria-label="Scroll categories right"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ══════════════ ALL EVENTS LIVE GRID SECTION ══════════════ */}
        <section id="all-events-grid" className="w-full mt-14 md:mt-20 px-2 scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-4 border-b border-white/10 gap-4">
            <div>
              {/*<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-2">*/}
                {/*<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />*/}
                {/*LIVE EVENTS*/}
              {/*</div>*/}
              <h2 className="text-2xl md:text-4xl font-black tracking-wider uppercase text-white font-['Orbitron']">
                {activeCategory && activeCategory !== 'all' ? (
                  <>
                    EXPLORE <span className="text-[#FF0000]">{activeCategory}</span> EVENTS
                  </>
                ) : (
                  <>
                    ALL UPCOMING <span className="text-[#FF0000]">EXPERIENCES</span>
                  </>
                )}
              </h2>
              <p className="text-neutral-400 text-xs mt-1">
                Showing {showAllEventsInGrid ? filteredEvents.length : Math.min(12, filteredEvents.length)} of{' '}
                {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
                {categorySearchQuery && (
                  <span className="text-red-400 font-semibold ml-1.5">• Filtered by "{categorySearchQuery}"</span>
                )}{' '}
              </p>
            </div>

            {/* Category Filter Pills & Reset */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setActiveCategory('all')
                  setShowAllEventsInGrid(false)
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-['Orbitron'] font-bold transition-all cursor-pointer ${
                  !activeCategory || activeCategory === 'all'
                    ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(255,0,0,0.6)]'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                ALL ({albumList.length})
              </button>
              {['Concert', 'Festival', 'Live Session', 'DJ Night', 'Acoustic', 'Stand-Up'].map((catName) => {
                const count = albumList.filter((e) =>
                  (e.category || '').toLowerCase().includes(catName.toLowerCase()),
                ).length
                return (
                  <button
                    key={catName}
                    onClick={() => {
                      setActiveCategory(activeCategory === catName ? 'all' : catName)
                      setShowAllEventsInGrid(false)
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-['Orbitron'] font-bold transition-all cursor-pointer ${
                      activeCategory === catName
                        ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(255,0,0,0.6)]'
                        : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {catName.toUpperCase()} {count > 0 && `(${count})`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Events Grid */}
          {eventsLoading ? (
            <EventSkeleton />
          ) : eventsError ? (
            <EventLoadError onRetry={fetchLiveEvents} />
          ) : filteredEvents.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {(showAllEventsInGrid ? filteredEvents : filteredEvents.slice(0, 12)).map((event, idx) => {
                  const eventPrice = Number(event.minPrice || 0)
                  const dateDisplay = event.eventDate || event.year || '2026'
                  const inventoryMeta = getEventInventoryMeta(event)
                  return (
                    <div
                      key={event.id || idx}
                      onClick={() => handleOpenEventDetails(event)}
                      className="event-cyber-card group cursor-pointer"
                    >
                      <div className="event-cyber-card__poster-box">
                        <EventPoster
                          src={event.cover}
                          title={event.title}
                          className="event-cyber-card__poster"
                          loading="lazy"
                        />
                        <div className="event-cyber-card__poster-overlay" />

                        {/* Top Badges */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
                          <span className="event-category-pill">{event.category || 'CONCERT'}</span>
                          <span className={`event-live-status-pill ${inventoryMeta.className}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
                            {inventoryMeta.label}
                          </span>
                        </div>

                        {/* Corner Accents */}
                        <div className="cyber-bracket cyber-bracket--tl" />
                        <div className="cyber-bracket cyber-bracket--br" />
                      </div>

                      <div className="event-cyber-card__content">
                        <div className="text-[10px] text-red-500 font-['Orbitron'] font-bold tracking-widest uppercase mb-1">
                          {event.artistOrOrganizer || event.subtitle}
                        </div>
                        <h3 className="text-lg font-bold text-white font-['Orbitron'] group-hover:text-red-400 transition-colors line-clamp-1">
                          {event.title}
                        </h3>

                        <div className="mt-3 space-y-1.5 text-xs text-neutral-300 font-sans">
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-3.5 h-3.5 text-red-500 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span>{formatSelectedDate(event.eventDate, event.eventTime) || dateDisplay}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-3.5 h-3.5 text-red-500 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            <span className="truncate">{event.venue || 'Colombo, Sri Lanka'}</span>
                          </div>
                        </div>

                        <div className="event-cyber-card__footer">
                          <div>
                            <div className="text-[9px] text-neutral-500 uppercase tracking-widest font-['Orbitron']">
                              Passes From
                            </div>
                            <div className="text-sm md:text-base font-black text-white font-['Orbitron']">
                              {eventPrice > 0 ? `LKR ${eventPrice.toLocaleString()}` : 'FREE PASS'}
                            </div>
                          </div>

                          <button onClick={() => handleOpenEventDetails(event)} className="event-book-btn">
                            <span>VIEW</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* View All Events Button (only if more than 12 events exist) */}
              {filteredEvents.length > 12 && (
                <div className="flex flex-col items-center justify-center mt-10 md:mt-14">
                  <button
                    type="button"
                    onClick={() => setShowAllEventsInGrid((prev) => !prev)}
                    className="group relative inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-red-700 via-red-600 to-red-800 hover:from-red-600 hover:to-red-700 text-white font-['Orbitron'] font-extrabold text-xs tracking-widest uppercase transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_rgba(255,0,0,0.6)] cursor-pointer border border-red-500/40 overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {showAllEventsInGrid ? (
                        <>
                          <span>SHOW LESS</span>
                          <svg
                            className="w-4 h-4 transition-transform duration-300 group-hover:-translate-y-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <span>VIEW ALL ({filteredEvents.length}) EVENTS</span>
                          <svg
                            className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </span>
                    <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  </button>
                  <p className="text-[11px] text-neutral-400 font-sans mt-2.5">
                    {showAllEventsInGrid
                      ? `Showing all ${filteredEvents.length} events`
                      : `Showing 12 of ${filteredEvents.length} events`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 px-4 rounded-2xl bg-black/40 border border-white/10 my-6">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-[9px] font-bold tracking-wider flex items-center justify-center mx-auto mb-4">
                SEARCH
              </div>
              <h3 className="text-xl font-bold font-['Orbitron'] text-white uppercase mb-2">No Events Found</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto mb-6">
                There are currently no events published under the "{activeCategory}" category.
              </p>
              <button
                onClick={() => setActiveCategory('all')}
                className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(255,0,0,0.5)] cursor-pointer"
              >
                View All Events
              </button>
            </div>
          )}
        </section>
      </main>

      {/* ══════════════ ABOUT US SECTION ══════════════ */}
      <section id="about-us" className="w-full py-16 md:py-24 px-4 border-t border-white/5 relative z-10 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center space-y-3 mb-12">
            {/*<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase">*/}
              {/*<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />*/}
              {/*ABOUT EXVO*/}
            {/*</div>*/}
            <h2 className="text-3xl md:text-5xl font-black font-['Orbitron'] tracking-wider text-white uppercase">
              REDEFINING LIVE <span className="text-[#FF0000]">EXPERIENCES</span>
            </h2>
            <p className="text-neutral-400 text-xs md:text-sm max-w-2xl mx-auto leading-relaxed tracking-wide">
              EXVO is Sri Lanka's next-generation digital event platform. We connect music lovers, festival seekers, and
              artists with seamless booking and powerful organizer tools.
            </p>
          </div>

          {/* Vision & Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Feature 1 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4m-4 0H9m4 0V5"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                ORGANIZER HUB
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Comprehensive event management suite empowering companies and individual creators to list events,
                monitor real-time ticket sales, and manage check-ins effortlessly.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 012 2 2 2 0 01-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 012-2V7a2 2 0 00-2-2H5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                SMART TICKETING
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Instant digital ticket issuance with secure QR codes. Fast, hassle-free checkout experience with
                complete protection against ticket duplication and fraud.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="about-glass-card">
              <div className="about-card-icon">
                <svg className="w-6 h-6 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold font-['Orbitron'] text-white tracking-wide uppercase mb-2">
                CURATED CONCERTS
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Discover Sri Lanka's finest live performances, acoustic shows, mega music festivals, and high-octane DJ
                nights curated specially for passionate fans.
              </p>
            </div>
          </div>

          {/* Live Stats Bar */}
          <div className="stats-glass-grid">
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">50K+</span>
              <span className="stat-label">TICKETS BOOKED</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">1,200+</span>
              <span className="stat-label">LIVE EVENTS</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">100%</span>
              <span className="stat-label">SECURE QR ENTRY</span>
            </div>
            <div className="stat-item">
              <span className="stat-value font-['Orbitron']">24/7</span>
              <span className="stat-label">SUPPORT TEAM</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ CONTACT US SECTION ══════════════ */}
      <section
        id="contact-us"
        className="w-full py-16 md:py-24 px-4 border-t border-white/5 relative z-10 scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center space-y-3 mb-12">
            {/*<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase">*/}
              {/*<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />*/}
              {/*GET IN TOUCH*/}
            {/*</div>*/}
            <h2 className="text-3xl md:text-5xl font-black font-['Orbitron'] tracking-wider text-white uppercase">
              CONTACT <span className="text-[#FF0000]">US</span>
            </h2>
            <p className="text-neutral-400 text-xs md:text-sm max-w-xl mx-auto leading-relaxed tracking-wide">
              Have questions about tickets, company registration, or organizing an event? Drop us a message below.
            </p>
          </div>

          {/* Form & Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Contact Form Column (7 cols) */}
            <div className="lg:col-span-7 contact-form-card">
              {contactSubmitted ? (
                <div className="contact-success-box animate-fade-in">
                  <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500 flex items-center justify-center text-red-500 mb-3 mx-auto">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-bold font-['Orbitron'] text-white uppercase">MESSAGE TRANSMITTED</h4>
                  <p className="text-xs text-neutral-400 mt-1">
                    Thank you for reaching out! Our team will respond to your inquiry shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                        YOUR NAME
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        className="contact-input"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                        EMAIL ADDRESS
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="contact-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                      INQUIRY TYPE
                    </label>
                    <select
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="contact-input contact-select"
                    >
                      <option value="General Query">General Query</option>
                      <option value="Event Organizer Inquiry">Event Organizer / Company Inquiry</option>
                      <option value="Ticket Booking Support">Ticket Booking Support</option>
                      <option value="Partnership & Media">Partnership & Media</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                      YOUR MESSAGE
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="How can we assist you?"
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="contact-input resize-none"
                    />
                  </div>

                  <button type="submit" disabled={contactLoading} className="contact-submit-btn">
                    {contactLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        TRANSMITTING...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        SEND MESSAGE
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Info Cards Column (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">
                    EMAIL SUPPORT
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1">xchangesrilanka@gmail.com</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">
                    HEADQUARTERS
                  </h4>

                  <p className="text-xs text-neutral-400 mt-1">Malabe, Sri Lanka</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">
                    DIRECT HOTLINE
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1">+94 70 167 5173</p>
                  <p className="text-xs text-neutral-400">+94 76 641 4622</p>
                </div>
              </div>

              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <svg className="w-5 h-5 text-[#FF0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-['Orbitron'] text-white uppercase tracking-wider">
                    OPERATING HOURS
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1">Monday – Sunday: 8:00 AM – 10:00 PM</p>
                  <p className="text-xs text-red-500 font-semibold mt-0.5">Instant Digital Support 24/7</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="footer-root">
        {/* Spark canvas background */}
        <SparkCanvas />

        {/* ── Ticker marquee strip ── */}
        <div className="footer-ticker">
          <div className="footer-ticker__track">
            {[...Array(6)].map((_, i) => (
              <span key={i} className="footer-ticker__item">
                CONCERTS &nbsp;/&nbsp; FESTIVALS &nbsp;/&nbsp; LIVE SESSIONS &nbsp;/&nbsp; DJ NIGHTS &nbsp;/&nbsp;
                ACOUSTIC SHOWS &nbsp;/&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* ── Main footer body ── */}
        <div className="footer-body">
          {/* Brand column */}
          <div className="footer-brand">
            <div className="footer-logo-row">
              <ExvoLogo />
              <span className="footer-wordmark">
                <span className="text-[#FF0000]">EX</span>VO
              </span>
            </div>
            <p className="footer-tagline">
              Sri Lanka's premier live event discovery platform.
              <br />
              Find your next unforgettable experience.
            </p>

            {/* Social icons */}
            <div className="footer-socials">
              {/* Instagram */}
              <a href="#" aria-label="Instagram" className="footer-social-btn">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                </svg>
              </a>
              {/* Facebook */}
              <a href="#" aria-label="Facebook" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
              {/* YouTube */}
              <a href="#" aria-label="YouTube" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                </svg>
              </a>
              {/* TikTok */}
              <a href="#" aria-label="TikTok" className="footer-social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav columns */}
          <div className="footer-links-grid">
            <div className="footer-col">
              <h3 className="footer-col__heading">Navigate</h3>
              <ul className="footer-col__list">
                <li>
                  <button
                    onClick={() => scrollToSection('home')}
                    className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left"
                  >
                    Home
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('events')}
                    className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left"
                  >
                    Upcoming Events
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('about-us')}
                    className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left"
                  >
                    About Us
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('contact-us')}
                    className="footer-link cursor-pointer border-0 bg-transparent p-0 text-left"
                  >
                    Contact Us
                  </button>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h3 className="footer-col__heading">Connect</h3>
              <ul className="footer-col__list">
                {['List Your Event', 'Become a Partner', 'Press & Media', 'Careers'].map((l) => (
                  <li key={l}>
                    <a href="#" className="footer-link">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-col">
              <h3 className="footer-col__heading">Legal</h3>
              <ul className="footer-col__list">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Refund Policy'].map((l) => (
                  <li key={l}>
                    <a href="#" className="footer-link">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="footer-badge">
                <span className="footer-badge__dot" />
                Events live now
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="footer-bottom">
          <span className="footer-bottom__copy">© {new Date().getFullYear()} EXVO. All rights reserved.</span>
          <span className="footer-bottom__divider" />
          <span className="footer-bottom__credit">
            Crafted by&nbsp;<strong>Digexa</strong>
          </span>
        </div>
      </footer>

      {/* ══════════════ RIGHT-SIDE ORGANIZER DASHBOARD DRAWER ══════════════ */}
      {isOrganizer && organizerDashboardOpen && (
        <div className="organizer-drawer-backdrop" role="presentation" onClick={() => setOrganizerDashboardOpen(false)}>
          <aside
            className="organizer-drawer-right"
            role="dialog"
            aria-modal="true"
            aria-label="Organizer Dashboard"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Sci-Fi Brackets */}
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            {/* Drawer Header */}
            <div className="organizer-drawer-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 font-bold text-[8px] tracking-wider">
                  EVENTS
                </div>
                <div>
                  <h2 className="text-base font-black font-['Orbitron'] text-white tracking-wider uppercase">
                    ORGANIZER DASHBOARD
                  </h2>
                  <p className="text-[11px] text-neutral-400 font-sans">View, Edit & Delete Your Events</p>
                </div>
              </div>
              <button
                type="button"
                className="organizer-drawer-close"
                onClick={() => setOrganizerDashboardOpen(false)}
                aria-label="Close Dashboard"
              >
                ×
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-2.5 my-4">
              <div className="dash-stat-card">
                <span className="dash-stat-label">TOTAL EVENTS</span>
                <span className="dash-stat-val text-white">
                  {loadingMyEvents || myEventsError ? '—' : myOrganizerEvents.length}
                </span>
              </div>
              <div className="dash-stat-card">
                <span className="dash-stat-label">TOTAL PASSES</span>
                <span className="dash-stat-val text-red-400">
                  {loadingMyEvents || myEventsError
                    ? '—'
                    : myOrganizerEvents.reduce((acc, e) => acc + (e.totalCapacity || 500), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Controls Bar: Search & Add Event Button */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={dashboardSearch}
                  onChange={(e) => setDashboardSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrganizerDashboardOpen(false)
                  setShowAddEventModal(true)
                }}
                className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-[0_0_12px_rgba(255,0,0,0.4)]"
              >
                <span>+</span>
                <span>ADD</span>
              </button>
            </div>

            {/* Events List */}
            <div className="organizer-events-scroll space-y-3 pr-1">
              {loadingMyEvents ? (
                <EventSkeleton compact />
              ) : myEventsError ? (
                <EventLoadError onRetry={fetchMyEvents} />
              ) : myOrganizerEvents.filter(
                  (e) =>
                    !dashboardSearch ||
                    e.title?.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                    e.venue?.toLowerCase().includes(dashboardSearch.toLowerCase()),
                ).length > 0 ? (
                myOrganizerEvents
                  .filter(
                    (e) =>
                      !dashboardSearch ||
                      e.title?.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
                      e.venue?.toLowerCase().includes(dashboardSearch.toLowerCase()),
                  )
                  .map((evt) => {
                    const isEvtHidden = Boolean(evt.isHidden || getHiddenEventIds().includes(String(evt.id)))
                    return (
                      <div key={evt.id} className="dash-event-card group">
                        <div className="flex items-start gap-3">
                          <EventPoster
                            src={evt.cover}
                            title={evt.title}
                            className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="px-2 py-0.5 rounded bg-red-950/70 border border-red-500/40 text-[9px] font-bold font-['Orbitron'] text-red-400 uppercase truncate">
                                  {evt.category || 'Concert'}
                                </span>
                                {isEvtHidden && (
                                  <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-[8.5px] font-bold font-['Orbitron'] text-amber-300 uppercase shrink-0">
                                    HIDDEN
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0">
                                From LKR {Number(evt.minPrice || 0).toLocaleString()}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white font-['Orbitron'] truncate group-hover:text-red-400 transition-colors">
                              {evt.title}
                            </h4>
                            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                              {evt.venue || 'Colombo'} • {evt.eventDate || '2026'}
                            </p>

                            {/* Action Buttons: EDIT, HIDE/UNHIDE, & DELETE */}
                            <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/5">
                              <button
                                type="button"
                                onClick={() => handleStartEditEvent(evt)}
                                className="dash-action-btn dash-action-btn--edit"
                                title="Edit Event Details"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                                  />
                                </svg>
                                <span>EDIT</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleHideEvent(evt)}
                                className={`dash-action-btn ${
                                  isEvtHidden
                                    ? '!bg-emerald-950/60 !border-emerald-500/50 !text-emerald-300 hover:!bg-emerald-900/60'
                                    : '!bg-amber-950/50 !border-amber-500/50 !text-amber-300 hover:!bg-amber-900/60'
                                }`}
                                title={isEvtHidden ? 'Make Event Publicly Visible' : 'Hide Event from Attendees'}
                              >
                                {isEvtHidden ? (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.122-.063c4.478 0 8.268 2.943 9.542 7a9.97 9.97 0 01-4.043 5.122M3 3l18 18"
                                    />
                                  </svg>
                                )}
                                <span>{isEvtHidden ? 'UNHIDE' : 'HIDE'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(evt.id, evt.title)}
                                className="dash-action-btn dash-action-btn--delete"
                                title="Delete Event"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                <span>DELETE</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
              ) : (
                <div className="text-center py-12 text-neutral-500 text-xs font-['Orbitron'] px-4">
                  {myOrganizerEvents.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-neutral-400 font-bold">No events created by you yet.</p>
                      <p className="text-[11px] text-neutral-500 font-sans">
                        Click the <span className="text-red-400 font-bold">+ ADD</span> button above to list your first
                        event!
                      </p>
                    </div>
                  ) : (
                    'No events matching search criteria.'
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ══════════════ EDIT EVENT MODAL ══════════════ */}
      {showEditEventModal && (
        <div className="add-event-backdrop" role="presentation" onClick={() => setShowEditEventModal(false)}>
          <div className="add-event-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="add-event-modal__close" onClick={() => setShowEditEventModal(false)}>
              ×
            </button>

            <div className="add-event-header">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                EDIT EVENT
              </div>
              <h2 className="text-2xl font-black font-['Orbitron'] text-white uppercase tracking-wider">
                EDIT <span className="text-[#FF0000]">EVENT</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Update event title, category, date, venue, ticket pricing, or poster image.
              </p>
            </div>

            <form onSubmit={handleUpdateEventSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                    EVENT TITLE *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mega Music Fest 2026"
                    value={editEventForm.title}
                    onChange={(e) => setEditEventForm({ ...editEventForm, title: e.target.value })}
                    className="add-event-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                    ARTIST OR ORGANIZER
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Exvo Entertainment"
                    value={editEventForm.artistOrOrganizer}
                    onChange={(e) => setEditEventForm({ ...editEventForm, artistOrOrganizer: e.target.value })}
                    className="add-event-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">CATEGORY *</label>
                  <select
                    value={editEventForm.categoryId || editEventForm.category}
                    onChange={(e) => {
                      const selectedVal = e.target.value
                      const found = dbCategories.find(
                        (c) => String(c.id) === String(selectedVal) || c.name === selectedVal,
                      )
                      if (found) {
                        setEditEventForm({ ...editEventForm, categoryId: found.id, category: found.name })
                      } else {
                        setEditEventForm({ ...editEventForm, category: selectedVal })
                      }
                    }}
                    className="add-event-input"
                  >
                    {dbCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                    EVENT DATE *
                  </label>
                  <input
                    type="date"
                    required
                    min={localDate(scheduleNow)}
                    aria-label="Event date"
                    value={editEventForm.date}
                    onChange={(e) => {
                      const next = { ...editEventForm, date: e.target.value }
                      setEditEventForm(next)
                      const text = validateEventSchedule(next.date, next.time)
                      setEditEventFeedback({ type: text ? 'error' : '', text })
                    }}
                    className="add-event-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">TIME</label>
                  <input
                    type="time"
                    required
                    aria-label="Event time"
                    min={minimumEventTime(editEventForm.date, scheduleNow)}
                    value={editEventForm.time}
                    onChange={(e) => {
                      const next = { ...editEventForm, time: e.target.value }
                      setEditEventForm(next)
                      const text = validateEventSchedule(next.date, next.time)
                      setEditEventFeedback({ type: text ? 'error' : '', text })
                    }}
                    className="add-event-input"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                  VENUE / LOCATION *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lotus Tower Arena, Colombo"
                  value={editEventForm.venue}
                  onChange={(e) => setEditEventForm({ ...editEventForm, venue: e.target.value })}
                  className="add-event-input"
                />
              </div>

              {/* Cover Image Upload */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">COVER IMAGE</label>
                <div className="flex items-center gap-3">
                  {editEventForm.coverImage && (
                    <img
                      src={editEventForm.coverImage}
                      alt="Cover Preview"
                      className="w-12 h-12 rounded object-cover border border-white/20"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditEventCoverUpload}
                    className="text-xs text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-['Orbitron'] file:bg-red-600/20 file:text-red-400 hover:file:bg-red-600/40 cursor-pointer"
                  />
                </div>
              </div>

              {/* Ticket Tiers */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">
                    TICKET CATEGORIES & PRICING *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTicketTierInEdit}
                    className="text-[10px] font-['Orbitron'] text-red-400 hover:text-red-300 font-bold uppercase cursor-pointer"
                  >
                    + ADD TIER
                  </button>
                </div>
                {editEventForm.ticketTiers.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Category Name (e.g. VIP)"
                      value={tier.name}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'name', e.target.value)}
                      className="col-span-5 add-event-input text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Price (LKR)"
                      value={tier.price}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'price', e.target.value)}
                      className="col-span-4 add-event-input text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={tier.quantity}
                      onChange={(e) => handleUpdateTicketTierInEdit(tier.id, 'quantity', e.target.value)}
                      className="col-span-2 add-event-input text-xs"
                    />
                    {editEventForm.ticketTiers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTicketTierInEdit(tier.id)}
                        className="col-span-1 text-neutral-500 hover:text-red-400 text-sm text-center"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Visual Reserved Seating Layout Builder (Edit Mode) ── */}
              <div className="add-event-section-box mt-3">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-neutral-300 tracking-wider uppercase font-['Orbitron'] flex items-center gap-1.5">
                      RESERVED SEATING LAYOUT & PLAN
                    </label>
                    <p className="text-[10px] text-neutral-400">
                      Configure interactive seat arrangement, zones & blocked seats
                    </p>
                  </div>

                  {/* Toggle Enable/Disable */}
                  <button
                    type="button"
                    onClick={() => {
                      const curr = editEventForm.seatingConfig || createDefaultSeatingConfig()
                      setEditEventForm((prev) => ({
                        ...prev,
                        seatingConfig: { ...curr, enabled: !curr.enabled },
                      }))
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-['Orbitron'] font-bold transition-all cursor-pointer flex items-center gap-2 ${
                      editEventForm.seatingConfig?.enabled
                        ? 'bg-emerald-600/30 border border-emerald-500/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                        : 'bg-white/5 border border-white/10 text-neutral-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${editEventForm.seatingConfig?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`}
                    />
                    {editEventForm.seatingConfig?.enabled
                      ? '● DISPLAY SEATING TO ATTENDEES (ENABLED)'
                      : '○ HIDE SEATING FROM ATTENDEES (DISABLED)'}
                  </button>
                </div>

                <div
                  className={`p-2.5 rounded-xl text-[10px] flex items-center justify-between border mb-3 ${
                    editEventForm.seatingConfig?.enabled
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : 'bg-neutral-900/50 border-neutral-800 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>
                      {editEventForm.seatingConfig?.enabled
                        ? 'Seating plan will be displayed to attendees during checkout, allowing them to choose specific seats.'
                        : 'Seating chart is hidden from attendees. Attendees will purchase standard ticket categories.'}
                    </span>
                  </div>
                </div>

                {editEventForm.seatingConfig?.enabled && (
                  <div className="space-y-4 pt-2 border-t border-white/10 text-left">
                    {/* Configuration Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-neutral-400 uppercase">STAGE / SCREEN LABEL</label>
                        <input
                          type="text"
                          value={editEventForm.seatingConfig.stageLabel || 'SCREEN'}
                          onChange={(e) => {
                            const val = e.target.value
                            setEditEventForm((prev) => ({
                              ...prev,
                              seatingConfig: { ...prev.seatingConfig, stageLabel: val },
                            }))
                          }}
                          placeholder="e.g. SCREEN or MAIN STAGE"
                          className="contact-input !py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-neutral-400 uppercase">LAYOUT PRESETS</label>
                        <select
                          onChange={(e) => {
                            const preset = e.target.value
                            let newZones = editEventForm.seatingConfig.zones
                            if (preset === 'standard') {
                              newZones = createDefaultSeatingConfig().zones
                            } else if (preset === 'vip_general') {
                              newZones = [
                                {
                                  id: 'z1',
                                  name: 'VIP FRONT ROW',
                                  price: 5000,
                                  rows: ['A', 'B'],
                                  seatsPerRow: 10,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z2',
                                  name: 'GENERAL ARENA',
                                  price: 2500,
                                  rows: ['C', 'D', 'E', 'F'],
                                  seatsPerRow: 12,
                                  occupiedSeats: [],
                                },
                              ]
                            } else if (preset === 'theater') {
                              newZones = [
                                {
                                  id: 'z1',
                                  name: 'ORCHESTRA',
                                  price: 4000,
                                  rows: ['A', 'B', 'C', 'D'],
                                  seatsPerRow: 14,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z2',
                                  name: 'MEZZANINE',
                                  price: 2500,
                                  rows: ['E', 'F', 'G'],
                                  seatsPerRow: 14,
                                  occupiedSeats: [],
                                },
                                {
                                  id: 'z3',
                                  name: 'BALCONY',
                                  price: 1500,
                                  rows: ['H', 'I', 'J'],
                                  seatsPerRow: 12,
                                  occupiedSeats: [],
                                },
                              ]
                            }
                            setEditEventForm((prev) => ({
                              ...prev,
                              seatingConfig: { ...prev.seatingConfig, zones: newZones },
                            }))
                          }}
                          className="contact-input !py-1.5 text-xs"
                        >
                          <option value="standard">Standard Cinema (Classic / Premium / Superior)</option>
                          <option value="vip_general">Concert Arena (VIP Front Row / General Arena)</option>
                          <option value="theater">Theater Hall (Orchestra / Mezzanine / Balcony)</option>
                        </select>
                      </div>
                    </div>

                    {/* Zone Editor List */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[9px] font-bold text-neutral-400 uppercase flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>SEATING ZONES & PRICE TIERS</span>
                          <button
                            type="button"
                            onClick={() => {
                              const synced = syncSeatingZonesWithTicketTiers(
                                editEventForm.ticketTiers,
                                editEventForm.seatingConfig?.zones || [],
                              )
                              setEditEventForm((prev) => ({
                                ...prev,
                                seatingConfig: { ...prev.seatingConfig, zones: synced },
                              }))
                            }}
                            className="px-2 py-0.5 rounded bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 hover:text-white transition-all text-[9.5px] cursor-pointer flex items-center gap-1 font-bold tracking-wider uppercase font-['Orbitron']"
                            title="Click to sync zone names and prices with Ticket Categories above"
                          >
                            SYNC WITH TICKET CATEGORIES
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextId = `zone-${Date.now()}`
                            const nextLetter = String.fromCharCode(65 + editEventForm.seatingConfig.zones.length * 3)
                            const newZone = {
                              id: nextId,
                              name: 'NEW ZONE',
                              price: 2000,
                              rows: [nextLetter],
                              seatsPerRow: 10,
                              occupiedSeats: [],
                            }
                            setEditEventForm((prev) => ({
                              ...prev,
                              seatingConfig: {
                                ...prev.seatingConfig,
                                zones: [...prev.seatingConfig.zones, newZone],
                              },
                            }))
                          }}
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          + Add Zone
                        </button>
                      </div>

                      {editEventForm.seatingConfig.zones.map((zone, zIdx) => (
                        <div
                          key={zone.id || zIdx}
                          className="bg-black/30 p-2.5 rounded-xl border border-white/10 text-left space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">ZONE NAME</span>
                              <input
                                type="text"
                                value={zone.name}
                                onChange={(e) => {
                                  const name = e.target.value
                                  setEditEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, name } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs font-bold"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">PRICE (LKR)</span>
                              <input
                                type="number"
                                value={zone.price}
                                onChange={(e) => {
                                  const price = Number(e.target.value) || 0
                                  setEditEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, price } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[8px] text-neutral-500 uppercase">ROWS (comma separated)</span>
                              <input
                                type="text"
                                value={(zone.rows || []).join(', ')}
                                onChange={(e) => {
                                  const rows = e.target.value
                                    .split(',')
                                    .map((r) => r.trim().toUpperCase())
                                    .filter(Boolean)
                                  setEditEventForm((prev) => ({
                                    ...prev,
                                    seatingConfig: {
                                      ...prev.seatingConfig,
                                      zones: prev.seatingConfig.zones.map((z, i) => (i === zIdx ? { ...z, rows } : z)),
                                    },
                                  }))
                                }}
                                className="contact-input !py-1 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <span className="text-[8px] text-neutral-500 uppercase">SEATS PER ROW</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="25"
                                  value={zone.seatsPerRow}
                                  onChange={(e) => {
                                    const seatsPerRow = Math.min(25, Math.max(1, Number(e.target.value) || 10))
                                    setEditEventForm((prev) => ({
                                      ...prev,
                                      seatingConfig: {
                                        ...prev.seatingConfig,
                                        zones: prev.seatingConfig.zones.map((z, i) =>
                                          i === zIdx ? { ...z, seatsPerRow } : z,
                                        ),
                                      },
                                    }))
                                  }}
                                  className="contact-input !py-1 text-xs"
                                />
                              </div>
                              {editEventForm.seatingConfig.zones.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditEventForm((prev) => ({
                                      ...prev,
                                      seatingConfig: {
                                        ...prev.seatingConfig,
                                        zones: prev.seatingConfig.zones.filter((_, i) => i !== zIdx),
                                      },
                                    }))
                                  }}
                                  className="text-red-500 hover:text-red-400 p-1 mt-3 cursor-pointer"
                                  title="Remove Zone"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Interactive Seating Layout Visual Live Preview Component! */}
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <span className="text-[10px] font-bold text-neutral-300 font-['Orbitron'] uppercase block mb-1">
                        LIVE INTERACTIVE SEATING CHART PREVIEW (CLICK SEATS TO TOGGLE OCCUPIED / RESERVED)
                      </span>
                      <SeatingChartComponent
                        seatingConfig={editEventForm.seatingConfig}
                        isOrganizerEdit={true}
                        onToggleOccupied={(seatId) => {
                          setEditEventForm((prev) => {
                            const currentConfig = prev.seatingConfig
                            const updatedZones = currentConfig.zones.map((z) => {
                              const isOccupied = z.occupiedSeats?.includes(seatId)
                              let newOccupied
                              if (isOccupied) {
                                newOccupied = z.occupiedSeats.filter((s) => s !== seatId)
                              } else {
                                newOccupied = [...(z.occupiedSeats || []), seatId]
                              }
                              return { ...z, occupiedSeats: newOccupied }
                            })
                            return {
                              ...prev,
                              seatingConfig: { ...currentConfig, zones: updatedZones },
                            }
                          })
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">DESCRIPTION</label>
                <textarea
                  rows={3}
                  placeholder="Event details..."
                  value={editEventForm.description}
                  onChange={(e) => setEditEventForm({ ...editEventForm, description: e.target.value })}
                  className="add-event-input resize-none"
                />
              </div>

              {editEventFeedback.text && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${editEventFeedback.type === 'error' ? 'bg-red-950/80 border border-red-500/50 text-red-300' : 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'}`}
                >
                  {editEventFeedback.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditEventModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-['Orbitron'] uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={editEventPublishing}
                  className="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(255,0,0,0.5)] cursor-pointer"
                >
                  {editEventPublishing ? 'SAVING...' : 'UPDATE EVENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ EVENT DETAILS VIEW MODAL ══════════════ */}
      {selectedDetailEvent && (
        <div
          className="event-detail-modal-backdrop animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseEventDetails}
        >
          <div className="event-detail-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Cyber Brackets */}
            <div className="cyber-bracket cyber-bracket--tl" />
            <div className="cyber-bracket cyber-bracket--br" />

            {/* Main Landscape Grid Container */}
            <div className="grid grid-cols-1 md:grid-cols-12 h-full max-h-[85vh] overflow-hidden min-h-0">
              {/* LEFT COLUMN: Cover Poster & Title (5 cols) */}
              <div
                className="md:col-span-5 relative flex flex-col justify-between p-6 bg-cover bg-center min-h-[260px] md:min-h-full border-b md:border-b-0 md:border-r border-white/10 shrink-0"
                style={selectedDetailEvent.cover ? { backgroundImage: `url(${selectedDetailEvent.cover})` } : undefined}
              >
                {!selectedDetailEvent.cover && (
                  <EventPoster
                    title={selectedDetailEvent.title}
                    className="absolute inset-0 w-full h-full rounded-none"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/60 to-black/30" />

                {/* Top Badges */}
                <div className="relative z-10 flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full bg-red-950/90 border border-red-500/60 text-red-400 text-[10px] font-bold font-['Orbitron'] tracking-widest uppercase shadow-md">
                    {selectedDetailEvent.category || selectedDetailEvent.genre || 'LIVE EVENT'}
                  </span>
                  <span
                    className={`event-detail-status-pill ${selectedDetailInventory?.className || ''}`}
                    title={selectedDetailInventory?.detail}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {selectedDetailInventory?.label || 'AVAILABLE NOW'}
                  </span>
                </div>

                {/* Bottom Poster Details */}
                <div className="relative z-10 mt-auto pt-6">
                  <div className="text-[11px] text-red-400 font-['Orbitron'] font-bold tracking-widest uppercase mb-1 drop-shadow">
                    FEATURED: {selectedDetailEvent.artistOrOrganizer || selectedDetailEvent.subtitle || 'EXVO LIVE'}
                  </div>
                  <h2 className="text-xl sm:text-3xl font-black font-['Orbitron'] text-white tracking-wide leading-tight drop-shadow-md mb-1">
                    {selectedDetailEvent.title}
                  </h2>
                </div>
              </div>

              {/* RIGHT COLUMN: Info & Ticket Tiers (7 cols) */}
              <div className="md:col-span-7 flex flex-col h-full bg-[#0a0a0c] overflow-hidden min-h-0">
                {/* Header with Close button */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02] shrink-0">
                  <div className="text-xs font-bold font-['Orbitron'] text-red-400 tracking-widest uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    EVENT INFORMATION & PASSES
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseEventDetails}
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:border-red-500 hover:bg-red-950/80 text-white hover:text-red-400 flex items-center justify-center text-sm transition-all cursor-pointer"
                    aria-label="Close details"
                  >
                    ×
                  </button>
                </div>

                {/* Content Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar min-h-0">
                  {/* Info Tiles Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="event-detail-info-tile">
                      <div className="text-[10px] text-neutral-400 font-['Orbitron'] font-bold tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        DATE
                      </div>
                      <div className="text-xs font-bold text-white">
                        {formatSelectedDate(selectedDetailEvent.eventDate, selectedDetailEvent.eventTime) ||
                          selectedDetailEvent.date ||
                          'Sep 26, 2026'}
                      </div>
                    </div>

                    <div className="event-detail-info-tile">
                      <div className="text-[10px] text-neutral-400 font-['Orbitron'] font-bold tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        TIME
                      </div>
                      <div className="text-xs font-bold text-white">{extractTimeFromEvent(selectedDetailEvent)}</div>
                    </div>

                    <div className="event-detail-info-tile">
                      <div className="text-[10px] text-neutral-400 font-['Orbitron'] font-bold tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        VENUE
                      </div>
                      <div className="text-xs font-bold text-white truncate" title={selectedDetailEvent.venue}>
                        {selectedDetailEvent.venue || 'Colombo, Sri Lanka'}
                      </div>
                    </div>

                    <div className="event-detail-info-tile">
                      <div className="text-[10px] text-neutral-400 font-['Orbitron'] font-bold tracking-wider uppercase mb-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 010 4 2 2 0 00-2 2v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 00-2-2 2 2 0 010-4 2 2 0 002-2V7a2 2 0 00-2-2H5z"
                          />
                        </svg>
                        PRICE RANGE
                      </div>
                      <div className="text-xs font-bold text-red-400 font-['Orbitron']">
                        {(() => {
                          let tiers = selectedDetailEvent.ticketTiers
                          if (typeof tiers === 'string') {
                            try {
                              tiers = JSON.parse(tiers)
                            } catch {}
                          }
                          if (
                            (!tiers || !Array.isArray(tiers) || tiers.length === 0) &&
                            selectedDetailEvent.ticketTiersJson
                          ) {
                            try {
                              tiers =
                                typeof selectedDetailEvent.ticketTiersJson === 'string'
                                  ? JSON.parse(selectedDetailEvent.ticketTiersJson)
                                  : selectedDetailEvent.ticketTiersJson
                            } catch {}
                          }
                          if (Array.isArray(tiers) && tiers.length > 0) {
                            const prices = tiers.map((t) => Number(t.price) || 0).filter((p) => p > 0)
                            if (prices.length > 0) {
                              const minP = Math.min(...prices)
                              const maxP = Math.max(...prices)
                              if (minP < maxP) {
                                return `LKR ${minP.toLocaleString()} - ${maxP.toLocaleString()}`
                              }
                              return `LKR ${minP.toLocaleString()}`
                            }
                          }
                          return selectedDetailEvent.price
                            ? `LKR ${Number(selectedDetailEvent.price).toLocaleString()}`
                            : 'LKR 2,500'
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Event Overview / Description */}
                  <div className="space-y-1.5 bg-white/[0.02] border border-white/10 rounded-xl p-3">
                    <div className="text-[11px] font-bold font-['Orbitron'] text-red-400 tracking-widest uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      OVERVIEW
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed font-sans whitespace-pre-line">
                      {selectedDetailEvent.description ||
                        `Experience an extraordinary live event featuring top performance artists, cutting-edge stage lighting, sound systems, and an unparalleled atmosphere. Secure your passes now to lock in your access to Sri Lanka's premiere event.`}
                    </p>
                  </div>

                  {selectedDetailInventory?.disabled && (
                    <div className="event-inventory-message">
                      <div className="event-inventory-message__title">{selectedDetailInventory.label}</div>
                      <div>{selectedDetailInventory.detail}</div>
                    </div>
                  )}

                  {/* Ticket Categories & Pricing Tiers */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold font-['Orbitron'] text-neutral-300 tracking-widest uppercase flex items-center justify-between">
                      <span>AVAILABLE TICKET CATEGORIES</span>
                      <span className="text-[9px] text-neutral-400 font-normal">LIMITED PASSES</span>
                    </div>

                    <div className="space-y-2">
                      {(() => {
                        let tiers = selectedDetailEvent.ticketTiers
                        if (typeof tiers === 'string') {
                          try {
                            tiers = JSON.parse(tiers)
                          } catch {}
                        }
                        if (
                          (!tiers || !Array.isArray(tiers) || tiers.length === 0) &&
                          selectedDetailEvent.ticketTiersJson
                        ) {
                          try {
                            tiers =
                              typeof selectedDetailEvent.ticketTiersJson === 'string'
                                ? JSON.parse(selectedDetailEvent.ticketTiersJson)
                                : selectedDetailEvent.ticketTiersJson
                          } catch {}
                        }
                        const finalTiers =
                          Array.isArray(tiers) && tiers.length > 0
                            ? tiers
                            : [
                                {
                                  name: 'General Admission Pass',
                                  price: selectedDetailEvent.price || 2500,
                                  quantity: selectedDetailEvent.totalCapacity || 500,
                                },
                                {
                                  name: 'VIP Priority Access Pass',
                                  price: (selectedDetailEvent.price || 2500) * 2,
                                  quantity: Math.round((selectedDetailEvent.totalCapacity || 500) * 0.2),
                                },
                              ]

                        return finalTiers.map((tier, idx) => {
                          const tierInventory = getTierInventoryMeta(
                            eventInventoryById[String(selectedDetailEvent.id)],
                            tier,
                            idx,
                          )
                          return (
                            <div
                              key={idx}
                              className={`event-detail-tier-card ${tierInventory.disabled ? `event-detail-tier-card--unavailable ${tierInventory.className}` : ''}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-500 text-xs font-bold font-['Orbitron']">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="text-xs font-bold font-['Orbitron'] text-white">
                                    {tier.name || tier.tierName}
                                  </div>
                                  <div className="text-[10px] text-neutral-400">
                                    {tierInventory.detail}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-black font-['Orbitron'] text-red-400">
                                  LKR {(Number(tier.price) || 0).toLocaleString()}
                                </div>
                                <div
                                  className={`text-[9px] font-bold uppercase ${
                                    tierInventory.disabled
                                      ? tierInventory.className === 'is-temporarily-held'
                                        ? 'text-amber-300'
                                        : 'text-neutral-300'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {tierInventory.label}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Footer */}
                <div className="p-3.5 bg-neutral-900/90 border-t border-white/10 flex items-center justify-between gap-3 shrink-0 mt-auto">
                  <button
                    type="button"
                    onClick={handleCloseEventDetails}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-['Orbitron'] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    CLOSE
                  </button>

                  <button
                    type="button"
                    disabled={selectedDetailInventory?.disabled}
                    onClick={() => {
                      if (selectedDetailInventory?.disabled) return
                      const eventToBook = selectedDetailEvent
                      handleCloseEventDetails()
                      handleOpenBooking(eventToBook)
                    }}
                    className={`px-5 py-2 rounded-xl text-xs font-['Orbitron'] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 ${
                      selectedDetailInventory?.disabled
                        ? 'bg-neutral-700 text-neutral-300 border border-neutral-500/50 cursor-not-allowed shadow-none'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(255,0,0,0.5)] cursor-pointer'
                    }`}
                  >
                    <span>{selectedDetailInventory?.disabled ? selectedDetailInventory.label : 'GET TICKETS NOW'}</span>
                    {!selectedDetailInventory?.disabled && (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

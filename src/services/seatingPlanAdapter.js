export const seatingConfigToBookingPlan = (config, ticketTiers = []) => ({
  id: config?.planId,
  name: 'Event seating plan',
  isVisibleToAttendees: Boolean(config?.enabled),
  sections: (config?.zones || []).map((zone, index) => {
    const matchingTier =
      ticketTiers.find((tier) => zone.ticketTierId && String(tier.id) === String(zone.ticketTierId)) ||
      ticketTiers.find((tier) => tier.name?.trim().toUpperCase() === zone.name?.trim().toUpperCase()) ||
      ticketTiers.find((tier) => Number(zone.price) > 0 && Number(tier.price) === Number(zone.price))
    const rawTierId = zone.ticketTierId ?? matchingTier?.id
    const parsedTierId = Number(rawTierId)
    const ticketTierId =
      Number.isSafeInteger(parsedTierId) && parsedTierId > 0 && parsedTierId <= 2147483647 ? parsedTierId : null

    return {
      id: Number.isInteger(Number(zone.id)) && Number(zone.id) > 0 ? Number(zone.id) : null,
      name: String(zone.name || '').trim() || `Section ${index + 1}`,
      rowCount: Array.isArray(zone.rows) ? zone.rows.length : 0,
      rowLabels: (zone.rows || []).map((row) => String(row).trim().toUpperCase()).filter(Boolean),
      seatsPerRow: Number(zone.seatsPerRow) || 0,
      startingRowLabel:
        String(zone.rows?.[0] || '')
          .trim()
          .toUpperCase() || String.fromCharCode(65 + index),
      startingSeatNumber: Math.max(1, Number(zone.startingSeatNumber) || 1),
      ticketTierId,
      price: Number(zone.price) || Number(matchingTier?.price) || 0,
      displayOrder: index,
      disabledSeatCodes: (zone.occupiedSeats || []).map((code) => {
        const match = String(code).match(/^([A-Z]+)(\d+)$/i)
        return match ? `${match[1].toUpperCase()}-${Number(match[2]).toString().padStart(2, '0')}` : code
      }),
    }
  }),
})

export const seatMatchesTicketTier = (seat, tier) =>
  (seat?.ticketTierId != null && tier?.id != null && String(seat.ticketTierId) === String(tier.id)) ||
  Number(seat?.price) === Number(tier?.price)

export const canSelectSeatForTicketTier = (seat, tier, selectedSeats, tierQuantity) =>
  seatMatchesTicketTier(seat, tier) &&
  selectedSeats.filter((selectedSeat) => seatMatchesTicketTier(selectedSeat, tier)).length < Number(tierQuantity || 0)

export const seatingZoneForTier = (config, tier) =>
  (config?.zones || []).find(
    (candidate) => candidate.ticketTierId && tier?.id && String(candidate.ticketTierId) === String(tier.id),
  ) ||
  (config?.zones || []).find(
    (candidate) => candidate.name?.trim().toUpperCase() === tier?.name?.trim().toUpperCase(),
  ) ||
  (config?.zones || []).find(
    (candidate) => Number(candidate.price) > 0 && Number(candidate.price) === Number(tier?.price),
  )

export const seatingAllocationErrors = (config, tiers) => {
  if (!config?.enabled) return []
  const zones = config.zones || []
  if (!zones.length) return ['Add at least one seating zone before enabling seat selection.']
  const errors = []
  const tierAllocations = new Map()
  const rowOwners = new Map()
  for (const [index, zone] of zones.entries()) {
    const rowLabels = (zone.rows || []).map((row) => String(row).trim().toUpperCase()).filter(Boolean)
    const rows = [...new Set(rowLabels)]
    const seatsPerRow = Number(zone.seatsPerRow)
    const seats = rows.length * seatsPerRow
    const tier =
      tiers.find((item) => zone.ticketTierId && String(zone.ticketTierId) === String(item.id)) ||
      tiers.find((item) => item.name?.trim().toUpperCase() === zone.name?.trim().toUpperCase()) ||
      tiers.find((item) => Number(zone.price) > 0 && Number(item.price) === Number(zone.price))
    for (const row of rows) {
      if (rowOwners.has(row)) errors.push(`Row ${row} is assigned to more than one seating zone.`)
      else rowOwners.set(row, zone.name || `Seating zone ${index + 1}`)
    }
    if (!tier) {
      errors.push(`${zone.name || `Seating zone ${index + 1}`} must match a ticket category.`)
    } else if (!rows.length || !Number.isInteger(seatsPerRow) || seatsPerRow < 1) {
      errors.push(`Seating zone ${zone.name || index + 1} needs at least one row and a seat count per row.`)
    } else if (rows.length !== rowLabels.length) {
      errors.push(`Seating zone ${zone.name || index + 1} cannot repeat row labels.`)
    } else if (seatsPerRow > 20) {
      errors.push(`Seating zone ${zone.name || index + 1} cannot have more than 20 seats per row.`)
    }
    if (tier) {
      const key = String(tier.id || `${tier.name}:${tier.price}`).toUpperCase()
      const allocation = tierAllocations.get(key) || { tier, seats: 0 }
      allocation.seats += seats
      tierAllocations.set(key, allocation)
    }
  }
  for (const { tier, seats } of tierAllocations.values()) {
    if (Number(tier.quantity) > 0 && seats > Number(tier.quantity)) {
      errors.push(`${tier.name} has more seats than its ticket quantity.`)
    }
  }
  return errors
}
